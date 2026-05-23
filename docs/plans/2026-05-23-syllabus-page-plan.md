# Syllabus Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a per-course Syllabus page (teacher edit, student read-only) that combines a teacher-authored markdown narrative with auto-aggregated structured sections (grading policy, schedule, upcoming dates) and an optional PDF upload — per the design conversation summarized in this plan's "Design recap" section.

**Architecture:** Two new nullable columns on `courses` — `syllabus_md` (long text) and `syllabus_file_asset_id` (FK to `file_assets` with `ON DELETE SET NULL`). `CourseDetail` gains three fields: `syllabusMd`, `syllabusFileAssetId`, `syllabusFileUrl` (presigned, 5-min TTL). The existing `PATCH /api/courses/:id` accepts the two new fields with the same teacher-owns-the-asset validation guard the banner uses. Two new web pages — `TeacherSyllabusPage` (markdown editor + PDF upload + auto-aggregated previews) and `StudentSyllabusPage` (read-only) — both mounted under their respective course route trees and added to the "Learn" group in the sidenav.

**Tech Stack:** TypeScript, Hono, Drizzle ORM (Postgres / Neon HTTP), Cloudflare Workers + R2, Vitest, React, TanStack Query, react-i18next, Tailwind.

---

## Design recap (so this plan is self-contained)

The page composition, top to bottom:

1. **Hero card** — course banner (existing), course code + title + term overlaid.
2. **Authored markdown** — teacher writes one big markdown blob (description, learning objectives, materials, policies, instructor contact). Student sees it rendered.
3. **Grading auto-section** — read-only table built from the existing `assignment_groups` rows + `gradingPolicies.weightAttendance`. Link to the full grading-policy page.
4. **Schedule auto-section** — list of modules in `position` order, each with its assignments/quizzes inline (read-only condensed view).
5. **Upcoming dates auto-section** — top 5 assignments + quizzes due in the next 30 days, sorted ascending.
6. **PDF attachment** — when set, "Download official syllabus" button. Teacher view has upload/remove.
7. **Print syllabus** button — opens `window.print()`; CSS `@media print` styling on the page hides nav chrome.

Auto-sections pull data the user already has via existing hooks (`useAssignmentGroups`, `useGradingPolicy`, `useModulesList`, `useAssignmentsList`, `useQuizzesList`) — zero new API queries for that data.

PDF upload reuses the existing `uploadFile(file, courseId, 'course')` flow; the relatedType enum is NOT extended.

---

## Conventions

- Run commands from worktree root: `/Users/zhijiangchen/CourseWise/.worktrees/syllabus-page`.
- After each task: scoped tests → `pnpm typecheck` → commit. Single-line commit messages, no Co-Authored-By footer.
- neon-http driver doesn't support `db.transaction(...)`. Don't introduce one.
- All new strings: en + zh-CN parity, added in Task 8.

---

## Task 1: Shared types + validators

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/validators.ts`

**Step 1:** In `types.ts`, find `interface CourseSummary` (the one with banner fields). Append three fields after `bannerUrl`:

```ts
syllabusMd: string | null;
syllabusFileAssetId: string | null;
syllabusFileUrl: string | null;
```

`CourseDetail` extends `CourseSummary`, so it picks them up automatically.

**Step 2:** In `validators.ts`, find `updateCourseSchema` (line ~134). Add two new optional fields:

```ts
syllabusMd: z.string().max(50_000).nullable().optional(),
syllabusFileAssetId: z.string().uuid().nullable().optional(),
```

50KB cap matches reasonable markdown sizes — even a generous syllabus is under 10KB; the cap is just a guard against blob abuse.

**Step 3:** Verify:

```bash
pnpm --filter @coursewise/shared typecheck
pnpm --filter @coursewise/api typecheck
pnpm --filter @coursewise/web typecheck
```

API typecheck WILL fail at one or two `toCourseSummary` call sites that don't yet return the new fields — that's the to-do list for Task 4. Web typecheck likely passes since web consumers are read-only.

**Step 4:** Commit:

```bash
git add packages/shared/
git commit -m "Shared: syllabus fields on CourseSummary + updateCourseSchema"
```

---

## Task 2: Drizzle schema

**Files:**
- Modify: `apps/api/src/db/schema.ts`

Inside the `courses` table column-object literal, near other FK columns (next to `bannerFileAssetId`), add:

```ts
syllabusMd: text('syllabus_md'),
syllabusFileAssetId: uuid('syllabus_file_asset_id').references((): AnyPgColumn => fileAssets.id, {
  onDelete: 'set null',
}),
```

The `AnyPgColumn` annotation is the same circular-reference workaround `bannerFileAssetId` uses — `fileAssets` declared after `courses`, lazy reference needed.

Verify api typecheck has only the Task 1 carryover errors (no NEW errors from schema). Commit:

```bash
git add apps/api/src/db/schema.ts
git commit -m "Schema: courses.syllabus_md + syllabus_file_asset_id"
```

---

## Task 3: Migration 0023

**Files:**
- Create: `apps/api/drizzle/0023_course_syllabus.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`

Hand-author (matches `0014` / `0022` style):

```sql
-- Per-course syllabus: a long markdown blob authored by the teacher and an
-- optional PDF attachment served via the existing file_assets/R2 pipeline.

ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "syllabus_md" text;
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "syllabus_file_asset_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "courses" ADD CONSTRAINT "courses_syllabus_file_asset_id_file_assets_id_fk"
   FOREIGN KEY ("syllabus_file_asset_id") REFERENCES "file_assets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
