import { Hono } from 'hono';
import { and, asc, eq, sql } from 'drizzle-orm';
import {
  assignGroupMemberSchema,
  createGroupSetSchema,
  updateGroupSchema,
  updateGroupSetSchema,
  type AssignGroupMemberInput,
  type CreateGroupSetInput,
  type GroupMember,
  type GroupSetSummary,
  type GroupSetWithGroups,
  type GroupWithMembers,
  type UnassignedStudent,
  type UpdateGroupInput,
  type UpdateGroupSetInput,
} from '@coursewise/shared';
import { groupMemberships, groupSets, groups, users } from '../db/schema';
import type { Db } from '../db/client';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { requireParam } from '../lib/params';
import { success } from '../lib/response';
import { requireAuth, requireTokenCourseAccess } from '../middleware/auth';
import { requireScopeGroup } from '../middleware/scope';
import { validateJson } from '../middleware/validate';
import { recordAudit } from '../services/audit';
import { canAccessCourse, canWriteCourse, isCourseEnrolled } from '../services/courseAccess';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();
r.use('*', requireAuth);

// ---------- helpers ----------

async function loadGroupSetOrThrow(db: Db, courseId: string, setId: string) {
  const [row] = await db
    .select()
    .from(groupSets)
    .where(and(eq(groupSets.id, setId), eq(groupSets.courseId, courseId)))
    .limit(1);
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Group set not found');
  return row;
}

async function loadGroupOrThrow(db: Db, setId: string, groupId: string) {
  const [row] = await db
    .select()
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.groupSetId, setId)))
    .limit(1);
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Group not found');
  return row;
}

// ---------- list ----------

r.get(
  '/courses/:courseId/group-sets',
  requireScopeGroup('coursesRead'),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canAccessCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No access to this course');
    }
    const result = await db.execute(sql`
      SELECT
        gs.id, gs.course_id AS "courseId", gs.name,
        gs.max_members_per_group AS "maxMembersPerGroup",
        gs.signup_mode AS "signupMode",
        gs.signup_status AS "signupStatus",
        gs.created_at AS "createdAt", gs.updated_at AS "updatedAt",
        (SELECT count(*) FROM groups g WHERE g.group_set_id = gs.id)::int AS "groupCount",
        (SELECT count(*) FROM group_memberships gm WHERE gm.group_set_id = gs.id)::int AS "memberCount"
      FROM group_sets gs
      WHERE gs.course_id = ${courseId}
      ORDER BY gs.created_at
    `);
    return success(c, result.rows as unknown as GroupSetSummary[]);
  },
);

// ---------- create ----------

r.post(
  '/courses/:courseId/group-sets',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  validateJson(createGroupSetSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as CreateGroupSetInput;

    try {
      const [insertedSet] = await db
        .insert(groupSets)
        .values({
          courseId,
          name: input.name,
          maxMembersPerGroup: input.maxMembersPerGroup,
          signupMode: input.signupMode ?? 'self_signup',
          createdById: auth.user.id,
        })
        .returning();
      if (!insertedSet) {
        throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create group set');
      }

      // Create N empty groups named "Group 1" … "Group N" in one statement.
      const groupRows = Array.from({ length: input.numberOfGroups }, (_, i) => ({
        groupSetId: insertedSet.id,
        name: `Group ${i + 1}`,
        position: i,
      }));
      await db.insert(groups).values(groupRows);

      await recordAudit(db, {
        actorType: auth.method === 'jwt' ? 'user' : 'api_token',
        actorUserId: auth.user.id,
        actorTokenId: auth.tokenId ?? null,
        action: 'group-set.create',
        target: insertedSet.id,
        metadata: {
          courseId,
          name: insertedSet.name,
          numberOfGroups: input.numberOfGroups,
          maxMembersPerGroup: input.maxMembersPerGroup,
        },
      });

      const summary: GroupSetSummary = {
        id: insertedSet.id,
        courseId,
        name: insertedSet.name,
        maxMembersPerGroup: insertedSet.maxMembersPerGroup,
        signupMode: insertedSet.signupMode,
        signupStatus: insertedSet.signupStatus,
        groupCount: input.numberOfGroups,
        memberCount: 0,
        createdAt: insertedSet.createdAt,
        updatedAt: insertedSet.updatedAt,
      };
      return success(c, summary, 201);
    } catch (e) {
      if (String(e).includes('group_sets_course_name_idx')) {
        throw new ApiException(
          409,
          ERROR_CODES.CONFLICT,
          'A group set with that name already exists',
        );
      }
      throw e;
    }
  },
);

