import { asc, eq, inArray } from 'drizzle-orm';
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import type { Db } from '../db/client';
import {
  assignmentSubmissions,
  assignments,
  attendanceRecords,
  attendanceSessions,
  courses,
  discussionGrades,
  discussionPosts,
  discussionTopics,
  enrollments,
  fileAssets,
  finalGrades,
  groupSubmissions,
  modules,
  presentations,
  quizAnswers,
  quizAttempts,
  quizQuestions,
  quizzes,
  readingMaterials,
  studentProfiles,
  users,
} from '../db/schema';

// ---------------------------------------------------------------------------
// The export is built in two phases so it composes with a Cloudflare Workflow:
//   1. gatherCourseExport — pure DB work → a JSON-serializable manifest of
//      every text entry (already rendered to strings) plus the list of binary
//      file entries (R2 object keys) to stream. Small enough to pass between
//      workflow steps.
//   2. buildAndStoreZip — streams each binary from R2 into a ZIP and uploads
//      the archive to R2 via multipart, so neither the inputs nor the output
//      are ever fully buffered in Worker memory.
// ---------------------------------------------------------------------------

export interface ExportTextEntry {
  path: string;
  content: string;
}
export interface ExportFileEntry {
  path: string;
  objectKey: string;
  sizeBytes: number | null;
}
export interface ExportManifest {
  course: { id: string; code: string; title: string; termLabel: string | null };
  generatedAt: string;
  textEntries: ExportTextEntry[];
  fileEntries: ExportFileEntry[];
  missingFiles: { path: string; reason: string }[];
}

// Keep any Unicode letter/number (so CJK student names survive — fflate marks
// non-ASCII entry names with the zip UTF-8/EFS flag); strip everything else
// that could be path-unsafe.
export function sanitize(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^\p{L}\p{N}._ -]+/gu, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || 'untitled').slice(0, 80);
}
function pad(n: number): string {
  return String(n + 1).padStart(2, '0');
}
function num(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}
function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function json(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}

// Render a stored quiz answer as human-readable text. Choice answers are
// option indexes (see services/quizGrading.ts), so map them back to the
// option text; free-text answers pass through.
function renderQuizAnswerText(type: string, options: unknown, answer: unknown): string {
  if (type === 'true_false') {
    if (answer === null || answer === undefined || answer === '') return '(no answer)';
    const s = String(answer).trim().toLowerCase();
    if (['true', 't', '1', 'yes'].includes(s)) return 'True';
    if (['false', 'f', '0', 'no'].includes(s)) return 'False';
    return String(answer);
  }
  const opts = Array.isArray(options) ? options.map((o) => String(o)) : null;
  if (opts && ['single_choice', 'multi_choice', 'multiple_choice'].includes(type)) {
    const raw = Array.isArray(answer)
      ? answer
      : answer === null || answer === undefined || answer === ''
        ? []
        : [answer];
    const picked = raw
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n >= 0)
      .map((n) => (opts[n] !== undefined ? `${n + 1}. ${opts[n]}` : `option ${n + 1}`));
    return picked.length ? picked.join('; ') : '(no answer)';
  }
  if (answer === null || answer === undefined || answer === '') return '(no answer)';
  return typeof answer === 'string' ? answer : JSON.stringify(answer);
}

type ReadyAsset = {
  id: string;
  objectKey: string;
  originalFilename: string | null;
  sizeBytes: number | null;
  relatedType: string | null;
  relatedId: string | null;
};

/**
 * Gather everything needed to build a course export ZIP into a serializable
 * manifest: rendered text files (syllabus.md, calendar.json, metadata.json,
 * requirement.md, final_grades.csv, attendance.csv, README) and the list of
 * binary files (by R2 object key) to stream in.
 *
 * Grades policy: the export carries each student's FINAL grade only — per-item
 * assignment/quiz scores are deliberately not included (the gradebook stays the
 * source for itemized scores). Submissions are exported with their attachments.
 */