```

Update `_journal.json`: append a new entry with `idx: 23`, `version: "7"`, `when: <last.when + 86400000>`, `tag: "0023_course_syllabus"`, `breakpoints: true`. Commit:

```bash
git add apps/api/drizzle/0023_course_syllabus.sql apps/api/drizzle/meta/_journal.json
git commit -m "Migration: 0023 courses.syllabus_md + syllabus_file_asset_id"
```

---

## Task 4: API — extend `toCourseSummary` + PATCH guard

**Files:**
- Modify: `apps/api/src/routes/courses.ts`

**Step 1: `toCourseSummary`.** Find the helper. Extend the signature with two new optional params (defaults `null`) so existing call sites don't need to change:

```ts
function toCourseSummary(
  row: typeof courses.$inferSelect,
  bannerUrl: string | null = null,
  counts: CourseSummary['counts'] = { /* existing zeros */ },
  syllabusFileUrl: string | null = null,
): CourseSummary {
  return {
    // ... existing fields ...
    syllabusMd: row.syllabusMd ?? null,
    syllabusFileAssetId: row.syllabusFileAssetId ?? null,
    syllabusFileUrl,
  };
}
```

That alone fixes the Task 1 typecheck errors.

**Step 2: List endpoint.** The current SQL select-list in `GET /api/courses` returns banner fields. Add `c.syllabus_md AS "syllabusMd"` and `c.syllabus_file_asset_id AS "syllabusFileAssetId"` to that select. The list view does NOT need the presigned PDF URL (it's per-row noise) — pass `null` for `syllabusFileUrl` on the list path. The detail endpoint (Step 3) signs it.

**Step 3: Detail endpoint.** `GET /api/courses/:id`. After loading the course row, if `row.syllabusFileAssetId` is set:

```ts
const [asset] = await db
  .select({ bucket: fileAssets.bucket, objectKey: fileAssets.objectKey })
  .from(fileAssets)
  .where(eq(fileAssets.id, row.syllabusFileAssetId))
  .limit(1);
const syllabusFileUrl =
  asset ? await tryBannerSignerConfig(env)?.let((signer) =>
    presignR2Url(signer, { method: 'GET', key: asset.objectKey, expiresInSeconds: 300 }),
  ) ?? null : null;
```

Reuse the existing `tryBannerSignerConfig` and `presignR2Url` helpers. (The Task 4 plan code is sketch — match the actual idiom the banner already uses.)

Pass `syllabusFileUrl` into `toCourseSummary`.

**Step 4: PATCH guard.** Find the existing `bannerFileAssetId` validation block. Below it, add the parallel guard for `syllabusFileAssetId`:

```ts
if (input.syllabusFileAssetId !== undefined) {
  if (input.syllabusFileAssetId === null) {
    patch.syllabusFileAssetId = null;
  } else {
    const [asset] = await db
      .select({ id: fileAssets.id, ownerId: fileAssets.ownerId, courseId: fileAssets.courseId })
      .from(fileAssets)
      .where(eq(fileAssets.id, input.syllabusFileAssetId))
      .limit(1);
    if (
      !asset ||
      asset.courseId !== courseId ||
      (auth.user.role !== 'admin' && asset.ownerId !== auth.user.id)
    ) {
      throw new ApiException(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        'Syllabus asset must be a course-scoped file you uploaded',
      );
    }
    patch.syllabusFileAssetId = input.syllabusFileAssetId;
  }
}