// ---------- detail ----------

r.get(
  '/courses/:courseId/group-sets/:setId',
  requireScopeGroup('coursesRead'),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const setId = requireParam(c, 'setId');
    if (!(await canAccessCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No access to this course');
    }
    const setRow = await loadGroupSetOrThrow(db, courseId, setId);

    const groupRows = await db
      .select()
      .from(groups)
      .where(eq(groups.groupSetId, setId))
      .orderBy(asc(groups.position), asc(groups.createdAt));

    const memberRows = await db
      .select({
        groupId: groupMemberships.groupId,
        studentId: groupMemberships.studentId,
        joinedAt: groupMemberships.joinedAt,
        name: users.name,
        email: users.email,
      })
      .from(groupMemberships)
      .innerJoin(users, eq(users.id, groupMemberships.studentId))
      .where(eq(groupMemberships.groupSetId, setId));

    const membersByGroup = new Map<string, GroupMember[]>();
    for (const m of memberRows) {
      const list = membersByGroup.get(m.groupId) ?? [];
      list.push({
        studentId: m.studentId,
        name: m.name,
        email: m.email,
        joinedAt: m.joinedAt,
      });
      membersByGroup.set(m.groupId, list);
    }

    const groupsOut: GroupWithMembers[] = groupRows.map((g) => ({
      id: g.id,
      groupSetId: g.groupSetId,
      name: g.name,
      position: g.position,
      maxMembersOverride: g.maxMembersOverride ?? null,
      members: (membersByGroup.get(g.id) ?? []).sort((a, b) =>
        a.joinedAt.localeCompare(b.joinedAt),
      ),
    }));

    // Unassigned roster: enrolled students NOT in any group in this set.
    // Only teachers/admins need to see the full unassigned list; students
    // only need to know if THEY are unassigned (covered by myGroupId).
    let unassignedStudents: UnassignedStudent[] = [];
    if (auth.user.role !== 'student') {
      const unassignedRows = await db.execute(sql`
        SELECT u.id AS "studentId", u.name, u.email
        FROM enrollments e
        JOIN users u ON u.id = e.student_id
        WHERE e.course_id = ${courseId}
          AND e.status = 'enrolled'
          AND NOT EXISTS (
            SELECT 1 FROM group_memberships gm
            WHERE gm.group_set_id = ${setId}
              AND gm.student_id = e.student_id
          )
        ORDER BY u.name
      `);
      unassignedStudents = unassignedRows.rows as unknown as UnassignedStudent[];
    }

    const myMembership = memberRows.find((m) => m.studentId === auth.user.id);

    const out: GroupSetWithGroups = {
      id: setRow.id,
      courseId: setRow.courseId,
      name: setRow.name,
      maxMembersPerGroup: setRow.maxMembersPerGroup,
      signupMode: setRow.signupMode,
      signupStatus: setRow.signupStatus,
      groupCount: groupsOut.length,
      memberCount: memberRows.length,
      createdAt: setRow.createdAt,
      updatedAt: setRow.updatedAt,
      groups: groupsOut,
      unassignedStudents,
      myGroupId: myMembership?.groupId ?? null,
    };
    return success(c, out);
  },
);

// ---------- update set ----------

