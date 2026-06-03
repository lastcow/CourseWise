import { asc, eq, inArray } from 'drizzle-orm';
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import type { Db } from '../db/client';
import {
  assignmentSubmissions,
  assignments,
  courses,
  discussionGrades,
  discussionPosts,
  discussionTopics,
  enrollments,
  fileAssets,
  finalGrades,
  groupSubmissions,
  quizAnswers,
  quizAttempts,
  quizQuestions,
  quizzes,
  readingMaterials,
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

export function sanitize(name: string): string {
  const cleaned = name.trim().replace(/[^A-Za-z0-9._ -]+/g, '_').replace(/\s+/g, ' ').trim();
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
 * manifest: rendered text files (metadata.json, requirement.md, scores.csv,
 * README) and the list of binary files (by R2 object key) to stream in.
 */
export async function gatherCourseExport(db: Db, courseId: string): Promise<ExportManifest | null> {
  const [course] = await db
    .select({
      id: courses.id,
      code: courses.code,
      title: courses.title,
      termLabel: courses.termLabel,
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

  // Add a binary entry into the zip from a file-asset id; notes if missing/not ready.
  function addFileById(folder: string, fileAssetId: string | null): void {
    if (!fileAssetId) return;
    const a = assetById.get(fileAssetId);
    if (!a) {
      missingFiles.push({ path: folder, reason: `file asset ${fileAssetId} missing or not ready` });
      return;
    }
    fileEntries.push({
      path: `${folder}${sanitize(a.originalFilename ?? fileAssetId)}`,
      objectKey: a.objectKey,
      sizeBytes: a.sizeBytes,
    });
  }
  function addRelatedFiles(folder: string, relatedType: string, relatedId: string): void {
    for (const a of assetsByRelated.get(`${relatedType}:${relatedId}`) ?? []) {
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

  // ---- Resolve all referenced users ----
  const userRows = userIds.size
    ? await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
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
          score: num(s.score),
          maxScore: num(a.maxScore),
          feedback: s.feedback,
          submittedAt: gs?.submittedAt ?? s.submittedAt,
          gradedAt: s.gradedAt,
        }),
      });
      const textBody = gs?.content ?? s.content;
      if (textBody) textEntries.push({ path: `${sub}answer.txt`, content: textBody });
      // Submission files: per-row + per-related, plus the shared group file.
      addRelatedFiles(`${sub}files/`, 'submission', s.id);
      addFileById(`${sub}files/`, s.fileAssetId);
      if (gs?.fileAssetId) addFileById(`${sub}files/`, gs.fileAssetId);
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
          score: num(at.score),
          maxScore: num(at.maxScore),
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
            pointsAwarded: num(ans.pointsAwarded),
          })),
        ),
      });
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
      for (const g of gradesByTopic.get(tpc.id) ?? []) {
        textEntries.push({
          path: `${folder}grades/${labelFor(g.studentId)}.json`,
          content: json({
            student: userById.get(g.studentId)?.name ?? null,
            email: userById.get(g.studentId)?.email ?? null,
            score: num(g.score),
            maxScore: num(tpc.maxScore),
            feedback: g.feedback,
            gradedAt: g.gradedAt,
          }),
        });
      }
    }
  });

  // ---- scores.csv (long format) ----
  const finals = await db.select().from(finalGrades).where(eq(finalGrades.courseId, courseId));
  const rows: string[] = ['Student,Email,Type,Item,Score,Max,Status/Letter'];
  const push = (uid: string, type: string, item: string, score: unknown, max: unknown, st: unknown) =>
    rows.push(
      [
        csvCell(userById.get(uid)?.name ?? ''),
        csvCell(userById.get(uid)?.email ?? ''),
        csvCell(type),
        csvCell(item),
        csvCell(score),
        csvCell(max),
        csvCell(st),
      ].join(','),
    );
  for (const a of assignmentRows)
    for (const s of subsByAssignment.get(a.id) ?? [])
      push(s.studentId, 'Assignment', a.title, num(s.score), num(a.maxScore), s.status);
  for (const q of quizRows)
    for (const at of attemptsByQuiz.get(q.id) ?? [])
      push(at.studentId, 'Quiz', q.title, num(at.score), num(at.maxScore), at.status);
  for (const tpc of topicRows)
    if (tpc.isGraded)
      for (const g of gradesByTopic.get(tpc.id) ?? [])
        push(g.studentId, 'Discussion', tpc.title, num(g.score), num(tpc.maxScore), '');
  for (const f of finals)
    push(f.studentId, 'Final', '', num(f.teacherOverrideScore ?? f.score), '', f.letterGrade ?? '');
  textEntries.push({ path: 'scores.csv', content: rows.join('\n') });

  // ---- README ----
  textEntries.push({
    path: 'README.txt',
    content:
      `CourseWise export\n` +
      `Course: ${course.title} (${course.code})${course.termLabel ? ` · ${course.termLabel}` : ''}\n` +
      `Generated: ${generatedAt}\n\n` +
      `Contents:\n` +
      `  scores.csv             — every student score across all gradable items\n` +
      `  materials/             — reading materials (metadata + files / links)\n` +
      `  assignments/<item>/    — requirement + each student's submission (files, score, feedback)\n` +
      `  quizzes/<item>/        — questions + each attempt's answers and score\n` +
      `  discussions/<item>/    — posts + per-student grades\n` +
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