if (input.syllabusMd !== undefined) {
  patch.syllabusMd = input.syllabusMd; // null clears, string sets
}
```

**Step 5: Verify** typecheck clean across packages/shared, api, web. Commit:

```bash
git add apps/api/src/routes/courses.ts
git commit -m "API: course detail returns syllabus fields; PATCH accepts both"
```

---

## Task 5: Frontend — `TeacherSyllabusPage`

**Files:**
- Create: `apps/web/src/pages/teacher/TeacherSyllabusPage.tsx`

Render order (single scrolling page):

1. Page header: title `Syllabus`, "Print" button (right-aligned), calls `window.print()`.
2. Hero card — pulls `course.bannerUrl` (existing) or gradient fallback; overlays `code · title · termLabel`.
3. **Edit toggle** — `<Button>` to switch between MarkdownEditor and MarkdownView for the authored section. Default to "view" mode.
4. Authored section — when editing, `<MarkdownEditor>` bound to local `syllabusMd` state with a Save button (calls `useUpdateCourse({ id, input: { syllabusMd } })`); when viewing, `<MarkdownView source={course.data?.syllabusMd ?? ''} />` with a "No syllabus yet — click Edit to add one" empty state.
5. Auto-aggregated Grading card — `useAssignmentGroups(id)` + `useGradingPolicy(id)`. Table: row per group (name + weight%), plus an Attendance row. Link "View full grading policy" → `/teacher/courses/:id/grading-policy`.
6. Auto-aggregated Schedule card — `useModulesList(id)` + per-module assignments / quizzes (filtered by `moduleId`). One subsection per module, listing items with their due dates / window times.
7. Auto-aggregated Upcoming card — assignments with `dueDate` AND quizzes with `endTime` filtered to the next 30 days; sorted ascending; capped at 5 items.
8. PDF section — when `course.data?.syllabusFileUrl` is set: download button (uses `DownloadPresentationButton` with `labelKey="syllabus.downloadPdf"`). Always: a "Upload PDF" button + "Remove" (mirror the banner-upload UI from `TeacherCourseSettings`). 50MB cap. MIME restricted to `application/pdf`.
9. Wrap the whole page in a `<div className="print:[&_nav]:hidden print:[&_aside]:hidden">` (or simpler — add a class the layout listens to). Keep this minimal in v1: just a `print:m-0 print:p-0` on the outer + `@media print { header, aside { display: none } }` in a small `<style>` block inside the page. Done.

**Hard-code English** strings; Task 8 i18ns. Skip TDD for the page itself (it's a UI shell over existing hooks) — just verify it renders.

Commit:

```bash
git add apps/web/src/pages/teacher/TeacherSyllabusPage.tsx
git commit -m "Web: TeacherSyllabusPage with editor + auto-aggregated sections"
```

---

## Task 6: Frontend — `StudentSyllabusPage`

**Files:**
- Create: `apps/web/src/pages/student/StudentSyllabusPage.tsx`

Same structure as Task 5, MINUS:
- No Edit toggle / MarkdownEditor (always view-only)
- No PDF upload / remove (only download when set)
- The "View full grading policy" link points at the student grading page if one exists, else omit it

Empty state when `syllabusMd` is null: "Your instructor hasn't published a syllabus yet."

Commit:

```bash
git add apps/web/src/pages/student/StudentSyllabusPage.tsx
git commit -m "Web: StudentSyllabusPage (read-only render of syllabus)"
```

---

## Task 7: Routes + side nav

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/SideNav.tsx`

**Step 1: Routes.** In `App.tsx`, find the teacher course route tree (the `<Route path="/teacher/courses/:courseId">` block with nested routes). Add a sibling:

```tsx
<Route path="syllabus" element={<TeacherSyllabusPage />} />
```

Import at top. Same on the student route tree:

```tsx
<Route path="syllabus" element={<StudentSyllabusPage />} />
```

**Step 2: Side nav.** In `SideNav.tsx`, find `teacherCourseSections` (line ~115). Add the syllabus item to the `top` section (right after Modules), or to the `learn` section. Use `BookText` Lucide icon (semantic for a syllabus):

```ts
{ to: `${prefix}/syllabus`, labelKey: 'nav.syllabus', icon: BookText },
```

Same on `studentCourseSections`. Don't forget to add `BookText` to the lucide import block.

**Step 3:** Typecheck clean + commit:

```bash
git add apps/web/src/App.tsx apps/web/src/components/SideNav.tsx
git commit -m "Web: mount syllabus routes + side nav entries"
```

---

## Task 8: Locales

**Files:**
- Modify: `apps/web/src/locales/en.ts`
- Modify: `apps/web/src/locales/zh-CN.ts`

Required new keys (parity in both files):