export async function gatherCourseExport(db: Db, courseId: string): Promise<ExportManifest | null> {
  const [course] = await db
    .select({
      id: courses.id,
      code: courses.code,
      title: courses.title,
      termLabel: courses.termLabel,
      startDate: courses.startDate,
      endDate: courses.endDate,
      meetingSlotsJson: courses.meetingSlotsJson,
      moduleCadence: courses.moduleCadence,
      syllabusMd: courses.syllabusMd,
      syllabusFileAssetId: courses.syllabusFileAssetId,
    })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  if (!course) return null;

  const generatedAt = new Date().toISOString();
  const textEntries: ExportTextEntry[] = [];
  const fileEntries: ExportFileEntry[] = [];
  const missingFiles: { path: string; reason: string }[] = [];

  // Ready file assets for the course, indexed by id and by (relatedType, relatedId).
  const assetRows = (await db
    .select({
      id: fileAssets.id,
      objectKey: fileAssets.objectKey,
      originalFilename: fileAssets.originalFilename,
      sizeBytes: fileAssets.sizeBytes,
      relatedType: fileAssets.relatedType,
      relatedId: fileAssets.relatedId,
      status: fileAssets.status,
    })
    .from(fileAssets)
    .where(eq(fileAssets.courseId, courseId))) as Array<ReadyAsset & { status: string }>;
  const assetById = new Map<string, ReadyAsset>();
  const assetsByRelated = new Map<string, ReadyAsset[]>();
  for (const a of assetRows) {
    if (a.status !== 'ready') continue;
    assetById.set(a.id, a);
    if (a.relatedType && a.relatedId) {
      const key = `${a.relatedType}:${a.relatedId}`;
      const list = assetsByRelated.get(key) ?? [];
      list.push(a);
      assetsByRelated.set(key, list);
    }
  }

  // Add a binary entry into the zip from a file-asset id; notes if missing/not
  // ready. `seen` (object keys already added) dedupes within one folder when a
  // file is reachable through several links (e.g. row fileAssetId + related).
  function addFileById(folder: string, fileAssetId: string | null, seen?: Set<string>): void {
    if (!fileAssetId) return;
    const a = assetById.get(fileAssetId);
    if (!a) {
      missingFiles.push({ path: folder, reason: `file asset ${fileAssetId} missing or not ready` });
      return;
    }
    if (seen?.has(a.objectKey)) return;
    seen?.add(a.objectKey);
    fileEntries.push({
      path: `${folder}${sanitize(a.originalFilename ?? fileAssetId)}`,
      objectKey: a.objectKey,
      sizeBytes: a.sizeBytes,
    });
  }
  function addRelatedFiles(
    folder: string,
    relatedType: string,
    relatedId: string,
    seen?: Set<string>,
  ): void {
    for (const a of assetsByRelated.get(`${relatedType}:${relatedId}`) ?? []) {
      if (seen?.has(a.objectKey)) continue;
      seen?.add(a.objectKey);
      fileEntries.push({
        path: `${folder}${sanitize(a.originalFilename ?? a.id)}`,
        objectKey: a.objectKey,
        sizeBytes: a.sizeBytes,
      });
    }
  }

  // ---- Users: every enrolled student + anyone who submitted/posted ----
  const enrolledRows = await db
    .select({ studentId: enrollments.studentId, status: enrollments.status })
    .from(enrollments)
    .where(eq(enrollments.courseId, courseId));
  const userIds = new Set<string>(enrolledRows.map((e) => e.studentId));

  // ---- Syllabus + teaching calendar ----
  if (course.syllabusMd) {
    textEntries.push({ path: 'syllabus.md', content: course.syllabusMd });
  }
  addFileById('syllabus/', course.syllabusFileAssetId);
  const moduleRows = await db
    .select()
    .from(modules)
    .where(eq(modules.courseId, courseId))
    .orderBy(asc(modules.position));
  textEntries.push({
    path: 'calendar.json',
    content: json({
      startDate: course.startDate,
      endDate: course.endDate,
      // Weekly meeting slots: { day: 0-6 (Sun-Sat), start: 'HH:MM', end: 'HH:MM' }.
      meetingSlots: course.meetingSlotsJson,
      moduleCadence: course.moduleCadence,
      modules: moduleRows.map((m) => ({
        title: m.title,
        description: m.description,
        status: m.status,
        position: m.position,
        startAt: m.startAt,
        endAt: m.endAt,
        closedAt: m.closedAt,
      })),
    }),
  });

  // ---- Reading materials ----
  const materials = await db
    .select()
    .from(readingMaterials)
    .where(eq(readingMaterials.courseId, courseId))
    .orderBy(asc(readingMaterials.position));
  materials.forEach((m, i) => {
    const folder = `materials/${pad(i)}-${sanitize(m.title)}/`;
    textEntries.push({
      path: `${folder}metadata.json`,
      content: json({
        title: m.title,
        description: m.description,
        type: m.type,
        sourceType: m.sourceType,
        status: m.status,
        externalUrl: m.externalUrl,
      }),
    });
    if (m.sourceType === 'manual_text' && m.content) {
      textEntries.push({ path: `${folder}content.md`, content: m.content });
    } else if (m.sourceType === 'external_link' && m.externalUrl) {
      textEntries.push({ path: `${folder}external_url.txt`, content: m.externalUrl });
    } else if (m.sourceType === 'upload') {
      addFileById(folder, m.fileAssetId);
    }
  });

  // ---- Presentations (module PPT decks) ----
  // Decks live on presentations.fileAssetId (mirrored into R2 by the Gamma
  // poller with an opaque `<jobId>.pptx` filename), so the zip entry is named
  // after the presentation title instead of the asset's original filename.
  const moduleTitleById = new Map(moduleRows.map((m) => [m.id, m.title]));
  const presentationRows = await db
    .select()
    .from(presentations)
    .where(eq(presentations.courseId, courseId))
    .orderBy(asc(presentations.position), asc(presentations.createdAt));
  presentationRows.forEach((p, i) => {
    const folder = `materials/presentations/${pad(i)}-${sanitize(p.title)}/`;
    textEntries.push({
      path: `${folder}metadata.json`,
      content: json({
        title: p.title,
        description: p.description,
        module: p.moduleId ? (moduleTitleById.get(p.moduleId) ?? null) : null,
        status: p.status,
        provider: p.provider,
        externalUrl: p.externalUrl,
      }),
    });
    if (p.fileAssetId) {
      const a = assetById.get(p.fileAssetId);
      if (!a) {
        missingFiles.push({
          path: folder,
          reason: `file asset ${p.fileAssetId} missing or not ready`,
        });
      } else {
        const ext = (a.originalFilename ?? a.objectKey).match(/\.[A-Za-z0-9]+$/)?.[0] ?? '';
        fileEntries.push({
          path: `${folder}${sanitize(p.title)}${ext}`,
          objectKey: a.objectKey,
          sizeBytes: a.sizeBytes,
        });
      }
    } else if (p.externalUrl) {
      textEntries.push({ path: `${folder}external_url.txt`, content: p.externalUrl });
    }
  });

  // ---- Assignments + submissions ----
  const assignmentRows = await db
    .select()
    .from(assignments)
    .where(eq(assignments.courseId, courseId))
    .orderBy(asc(assignments.createdAt));
  const assignmentIds = assignmentRows.map((a) => a.id);
  const subs = assignmentIds.length
    ? await db
        .select()
        .from(assignmentSubmissions)
        .where(inArray(assignmentSubmissions.assignmentId, assignmentIds))
    : [];
  const groupSubs = assignmentIds.length
    ? await db
        .select()
        .from(groupSubmissions)
        .where(inArray(groupSubmissions.assignmentId, assignmentIds))
    : [];
  const groupSubById = new Map(groupSubs.map((g) => [g.id, g]));
  const subsByAssignment = new Map<string, typeof subs>();
  for (const s of subs) {
    userIds.add(s.studentId);
    const list = subsByAssignment.get(s.assignmentId) ?? [];
    list.push(s);
    subsByAssignment.set(s.assignmentId, list);
  }
  // All member-row ids per group submission. Group files are uploaded against
  // the uploading member's own row (see routes/assignments.ts, the attachment
  // "unit"), so a member folder must union files across every sibling row —
  // otherwise a teammate's upload looks missing from this student's export.
  const rowIdsByGroupSub = new Map<string, string[]>();
  for (const s of subs) {
    if (!s.groupSubmissionId) continue;
    const list = rowIdsByGroupSub.get(s.groupSubmissionId) ?? [];
    list.push(s.id);
    rowIdsByGroupSub.set(s.groupSubmissionId, list);
  }

  // ---- Quizzes + questions + attempts + answers ----
  const quizRows = await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.courseId, courseId))
    .orderBy(asc(quizzes.createdAt));
  const quizIds = quizRows.map((q) => q.id);
  const questions = quizIds.length
    ? await db
        .select()
        .from(quizQuestions)
        .where(inArray(quizQuestions.quizId, quizIds))
        .orderBy(asc(quizQuestions.position))
    : [];
  const attempts = quizIds.length
    ? await db.select().from(quizAttempts).where(inArray(quizAttempts.quizId, quizIds))
    : [];
  const attemptIds = attempts.map((a) => a.id);
  const answers = attemptIds.length
    ? await db.select().from(quizAnswers).where(inArray(quizAnswers.attemptId, attemptIds))
    : [];
  const questionsByQuiz = new Map<string, typeof questions>();
  for (const q of questions) {
    const list = questionsByQuiz.get(q.quizId) ?? [];
    list.push(q);
    questionsByQuiz.set(q.quizId, list);
  }
  const attemptsByQuiz = new Map<string, typeof attempts>();
  for (const a of attempts) {
    userIds.add(a.studentId);
    const list = attemptsByQuiz.get(a.quizId) ?? [];
    list.push(a);
    attemptsByQuiz.set(a.quizId, list);
  }
  const answersByAttempt = new Map<string, typeof answers>();
  for (const ans of answers) {
    const list = answersByAttempt.get(ans.attemptId) ?? [];
    list.push(ans);
    answersByAttempt.set(ans.attemptId, list);
  }

  // ---- Discussions + posts + grades ----
  const topicRows = await db
    .select()
    .from(discussionTopics)
    .where(eq(discussionTopics.courseId, courseId))
    .orderBy(asc(discussionTopics.createdAt));
  const topicIds = topicRows.map((t) => t.id);
  const posts = topicIds.length
    ? await db
        .select()
        .from(discussionPosts)
        .where(inArray(discussionPosts.topicId, topicIds))
        .orderBy(asc(discussionPosts.createdAt))
    : [];
  const dGrades = topicIds.length
    ? await db.select().from(discussionGrades).where(inArray(discussionGrades.topicId, topicIds))
    : [];
  const postsByTopic = new Map<string, typeof posts>();
  for (const p of posts) {
    userIds.add(p.authorId);
    const list = postsByTopic.get(p.topicId) ?? [];
    list.push(p);
    postsByTopic.set(p.topicId, list);
  }
  const gradesByTopic = new Map<string, typeof dGrades>();
  for (const g of dGrades) {
    userIds.add(g.studentId);
    const list = gradesByTopic.get(g.topicId) ?? [];
    list.push(g);
    gradesByTopic.set(g.topicId, list);
  }

  // ---- Attendance sessions + records ----
  const sessionRows = await db
    .select()
    .from(attendanceSessions)
    .where(eq(attendanceSessions.courseId, courseId))
    .orderBy(asc(attendanceSessions.sessionDate));
  const sessionIds = sessionRows.map((s) => s.id);
  const attRecords = sessionIds.length
    ? await db
        .select()
        .from(attendanceRecords)
        .where(inArray(attendanceRecords.sessionId, sessionIds))
    : [];
  for (const r of attRecords) userIds.add(r.studentId);

  // ---- Resolve all referenced users ----
  const userRows = userIds.size
    ? await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          studentNumber: studentProfiles.studentNumber,
        })
        .from(users)
        .leftJoin(studentProfiles, eq(studentProfiles.userId, users.id))
        .where(inArray(users.id, [...userIds]))
    : [];
  const userById = new Map(userRows.map((u) => [u.id, u]));
  const labelFor = (uid: string): string => {
    const u = userById.get(uid);
    return `${sanitize(u?.name ?? 'unknown')}-${uid.slice(0, 8)}`;
  };

  // ---- Render assignment folders (now that users resolved) ----
  assignmentRows.forEach((a, i) => {
    const folder = `assignments/${pad(i)}-${sanitize(a.title)}/`;
    textEntries.push({
      path: `${folder}requirement.md`,
      content: `# ${a.title}\n\n${a.description ?? '(no description)'}\n`,
    });
    textEntries.push({
      path: `${folder}metadata.json`,
      content: json({
        title: a.title,
        maxScore: num(a.maxScore),
        status: a.status,
        submissionMode: a.submissionMode,
        dueDate: a.dueDate,
      }),
    });
    addFileById(`${folder}attachment/`, a.attachmentFileId);
    for (const s of subsByAssignment.get(a.id) ?? []) {
      const sub = `${folder}submissions/${labelFor(s.studentId)}/`;
      const gs = s.groupSubmissionId ? groupSubById.get(s.groupSubmissionId) : null;
      textEntries.push({
        path: `${sub}submission.json`,
        content: json({
          student: userById.get(s.studentId)?.name ?? null,
          email: userById.get(s.studentId)?.email ?? null,
          status: s.status,
          feedback: s.feedback,
          submittedAt: gs?.submittedAt ?? s.submittedAt,
          gradedAt: s.gradedAt,
        }),
      });
      const textBody = gs?.content ?? s.content;
      // Human-readable record: prompt, the student's answer and the teacher's
      // feedback in one file (replaces the bare answer.txt).
      textEntries.push({
        path: `${sub}submission.md`,
        content:
          `# ${a.title} — ${userById.get(s.studentId)?.name ?? 'unknown'}\n\n` +
          `## Assignment\n\n${a.description ?? '(no description)'}\n\n` +
          `## Student answer\n\n${textBody ?? '(no text answer — see files/)'}\n\n` +
          `## Teacher feedback\n\n${s.feedback ?? '(none)'}\n`,
      });
      // Submission files: for group mode the unit is the whole team — union
      // related files across sibling rows, plus both row-level file links.
      const unitRowIds = s.groupSubmissionId
        ? (rowIdsByGroupSub.get(s.groupSubmissionId) ?? [s.id])
        : [s.id];
      const seenFiles = new Set<string>();
      for (const rowId of unitRowIds) {
        addRelatedFiles(`${sub}files/`, 'submission', rowId, seenFiles);
      }
      addFileById(`${sub}files/`, s.fileAssetId, seenFiles);
      if (gs?.fileAssetId) addFileById(`${sub}files/`, gs.fileAssetId, seenFiles);
    }
  });

  // ---- Render quiz folders ----
  quizRows.forEach((q, i) => {
    const folder = `quizzes/${pad(i)}-${sanitize(q.title)}/`;
    textEntries.push({
      path: `${folder}metadata.json`,
      content: json({
        title: q.title,
        description: q.description,
        maxScore: num(q.maxScore),
        status: q.status,
        timeLimitMinutes: q.timeLimitMinutes,
        maxAttempts: q.maxAttempts,
      }),
    });
    textEntries.push({
      path: `${folder}questions.json`,
      content: json(
        (questionsByQuiz.get(q.id) ?? []).map((qq) => ({
          position: qq.position,
          prompt: qq.prompt,
          type: qq.type,
          points: num(qq.points),
          options: qq.options,
          correctAnswers: qq.correctAnswers,
          explanation: qq.explanation,
        })),
      ),
    });
    const perStudentCount = new Map<string, number>();
    for (const at of attemptsByQuiz.get(q.id) ?? []) {
      const n = (perStudentCount.get(at.studentId) ?? 0) + 1;
      perStudentCount.set(at.studentId, n);
      const suffix = n > 1 ? `-attempt${n}` : '';
      const af = `${folder}attempts/${labelFor(at.studentId)}${suffix}/`;
      textEntries.push({
        path: `${af}attempt.json`,
        content: json({
          student: userById.get(at.studentId)?.name ?? null,
          email: userById.get(at.studentId)?.email ?? null,
          status: at.status,
          startedAt: at.startedAt,
          submittedAt: at.submittedAt,
          teacherReviewed: at.teacherReviewed,
        }),
      });
      textEntries.push({
        path: `${af}answers.json`,
        content: json(
          (answersByAttempt.get(at.id) ?? []).map((ans) => ({
            questionId: ans.questionId,
            answer: ans.answer,
            isCorrect: ans.isCorrect,
          })),
        ),
      });
      // Human-readable review sheet: each question with the student's answer,
      // correctness and the teacher's feedback.
      const answerByQuestion = new Map(
        (answersByAttempt.get(at.id) ?? []).map((ans) => [ans.questionId, ans]),
      );
      const mdParts: string[] = [
        `# ${q.title} — ${userById.get(at.studentId)?.name ?? 'unknown'}${n > 1 ? ` (attempt ${n})` : ''}`,
        '',
      ];
      (questionsByQuiz.get(q.id) ?? []).forEach((qq, qi) => {
        mdParts.push(`## Q${qi + 1}. ${qq.prompt}`, '');
        const opts = Array.isArray(qq.options) ? qq.options : null;
        if (opts && opts.length) {
          mdParts.push(...opts.map((o, oi) => `${oi + 1}. ${String(o)}`), '');
        }
        const ans = answerByQuestion.get(qq.id);
        mdParts.push(
          `**Student answer:** ${renderQuizAnswerText(qq.type, qq.options, ans?.answer)}`,
        );
        mdParts.push(
          `**Result:** ${
            ans?.isCorrect === true
              ? 'correct'
              : ans?.isCorrect === false
                ? 'incorrect'
                : 'pending review'
          }`,
        );
        if (ans?.feedback) mdParts.push(`**Teacher feedback:** ${ans.feedback}`);
        mdParts.push('');
      });
      textEntries.push({ path: `${af}answers.md`, content: mdParts.join('\n') });
    }
  });

  // ---- Render discussion folders ----
  topicRows.forEach((tpc, i) => {
    const folder = `discussions/${pad(i)}-${sanitize(tpc.title)}/`;
    textEntries.push({
      path: `${folder}metadata.json`,
      content: json({
        title: tpc.title,
        description: tpc.description,
        prompt: tpc.prompt,
        isGraded: tpc.isGraded,
        maxScore: num(tpc.maxScore),
        status: tpc.status,
      }),
    });
    textEntries.push({
      path: `${folder}posts.json`,
      content: json(
        (postsByTopic.get(tpc.id) ?? []).map((p) => ({
          author: userById.get(p.authorId)?.name ?? null,
          parentId: p.parentId,
          content: p.isDeleted ? '[deleted]' : p.content,
          createdAt: p.createdAt,
        })),
      ),
    });
    if (tpc.isGraded) {
      // Scores stay out of the export (final grade only) — keep the written
      // feedback, which is part of the student's record but not a score.
      for (const g of gradesByTopic.get(tpc.id) ?? []) {
        if (!g.feedback) continue;
        textEntries.push({
          path: `${folder}feedback/${labelFor(g.studentId)}.json`,
          content: json({
            student: userById.get(g.studentId)?.name ?? null,
            email: userById.get(g.studentId)?.email ?? null,
            feedback: g.feedback,
            gradedAt: g.gradedAt,
          }),
        });
      }
    }
  });

  // ---- final_grades.csv — one row per enrollment, final grade only ----
  // Per-item assignment/quiz scores are deliberately not exported. Finals are
  // read from the cached final_grades table (not recomputed here: recalculating
  // stamps finalizedAt/finalizedById, a side effect an export must not have),
  // so an Outdated column flags rows the gradebook hasn't refreshed yet.
  const finals = await db.select().from(finalGrades).where(eq(finalGrades.courseId, courseId));
  const finalByStudent = new Map(finals.map((f) => [f.studentId, f]));
  const rows: string[] = [
    'Student,Student ID,Email,Enrollment Status,Final Score,Letter Grade,Outdated',
  ];
  const roster = [...enrolledRows].sort((a, b) =>
    (userById.get(a.studentId)?.name ?? '').localeCompare(userById.get(b.studentId)?.name ?? ''),
  );
  for (const e of roster) {
    const u = userById.get(e.studentId);
    const f = finalByStudent.get(e.studentId);
    rows.push(
      [
        csvCell(u?.name ?? ''),
        csvCell(u?.studentNumber ?? ''),
        csvCell(u?.email ?? ''),
        csvCell(e.status),
        csvCell(f ? num(f.teacherOverrideScore ?? f.score) : null),
        csvCell(f?.letterGrade ?? null),
        csvCell(f?.isOutdated ? 'yes' : null),
      ].join(','),
    );
  }
  textEntries.push({ path: 'final_grades.csv', content: rows.join('\n') });

  // ---- attendance.csv — student × session matrix ----
  // One row per enrolled student, one column per session (chronological); the
  // cell is that student's recorded status, blank when nothing was recorded.
  const statusBySessionStudent = new Map<string, string>();
  for (const r of attRecords) {
    statusBySessionStudent.set(`${r.sessionId}:${r.studentId}`, r.status);
  }
  const attRows = [
    [
      'Student',
      'Student ID',
      ...sessionRows.map((s) => csvCell(`${s.title} (${s.sessionDate.slice(0, 10)})`)),
    ].join(','),
  ];
  for (const e of roster) {
    const u = userById.get(e.studentId);
    attRows.push(
      [
        csvCell(u?.name ?? ''),
        csvCell(u?.studentNumber ?? ''),
        ...sessionRows.map((s) =>
          csvCell(statusBySessionStudent.get(`${s.id}:${e.studentId}`) ?? null),
        ),
      ].join(','),
    );
  }
  textEntries.push({ path: 'attendance.csv', content: attRows.join('\n') });

  // ---- README ----
  textEntries.push({
    path: 'README.txt',
    content:
      `CourseWise export\n` +
      `Course: ${course.title} (${course.code})${course.termLabel ? ` · ${course.termLabel}` : ''}\n` +
      `Generated: ${generatedAt}\n\n` +
      `Contents:\n` +
      `  syllabus.md, syllabus/ — course syllabus (text and/or uploaded file), when set\n` +
      `  calendar.json          — teaching calendar: course dates, weekly meeting slots, module windows\n` +
      `  final_grades.csv       — each student's final grade (score + letter); per-item scores are not exported\n` +
      `  attendance.csv         — student × session attendance matrix\n` +
      `  materials/             — reading materials (metadata + files / links)\n` +
      `  materials/presentations/ — presentation decks (PPT downloads / links) with module info\n` +
      `  assignments/<item>/    — requirement + per-student submission.md (prompt, answer, feedback) and files\n` +
      `  quizzes/<item>/        — questions + per-attempt answers.md (questions, answers, review) and JSON\n` +
      `  discussions/<item>/    — posts + per-student feedback\n` +
      `\nFinal grades reflect the gradebook's last recalculation; a "yes" in the` +
      ` Outdated column means newer submissions may not be included yet.\n` +
      (missingFiles.length
        ? `\nNote: ${missingFiles.length} referenced file(s) were missing or not ready and were skipped.\n`
        : ''),
  });

  return {
    course: { id: course.id, code: course.code, title: course.title, termLabel: course.termLabel },
    generatedAt,
    textEntries,
    fileEntries,
    missingFiles,
  };
}

