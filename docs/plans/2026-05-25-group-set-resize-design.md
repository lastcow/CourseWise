# Group-Set Resize + Per-Group Capacity Override — Design

**Goal:** Let teachers/admins (1) edit the *number of groups* and the
*max members per group* on a group set from the same dialog they currently
use to rename, and (2) add a member to a specific full group from the
Students page, which persistently bumps that group's capacity.

## Decided scope

- **Number of groups** (`group_sets.numberOfGroups`): currently a derived
  count of rows in `groups`. The edit dialog treats it like a settable
  field:
  - Growing N: insert `delta` new `groups` rows with auto-named slots
    ("Group N+1", "Group N+2", …) at the next positions.
  - Shrinking N: delete only **empty** trailing-position groups. Any
    populated group beyond the new N is grandfathered.
- **Max members per group** (`group_sets.maxMembersPerGroup`): reducing
  the value never kicks existing members. Existing groups stay at their
  member count even if it exceeds the new max.
- **Per-group capacity override** — new nullable
  `groups.maxMembersOverride` column. Effective cap for a group =
  `coalesce(maxMembersOverride, group_sets.maxMembersPerGroup)`.
  - The Assign endpoint accepts `force=true`. When the group is at or
    above its effective cap and the caller is admin/teacher and `force`
    is set, the server bumps `maxMembersOverride` to
    `currentMemberCount + 1` and admits the student.
  - Self-signup (student joining their own group) never bumps the
    override — students always respect the cap.

## Data model

```sql
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "max_members_override" integer;
```

No backfill, no FK changes. Default is NULL meaning "inherit set's
maxMembersPerGroup."

## API

### Extend PATCH `/api/courses/:courseId/group-sets/:setId`

Body adds two optional fields (existing fields stay):

```jsonc
{
  "name": "Project Teams",       // existing
  "signupMode": "self_signup",   // existing
  "signupStatus": "open",        // existing
  "numberOfGroups": 6,           // NEW — integer 1..100
  "maxMembersPerGroup": 5        // NEW — integer 1..200
}
```

Semantics:
- `maxMembersPerGroup` set → write the column. Never block on
  over-capacity rows.
- `numberOfGroups` set →
  ```
  current = count(groups where group_set_id = setId)
  if numberOfGroups > current:
    insert (numberOfGroups - current) groups with auto-named slots
    at positions current+1..numberOfGroups, ordered by name.
  if numberOfGroups < current:
    select groups at position > numberOfGroups order by position desc
    for each such group:
      if has_no_memberships: delete it
      else: leave it (grandfathered)
  ```
- Returns the updated `GroupSetWithGroups`.

### Extend the assign endpoint (POST add-member, currently
`useJoinOrAssignGroupMember`)

Add a `force` flag to the body:

```jsonc
{
  "groupId": "...",
  "studentId": "...",  // teacher-assign only; self-join omits
  "force": true        // NEW — caller must be admin/teacher
}
```

Server logic:
1. Compute `effectiveMax = group.maxMembersOverride ?? set.maxMembersPerGroup`.
2. Compute `currentCount = count(memberships where group_id = groupId)`.
3. If `currentCount >= effectiveMax`:
   - If `force !== true` OR caller is a student → 409 CONFLICT
     `group_full`.
   - Else → `update groups set max_members_override = currentCount + 1
     where id = groupId`, then admit.
4. Insert the membership.
5. Audit metadata captures whether `force` was used and the resulting
   override value.

### Effective-max surfacing

`GroupSummary` / `GroupWithMembers` already carry `maxMembersPerGroup`.
Add `maxMembersOverride: number | null` so the UI can show
`{count}/{override ?? max}` consistently.

## UI

### Edit-set dialog (`TeacherStudentsPage` rename dialog)

Rename it from "Rename group set" to "Edit group set" and expand:

```
Name                 [____________________________]
Number of groups     [ 6 ]      Max members/group  [ 5 ]
Sign-up mode         [ Self sign-up ▾ ]
```

If shrinking either value, a muted hint reads:
> Existing populated groups will stay as-is.

### Grouped roster — Add to a full group

In `TeacherStudentsPage` GroupedRosterTable (the "Group X is full" branch),
when the teacher picks a student and the group is at or above effective
max, the existing **Assign** button is disabled. Show a new outline
button next to it:

> ⚠ Add anyway (allow {newCap})

Clicking it calls the assignment endpoint with `force=true`. After
success the badge updates to `{count+1}/{newCap}`.

### Per-row badge

Group header chip already shows `{remaining}/{max}` text. Switch to
`{count}/{effectiveMax}`, with a small amber `↑` ornament when an
override is in effect, so a glance shows "this group was bumped from
N".

## i18n

New keys under `groups.*`: `numberOfGroupsLabel`, `maxPerGroupLabel`
(already exist for the create dialog — reuse), `shrinkHint`,
`addAnyway`, `addAnywayConfirm`, `overrideBadge`.

## Out of scope (V2+)

- Editing per-group name from inline cells.
- Reordering groups in the set.
- Bulk "+ N members" via CSV import.
- Self-sign override (students forcing themselves into full groups).