```
nav.syllabus                                "Syllabus" / 教学大纲

syllabus.title                              "Syllabus" / 教学大纲
syllabus.print                              "Print" / 打印
syllabus.edit                               "Edit" / 编辑
syllabus.save                               "Save" / 保存
syllabus.cancel                             "Cancel" / 取消
syllabus.saved                              "Syllabus saved" / 教学大纲已保存
syllabus.emptyTeacher                       "No syllabus yet — click Edit to add one." / 暂无教学大纲 — 点击"编辑"开始编写。
syllabus.emptyStudent                       "Your instructor hasn't published a syllabus yet." / 教师尚未发布教学大纲。
syllabus.editorPlaceholder                  "Describe the course, learning objectives, required materials, policies, and how to reach you." / 介绍课程概况、学习目标、所需材料、课程政策与联系方式。

syllabus.section.grading                    "Grading" / 评分方式
syllabus.section.gradingHint                "Pulled live from the grading policy." / 自评分策略实时同步。
syllabus.section.viewFullPolicy             "View full grading policy →" / 查看完整评分策略 →
syllabus.section.schedule                   "Schedule" / 课程安排
syllabus.section.scheduleHint               "Modules in order, with assignments and quizzes inline." / 按模块顺序列出,内含作业与测验。
syllabus.section.upcoming                   "Upcoming (next 30 days)" / 即将到期 (未来 30 天)
syllabus.section.upcomingEmpty              "Nothing due in the next 30 days." / 未来 30 天暂无截止事项。

syllabus.pdf.title                          "Official syllabus PDF" / 官方教学大纲 PDF
syllabus.pdf.upload                         "Upload PDF" / 上传 PDF
syllabus.pdf.uploading                      "Uploading…" / 上传中…
syllabus.pdf.remove                         "Remove" / 移除
syllabus.pdf.hint                           "PDF only, up to 50 MB." / 仅支持 PDF,最大 50 MB。
syllabus.pdf.tooLarge                       "File too large (max 50 MB)" / 文件过大 (最大 50 MB)
syllabus.pdf.wrongType                      "PDF files only" / 仅支持 PDF 文件
syllabus.downloadPdf                        "Download PDF" / 下载 PDF
```

Replace hard-coded English in the two new pages with `t()` calls. Commit:

```bash
git add apps/web/src/locales/ apps/web/src/pages/teacher/TeacherSyllabusPage.tsx apps/web/src/pages/student/StudentSyllabusPage.tsx
git commit -m "i18n: syllabus page strings (en + zh-CN)"
```

---

## Task 9: Full verification

```bash
pnpm typecheck
pnpm test
pnpm lint
```

All clean. No new commit.

Optional manual smoke (with `DATABASE_URL` + R2 binding):
1. Apply migration `0023_course_syllabus.sql`.
2. Teacher visits `/teacher/courses/:id/syllabus` → page renders with empty-state.
3. Teacher clicks Edit → writes markdown → Save → MarkdownView shows it.
4. Teacher uploads PDF → Download button appears.
5. Student visits `/student/courses/:id/syllabus` → sees the markdown render + Download.
6. Print button opens print preview without sidebar/topbar visible.

---

## Task 10: PR + merge

```bash
git push -u origin syllabus-page
gh pr create --title "Syllabus page (V1)" --body "$(cat <<'EOF'
## Summary
- New per-course Syllabus page (teacher edit, student read-only) accessible from the "Current course" side nav
- Hybrid model: teacher-authored markdown blob + auto-aggregated structured sections (grading policy snapshot, schedule, upcoming dates) — no duplication risk with the grading-policy and modules pages
- Optional PDF upload via the existing /api/files/upload pipeline; download button shown to teachers and students when set
- Print button uses the browser's window.print() with light @media print CSS to hide sidebar/topbar

## What's in the PR
- Migration 0023: courses.syllabus_md + courses.syllabus_file_asset_id (FK to file_assets, ON DELETE SET NULL)
- Shared: syllabusMd, syllabusFileAssetId, syllabusFileUrl on CourseSummary; updateCourseSchema accepts the two new fields
- API: detail endpoint signs the PDF presigned URL (5-min TTL, same convention as banner); PATCH validates that any incoming syllabusFileAssetId belongs to the same course + caller
- Web: TeacherSyllabusPage (markdown editor + PDF upload + auto-aggregated previews) + StudentSyllabusPage (read-only mirror)
- Side nav: "Syllabus" entry under "Current course"
- Full en + zh-CN i18n parity

## Test plan
- [ ] pnpm typecheck + test + lint clean
- [ ] Manual: teacher writes markdown → Save → student sees the rendered output
- [ ] Manual: teacher uploads PDF → both sides see Download button
- [ ] Manual: Print button hides sidebar/topbar in print preview
- [ ] DB: 0023 migration applies cleanly; PATCH with cross-course syllabus asset → 400
EOF
)"
gh pr merge --squash --delete-branch
```

---

## Notes for the executor

- **No drag-drop, no versioning, no AI generation.** V1 scope.
- **Reuses `'course'` relatedType** on file uploads — no enum change.
- **Auto-sections read from existing hooks** — `useAssignmentGroups`, `useGradingPolicy`, `useModulesList`, `useAssignmentsList`, `useQuizzesList`. If any hook isn't exposed yet, add it to `queries.ts` following the existing patterns.
- **Print CSS** in v1 is a small inline `<style>` on each page — don't try to add a global print stylesheet.
- **Banner reuse** — the hero card uses the existing `gradientFor(course.code)` fallback when no banner is set.