r.patch(
  '/courses/:courseId/group-sets/:setId',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  validateJson(updateGroupSetSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const setId = requireParam(c, 'setId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    await loadGroupSetOrThrow(db, courseId, setId);
    const input = c.get('validated') as UpdateGroupSetInput;

    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.maxMembersPerGroup !== undefined) patch.maxMembersPerGroup = input.maxMembersPerGroup;
    if (input.signupMode !== undefined) patch.signupMode = input.signupMode;
    if (input.signupStatus !== undefined) patch.signupStatus = input.signupStatus;
    // Lowering maxMembersPerGroup is allowed even when some groups exceed
    // the new value — those groups stay grandfathered. New assignments
    // against them still go through the effective-cap check on the assign
    // endpoint (override || set cap).

    // Resize: grow inserts new auto-named groups; shrink deletes only the
    // empty trailing groups, preserving any populated ones beyond the
    // requested count.
    let groupsAdded = 0;
    let groupsRemoved = 0;
    if (input.numberOfGroups !== undefined) {
      const existing = await db
        .select({ id: groups.id, position: groups.position })
        .from(groups)
        .where(eq(groups.groupSetId, setId))
        .orderBy(asc(groups.position));
      const current = existing.length;
      const target = input.numberOfGroups;
      if (target > current) {
        const rows = Array.from({ length: target - current }, (_, i) => ({
          groupSetId: setId,
          name: `Group ${current + i + 1}`,
          position: current + i,
        }));
        if (rows.length > 0) {
          await db.insert(groups).values(rows);
          groupsAdded = rows.length;
        }
      } else if (target < current) {
        const memberCounts = await db
          .select({
            groupId: groupMemberships.groupId,
            n: sql<number>`count(*)::int`,
          })
          .from(groupMemberships)
          .where(eq(groupMemberships.groupSetId, setId))
          .groupBy(groupMemberships.groupId);
        const memberByGroup = new Map(memberCounts.map((r) => [r.groupId, r.n]));
        // Walk trailing groups from highest position down and delete the
        // empty ones. Populated trailing groups stay; future re-shrinks
        // can still clean them up once emptied by hand.
        const trailing = existing
          .filter((g) => g.position >= target)
          .sort((a, b) => b.position - a.position);
        for (const g of trailing) {
          if ((memberByGroup.get(g.id) ?? 0) === 0) {
            await db.delete(groups).where(eq(groups.id, g.id));
            groupsRemoved += 1;
          }
        }
      }
    }

    try {
      const [updated] = await db
        .update(groupSets)
        .set(patch)
        .where(and(eq(groupSets.id, setId), eq(groupSets.courseId, courseId)))
        .returning();
      if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Group set not found');

      await recordAudit(db, {
        actorType: auth.method === 'jwt' ? 'user' : 'api_token',
        actorUserId: auth.user.id,
        actorTokenId: auth.tokenId ?? null,
        action: 'group-set.update',
        target: setId,
        metadata: {
          courseId,
          fields: Object.keys(patch).filter((k) => k !== 'updatedAt'),
          groupsAdded,
          groupsRemoved,
          numberOfGroups: input.numberOfGroups ?? null,
        },
      });
      return success(c, updated);
    } catch (e) {
      if (String(e).includes('group_sets_course_name_idx')) {
        throw new ApiException(
          409,
          ERROR_CODES.CONFLICT,
          'A group set with that name already exists',
        );
      }
      throw e;
    }
  },
);

// ---------- delete set ----------

r.delete(
  '/courses/:courseId/group-sets/:setId',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const setId = requireParam(c, 'setId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const [deleted] = await db
      .delete(groupSets)
      .where(and(eq(groupSets.id, setId), eq(groupSets.courseId, courseId)))
      .returning({ id: groupSets.id });
    if (!deleted) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Group set not found');

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'group-set.delete',
      target: setId,
      metadata: { courseId },
    });
    return success(c, { id: setId });
  },
);

// ---------- rename / reorder a single group ----------

r.patch(
  '/courses/:courseId/group-sets/:setId/groups/:groupId',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  validateJson(updateGroupSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const setId = requireParam(c, 'setId');
    const groupId = requireParam(c, 'groupId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    await loadGroupSetOrThrow(db, courseId, setId);
    await loadGroupOrThrow(db, setId, groupId);
    const input = c.get('validated') as UpdateGroupInput;

    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.position !== undefined) patch.position = input.position;

    try {
      const [updated] = await db
        .update(groups)
        .set(patch)
        .where(and(eq(groups.id, groupId), eq(groups.groupSetId, setId)))
        .returning();
      return success(c, updated);
    } catch (e) {
      if (String(e).includes('groups_set_name_idx')) {
        throw new ApiException(409, ERROR_CODES.CONFLICT, 'A group with that name already exists');
      }
      throw e;
    }
  },
);

// ---------- member: join / assign ----------