/**
 * Stream the manifest into a ZIP and upload it to R2 via multipart, keeping
 * memory bounded: text entries are deflated; binary entries are stored and
 * streamed straight from R2; the archive is flushed in ~8MB parts.
 */
export async function buildAndStoreZip(
  bucket: R2Bucket,
  manifest: ExportManifest,
  objectKey: string,
): Promise<{ sizeBytes: number }> {
  const PART = 8 * 1024 * 1024;
  const mp = await bucket.createMultipartUpload(objectKey);
  const parts: R2UploadedPart[] = [];
  let pending: Uint8Array[] = [];
  let pendingLen = 0;
  let total = 0;
  let zipError: unknown = null;

  const zip = new Zip((err, chunk, _final) => {
    if (err) {
      zipError = err;
      return;
    }
    if (chunk && chunk.length) {
      pending.push(chunk);
      pendingLen += chunk.length;
      total += chunk.length;
    }
  });

  function take(n: number): Uint8Array {
    const out = new Uint8Array(n);
    let off = 0;
    let i = 0;
    while (off < n && i < pending.length) {
      const c = pending[i]!;
      const need = n - off;
      if (c.length <= need) {
        out.set(c, off);
        off += c.length;
        i++;
      } else {
        out.set(c.subarray(0, need), off);
        off += need;
        pending[i] = c.subarray(need);
      }
    }
    pending = pending.slice(i);
    pendingLen -= n;
    return out;
  }
  async function flush(force: boolean): Promise<void> {
    while (pendingLen >= PART || (force && pendingLen > 0)) {
      const size = pendingLen >= PART ? PART : pendingLen;
      const data = take(size);
      const part = await mp.uploadPart(parts.length + 1, data);
      parts.push(part);
      if (size < PART) break;
    }
  }

  try {
    for (const e of manifest.textEntries) {
      const f = new ZipDeflate(e.path, { level: 6 });
      zip.add(f);
      f.push(new TextEncoder().encode(e.content), true);
      if (zipError) throw zipError;
      await flush(false);
    }
    for (const e of manifest.fileEntries) {
      const obj = await bucket.get(e.objectKey);
      const f = new ZipPassThrough(e.path);
      zip.add(f);
      if (!obj || !obj.body) {
        f.push(new Uint8Array(0), true);
        continue;
      }
      const reader = obj.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.length) {
          f.push(value, false);
          if (zipError) throw zipError;
          await flush(false);
        }
      }
      f.push(new Uint8Array(0), true);
      if (zipError) throw zipError;
      await flush(false);
    }
    zip.end();
    if (zipError) throw zipError;
    await flush(true);
    if (parts.length === 0) {
      parts.push(await mp.uploadPart(1, new Uint8Array(0)));
    }
    await mp.complete(parts);
    return { sizeBytes: total };
  } catch (err) {
    try {
      await mp.abort();
    } catch {
      /* best-effort */
    }
    throw err;
  }
}

export function exportObjectKey(courseId: string, jobId: string): string {
  return `courses/${courseId}/exports/${jobId}.zip`;
}

// How long a generated export ZIP stays downloadable before the nightly cron
// deletes it from R2 (and clears the job's object key). Keeps storage from
// accumulating stale archives of student data.
export const COURSE_EXPORT_TTL_HOURS = 72;
