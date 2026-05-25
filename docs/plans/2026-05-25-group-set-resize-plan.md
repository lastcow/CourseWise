# Group-Set Resize + Per-Group Capacity Override — Implementation Plan

> Companion to `2026-05-25-group-set-resize-design.md`.

**Goal:** Let teacher/admin edit `numberOfGroups` + `maxMembersPerGroup`
from the existing "Rename" dialog (now "Edit"), and let them force-add
a student to a full group, which persistently bumps that group's
capacity via a new `groups.max_members_override` column.

---

## Task 1 — DB migration + schema

**Files:**
- Create: `apps/api/drizzle/0026_group_capacity_override.sql`
  ```sql
  ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "max_members_override" integer;
  ```
- Modify: `apps/api/drizzle/meta/_journal.json` — add idx 26.
- Modify: `apps/api/src/db/schema.ts` —
  `groups.maxMembersOverride: integer('max_members_override')`.

Run `pnpm --filter @coursewise/api db:migrate`. Commit.

---

## Task 2 — Shared types

**Files:**
- Modify: `packages/shared/src/types.ts`
  - `GroupWithMembers`: add `maxMembersOverride: number | null`.
  - `UpdateGroupSetInput`: extend with optional
    `numberOfGroups?: number`, `maxMembersPerGroup?: number`.
  - `JoinOrAssignGroupMemberInput`: extend with optional `force?: boolean`.
  - New `effectiveMax(group, set)` helper if useful (otherwise compute
    inline on the client).

Commit.

---

## Task 3 — API: extend PATCH group-set

**Files:**
- Modify: `apps/api/src/routes/groupSets.ts` (PATCH set handler)

Add `numberOfGroups`, `maxMembersPerGroup` to the zod schema. Logic:
- If `maxMembersPerGroup` provided → write column. No member-count
  check.
- If `numberOfGroups` provided:
  - `current = await count(groups where group_set_id = setId)`
  - If `numberOfGroups > current`:
    - Insert `numberOfGroups - current` rows with names
      `Group ${current+1}`, `Group ${current+2}`, … and positions
      sequential from `current`.
  - If `numberOfGroups < current`:
    - For each group at position > `numberOfGroups`, ordered by
      position desc, check `select 1 from group_memberships where
      group_id = g.id limit 1`. If absent → delete that group.
      Populated trailing groups stay.

Return the updated `GroupSetWithGroups`. Audit
`action='group-set.resize'` with metadata
`{ from: { numberOfGroups, maxMembersPerGroup }, to: { … } }`.

Commit.

---

## Task 4 — API: force-assign honours / sets `max_members_override`

**Files:**
- Modify: `apps/api/src/routes/groupSets.ts` (POST add-member handler)

Add `force: z.boolean().optional()` to the schema.

Server logic (replacing the current capacity check):
```ts
const effectiveMax = group.maxMembersOverride ?? set.maxMembersPerGroup;
const currentCount = await countMembers(groupId);
if (currentCount >= effectiveMax) {
  if (!input.force || auth.user.role === 'student') {
    throw new ApiException(409, ERROR_CODES.CONFLICT, 'group_full');
  }
  await db.update(groups)
    .set({ maxMembersOverride: currentCount + 1 })
    .where(eq(groups.id, groupId));
}
await db.insert(groupMemberships).values({ … });
```

Audit metadata: `{ groupId, studentId, forced: bool,
overrideAfter: number | null }`.

Add a permissions-test row: `force=true` as a student → 409 anyway.

Commit.

---

## Task 5 — Web: extend hooks

**Files:**
- Modify: `apps/web/src/lib/queries.ts`

- `useUpdateGroupSet`: existing patch already passes the body verbatim;
  the new optional fields just flow through. Verify the TS type allows
  them.
- `useJoinOrAssignGroupMember`: change `mutationFn` arg to accept
  `force?: boolean`.

Commit.

---

## Task 6 — Web: rename + edit dialog

**Files:**
- Modify: `apps/web/src/pages/teacher/TeacherStudentsPage.tsx`

The existing "Rename group set" dialog (mounted from the per-set toolbar
edit pencil) keeps the name input but adds two number inputs:
`numberOfGroups`, `maxMembersPerGroup`. The dialog title becomes
"Edit group set". When the typed values would shrink the current
counts, render a muted hint about populated-groups grandfathering. Save
calls `useUpdateGroupSet` with the merged body.

Commit.

---

## Task 7 — Web: force-add affordance on full groups

**Files:**
- Modify: `apps/web/src/pages/teacher/TeacherStudentsPage.tsx`

In the `GroupedRosterTable`:
- Compute `effectiveMax = g.maxMembersOverride ?? set.maxMembersPerGroup`.
- Group header badge becomes `{count}/{effectiveMax}` with a small `↑`
  marker when override is non-null.
- When the group is at capacity AND a target student is selected:
  - The existing Assign button stays disabled.
  - Add an outline `Add anyway` button next to it. Clicking it calls
    the assign mutation with `force: true`. After success the badge
    refreshes to the new bumped cap.

Commit.

---

## Task 8 — i18n

**Files:**
- Modify: `apps/web/src/locales/en.ts` + `zh-CN.ts`

Add under `groups.*`:
- `editSetTitle` (replaces old `renameGroupTitle` usage in the dialog header)
- `shrinkHint`
- `addAnyway`
- `overrideBadge`

Keep `renameGroupTitle` for the older "Rename group" affordance if any.

Commit.

---

## Task 9 — Final wrap-up

1. `pnpm --filter @coursewise/api typecheck && pnpm --filter @coursewise/api test`
2. `pnpm --filter @coursewise/web typecheck && pnpm --filter @coursewise/web test`
3. Manual:
   - Edit a set: shrink groups from 8 → 4 with two populated tail groups;
     verify the populated ones survive and the empty ones disappear.
   - Lower max from 6 → 4 on a set with a group of 5; group stays at 5,
     header shows `5/4`.
   - On a full group, assign a student → Assign disabled, Add-anyway
     shown; click it; cap bumps to N+1 persistently (reload preserves
     it).
   - Try the force flag as a student → 409.
4. Bundled PR titled `Group-set resize + per-group capacity override`.