r.post(
  '/courses/:courseId/group-sets/:setId/groups/:groupId/members',
  requireScopeGroup('coursesRead'),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const setId = requireParam(c, 'setId');
    const groupId = requireParam(c, 'groupId');

    // Two callers: a student joining themselves (no body), or a teacher/admin
    // assigning a student (body = { studentId, force? }). We branch on role.
    let targetStudentId: string;
    let forceRequested = false;
    if (auth.user.role === 'student') {
      if (!(await isCourseEnrolled(db, courseId, auth.user.id))) {
        throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not enrolled in this course');
      }
      targetStudentId = auth.user.id;
    } else {
      if (!(await canWriteCourse(db, auth.user, courseId))) {
        throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
      }
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'Invalid JSON body');
      }
      const parsed = assignGroupMemberSchema.safeParse(body);
      if (!parsed.success) {
        throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'studentId required');
      }
      const input = parsed.data as AssignGroupMemberInput;
      if (!(await isCourseEnrolled(db, courseId, input.studentId))) {
        throw new ApiException(409, ERROR_CODES.CONFLICT, 'Student is not enrolled in this course');
      }
      targetStudentId = input.studentId;
      forceRequested = input.force === true;
    }

    const setRow = await loadGroupSetOrThrow(db, courseId, setId);
    const groupRow = await loadGroupOrThrow(db, setId, groupId);

    // Self-signup must be open. Teacher-assigned mode means students can't
    // self-join; the role check above already routes teachers around this.
    if (auth.user.role === 'student') {
      if (setRow.signupStatus !== 'open') {
        throw new ApiException(409, ERROR_CODES.CONFLICT, 'Signup is locked for this group set');
      }
      if (setRow.signupMode === 'teacher_assigned') {
        throw new ApiException(
          403,
          ERROR_CODES.FORBIDDEN,
          'Self-signup not allowed for this group set',
        );
      }
    }

    // Capacity check using the effective cap (per-group override falls
    // back to the set's maxMembersPerGroup). Done before insert; a
    // concurrent join could still race past the cap, but the practical
    // likelihood is low enough that we accept it for v1 rather than
    // introducing advisory locking.
    const countRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(groupMemberships)
      .where(eq(groupMemberships.groupId, groupId));
    const currentCount = countRows[0]?.count ?? 0;
    const effectiveMax = groupRow.maxMembersOverride ?? setRow.maxMembersPerGroup;
    let overrideAfter: number | null = groupRow.maxMembersOverride ?? null;
    if (currentCount >= effectiveMax) {
      // Students can never override; teacher/admin must explicitly opt in
      // via { force: true }. When forced, the per-group override is
      // bumped to currentCount + 1 so the cap persistently reflects the
      // new size.
      if (!forceRequested || auth.user.role === 'student') {
        throw new ApiException(409, ERROR_CODES.CONFLICT, 'Group is full');
      }
      const nextOverride = currentCount + 1;
      await db
        .update(groups)
        .set({ maxMembersOverride: nextOverride, updatedAt: new Date().toISOString() })
        .where(eq(groups.id, groupId));
      overrideAfter = nextOverride;
    }

    try {
      const [inserted] = await db
        .insert(groupMemberships)
        .values({ groupSetId: setId, groupId, studentId: targetStudentId })
        .returning();
      await recordAudit(db, {
        actorType: auth.method === 'jwt' ? 'user' : 'api_token',
        actorUserId: auth.user.id,
        actorTokenId: auth.tokenId ?? null,
        action: auth.user.role === 'student' ? 'group.self-join' : 'group.assign',
        target: groupId,
        metadata: {
          courseId,
          setId,
          studentId: targetStudentId,
          forced: forceRequested && currentCount >= effectiveMax,
          overrideAfter,
        },
      });
      return success(c, inserted, 201);
    } catch (e) {
      if (String(e).includes('group_memberships_set_student_idx')) {
        throw new ApiException(
          409,
          ERROR_CODES.CONFLICT,
          'Student is already in a group in this set',
        );
      }
      throw e;
    }
  },
);

// ---------- member: leave / remove ----------

r.delete(
  '/courses/:courseId/group-sets/:setId/groups/:groupId/members/:studentId',
  requireScopeGroup('coursesRead'),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const setId = requireParam(c, 'setId');
    const groupId = requireParam(c, 'groupId');
    const studentId = requireParam(c, 'studentId');

    if (auth.user.role === 'student') {
      if (studentId !== auth.user.id) {
        throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Cannot remove other members');
      }
      const setRow = await loadGroupSetOrThrow(db, courseId, setId);
      if (setRow.signupStatus !== 'open') {
        throw new ApiException(409, ERROR_CODES.CONFLICT, 'Signup is locked — cannot leave group');
      }
    } else {
      if (!(await canWriteCourse(db, auth.user, courseId))) {
        throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
      }
      await loadGroupSetOrThrow(db, courseId, setId);
    }

    const [deleted] = await db
      .delete(groupMemberships)
      .where(
        and(
          eq(groupMemberships.groupSetId, setId),
          eq(groupMemberships.groupId, groupId),
          eq(groupMemberships.studentId, studentId),
        ),
      )
      .returning({ id: groupMemberships.id });
    if (!deleted) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Membership not found');

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: auth.user.role === 'student' ? 'group.leave' : 'group.remove',
      target: groupId,
      metadata: { courseId, setId, studentId },
    });
    return c.body(null, 204);
  },
);

export default r;
