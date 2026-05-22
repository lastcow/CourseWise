# Course Cards Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship the banner-first course card grid per `docs/plans/2026-05-22-course-cards-redesign-design.md`. After this lands, both `/teacher/courses` and `/student/courses` render redesigned cards with a banner (or deterministic gradient), title + code + description, and a four-stat strip. Teachers/admins set the banner from Course Settings.

**Architecture:** New nullable `courses.banner_file_asset_id` FK on the existing `file_assets` table (cleared with `ON DELETE SET NULL`). `GET /api/courses` joins in the banner and four `COUNT(*)` subqueries; counts are role-aware (students miss drafts). A single shared `CourseCard` component drives both grids. The banner upload reuses the existing `POST /api/files/upload` pipeline with `relatedType='course'`.

**Tech Stack:** TypeScript, Hono, Drizzle ORM (Postgres / Neon HTTP), Cloudflare Workers + R2, Vitest, React, TanStack Query, react-i18next, Tailwind.

---

## Conventions

- Run commands from the worktree root: `/Users/zhijiangchen/CourseWise/.worktrees/course-cards-redesign`.
- After each task: scoped tests, then `pnpm typecheck`, then commit. Single-line commit messages, no Co-Authored-By footer.
- The neon-http driver lacks `db.transaction(...)`. Use single-statement CTEs if you ever need atomicity.
- Hard-code English first; Task 9 i18ns.
- Never bypass hooks. Stage files by name.

---

## Task 1: Shared constants + validators + types

**Files:**
- Modify: `packages/shared/src/constants.ts`
- Modify: `packages/shared/src/validators.ts`
- Modify: `packages/shared/src/types.ts`

**Step 1:** Extend `FILE_RELATED_TYPES` (constants.ts:367) to include `'course'`:

```ts
export const FILE_RELATED_TYPES = ['material', 'assignment', 'submission', 'course'] as const;
```

**Step 2:** In `validators.ts`, find `updateCourseSchema` (grep `updateCourseSchema = z.object`). Add a new optional field:

```ts
bannerFileAssetId: z.string().uuid().nullable().optional(),
```

(Place near other id-typed optional fields. `undefined` leaves the value alone, `null` clears it, UUID sets it.)

**Step 3:** In `types.ts`, find `CourseSummary` (around line 101). Add four new fields just before the close brace:

```ts
bannerFileAssetId: string | null;
bannerUrl: string | null;
counts: {
  modules: number;
  assignments: number;
  presentations: number;
  students: number;
};
```

`CourseDetail` extends `CourseSummary`, so the fields ride through.

**Step 4:** Verify:

```bash
pnpm --filter @coursewise/shared typecheck
pnpm --filter @coursewise/shared build
pnpm --filter @coursewise/api typecheck
pnpm --filter @coursewise/web typecheck
```

The api/web typecheck WILL FAIL — every consumer of `CourseSummary` is now missing fields. That's expected. Do NOT fix it in this task. The compiler errors are a checklist for Tasks 4-7.

**Step 5:** Commit:

```bash
git add packages/shared/
git commit -m "Shared: banner + counts on CourseSummary"
```

---

## Task 2: Drizzle schema

**Files:**
- Modify: `apps/api/src/db/schema.ts`

**Step 1:** Find the `courses` table (around line 245). Add a nullable column inside the column-object literal, near other FK columns:

```ts
bannerFileAssetId: uuid('banner_file_asset_id').references(() => fileAssets.id, {
  onDelete: 'set null',
}),
```

`fileAssets` is declared later in the same file but `.references()` accepts a thunk — order doesn't matter at runtime.

**Step 2:** Verify:

```bash
pnpm --filter @coursewise/api typecheck
```

The api typecheck is still broken from Task 1's CourseSummary changes — that's fine, just confirm no NEW type errors in `schema.ts` itself.

**Step 3:** Commit:

```bash
git add apps/api/src/db/schema.ts
git commit -m "Schema: banner_file_asset_id on courses"
```

---

## Task 3: Migration 0022

**Files:**
- Create: `apps/api/drizzle/0022_course_banner.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`

**Step 1:** Hand-author the migration, matching `0014_course_deletion.sql` / `0021_assignment_quiz_scheduling.sql` style:

```sql
-- Add a per-course banner image. Nullable FK to the existing file_assets
-- table, ON DELETE SET NULL so removing the asset doesn't break the course.

ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "banner_file_asset_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "courses" ADD CONSTRAINT "courses_banner_file_asset_id_file_assets_id_fk"
   FOREIGN KEY ("banner_file_asset_id") REFERENCES "file_assets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
```

**Step 2:** Update `apps/api/drizzle/meta/_journal.json`. Find the entry for `0021_assignment_quiz_scheduling` and append a new entry at the END of the `entries` array:

```json
{
  "idx": 22,
  "version": "7",
  "when": <0021.when + 86400000>,
  "tag": "0022_course_banner",
  "breakpoints": true
}
```

Replace `<0021.when + 86400000>` with the computed number (matches the team's +1 day cadence).

**Step 3:** Verify:

```bash
cat apps/api/drizzle/0022_course_banner.sql
```

Eyeball: column add + FK constraint, both with idempotent guards.

**Step 4:** Commit:

```bash
git add apps/api/drizzle/0022_course_banner.sql apps/api/drizzle/meta/_journal.json
git commit -m "Migration: 0022 courses.banner_file_asset_id"
```

---

## Task 4: API — extend course list + PATCH

**Files:**
- Modify: `apps/api/src/routes/courses.ts`
- Modify: `apps/api/src/routes/files.ts` (only if FILE_RELATED_TYPES extension surfaces an error there)

**Step 1: Update the listing.** Find `r.get('/courses', ...)` at line 56. The existing handler picks rows per role. Replace its body with a single per-role SQL block that joins the banner asset and computes the four counts inline. The handler ends up like:

```ts
r.get('/courses', requireScopeGroup('coursesRead'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const env = c.env;

  // Role-scoped row pull. We do this in raw SQL to layer in the joined
  // banner asset and the four COUNT(*) subqueries with one round trip.
  const scope =
    auth.user.role === 'admin'
      ? sql`true`
      : auth.user.role === 'teacher'
        ? sql`c.id IN (SELECT course_id FROM course_teachers WHERE teacher_id = ${auth.user.id})`
        : sql`c.id IN (SELECT course_id FROM enrollments WHERE student_id = ${auth.user.id} AND status = 'enrolled')`;

  // Students see only published assignments and presentations; teachers/admins see everything.
  const assignmentScope =
    auth.user.role === 'student' ? sql`AND status = 'published'` : sql``;
  const presentationScope =
    auth.user.role === 'student' ? sql`AND status = 'published'` : sql``;

  const result = await db.execute(sql`
    SELECT
      c.id, c.code, c.title, c.description, c.term_label AS "termLabel", c.status,
      c.grading_policy_json AS "gradingPolicyJson", c.archived_at AS "archivedAt",
      c.created_at AS "createdAt", c.updated_at AS "updatedAt",
      c.banner_file_asset_id AS "bannerFileAssetId",
      fa.id AS "banner_asset_id", fa.bucket AS "banner_bucket", fa.object_key AS "banner_object_key",
      (SELECT count(*)::int FROM modules m WHERE m.course_id = c.id) AS "modules_count",
      (SELECT count(*)::int FROM assignments a WHERE a.course_id = c.id ${assignmentScope}) AS "assignments_count",
      (SELECT count(*)::int FROM presentations p WHERE p.course_id = c.id ${presentationScope}) AS "presentations_count",
      (SELECT count(*)::int FROM enrollments e WHERE e.course_id = c.id AND e.status = 'enrolled') AS "students_count"
    FROM courses c
    LEFT JOIN file_assets fa ON fa.id = c.banner_file_asset_id
    WHERE ${scope}
    ORDER BY c.created_at ASC
  `);

  const summaries = await Promise.all(
    result.rows.map(async (row: any) => {
      const bannerUrl =
        row.banner_asset_id && row.banner_object_key
          ? await signR2GetUrl(env, row.banner_bucket, row.banner_object_key, 300)
          : null;
      return toCourseSummaryWithCounts(row, bannerUrl);
    }),
  );
  return success(c, summaries);
});
```

**Step 2: Add a helper** `toCourseSummaryWithCounts(row, bannerUrl)` in the same file. It's like the existing `toCourseSummary` but adapts a raw SQL row + adds the new fields:

```ts
function toCourseSummaryWithCounts(row: Record<string, unknown>, bannerUrl: string | null): CourseSummary {
  return {
    id: row.id as string,
    code: row.code as string,
    title: row.title as string,
    description: (row.description ?? null) as string | null,
    termLabel: (row.termLabel ?? null) as string | null,
    status: row.status as CourseSummary['status'],
    gradingPolicy: (row.gradingPolicyJson ?? null) as GradingPolicy | null,
    archivedAt: (row.archivedAt ?? null) as string | null,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
    bannerFileAssetId: (row.bannerFileAssetId ?? null) as string | null,
    bannerUrl,
    counts: {
      modules: Number(row.modules_count ?? 0),
      assignments: Number(row.assignments_count ?? 0),
      presentations: Number(row.presentations_count ?? 0),
      students: Number(row.students_count ?? 0),
    },
  };
}
```

**Step 3: Update `toCourseSummary`** (used by single-course GET and POST/PATCH responses). It needs to populate the new fields too. The simplest approach: take `bannerUrl` as a param (default null) and `counts` as a param (default zeroes). Existing call sites pass `null`/zeros; only the list path passes real values. Update those call sites too — search the file for every `toCourseSummary(` call and provide `null` + zero counts:

```ts
function toCourseSummary(
  row: typeof courses.$inferSelect,
  bannerUrl: string | null = null,
  counts: CourseSummary['counts'] = { modules: 0, assignments: 0, presentations: 0, students: 0 },
): CourseSummary {
  return {
    // ... existing fields ...
    bannerFileAssetId: row.bannerFileAssetId ?? null,
    bannerUrl,
    counts,
  };
}
```

**Step 4: Update PATCH validation.** Find the PATCH `/courses/:courseId` handler. The Zod schema (extended in Task 1) now accepts `bannerFileAssetId`. The handler needs to:

- When the input includes `bannerFileAssetId` as a UUID: SELECT the file asset, confirm it exists, `courseId === <this course>`, and `ownerId === auth.user.id` (or caller is admin). 400 on mismatch.
- When `null`: clear the column (the existing patch builder already handles `null`).
- When `undefined`: skip.

Use a single query:

```ts
if (input.bannerFileAssetId) {
  const [asset] = await db
    .select({ id: fileAssets.id, ownerId: fileAssets.ownerId, courseId: fileAssets.courseId })
    .from(fileAssets)
    .where(eq(fileAssets.id, input.bannerFileAssetId))
    .limit(1);
  if (!asset || asset.courseId !== courseId || (auth.user.role !== 'admin' && asset.ownerId !== auth.user.id)) {
    throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'Banner asset must be a course-scoped file you uploaded');
  }
  patch.bannerFileAssetId = input.bannerFileAssetId;
} else if (input.bannerFileAssetId === null) {
  patch.bannerFileAssetId = null;
}
```

**Step 5: Sign helper.** The R2 sign helper is in `apps/api/src/lib/r2Sign.ts`. Grep for `signR2GetUrl` to confirm the function name and import; the existing presigned-download flow uses it.

**Step 6: Verify:**

```bash
pnpm --filter @coursewise/api typecheck
pnpm --filter @coursewise/web typecheck    # still broken — that's Task 6-8
pnpm --filter @coursewise/api test
```

API tests should still pass. Web typecheck stays broken until Tasks 6+.

**Step 7: Commit:**

```bash
git add apps/api/src/routes/courses.ts
git commit -m "API: courses list returns banner + role-aware counts"
```

---

## Task 5: API — permissions smoke test

**Files:**
- Modify: `apps/api/src/routes/courses.ts` exists in test files? grep first; if not, this task adds nothing.

**Step 1:** Confirm permission tests run today for `courses.ts`:

```bash
grep -rln "routes/courses\|/api/courses" apps/api/src/routes/*.test.ts | head
```

If a relevant `*.permissions.test.ts` exists, add two cases there:

```ts
it('PATCH /api/courses/:id without auth → 401', async () => {
  const res = await app.request(`/api/courses/${courseId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bannerFileAssetId: null }),
  }, env);
  expect(res.status).toBe(401);
});
```

If no permissions test file exists yet, **skip this task**. The wider integration coverage in Task 10 covers it.

**Step 2: Verify + commit if applicable.**

---

## Task 6: Front-end — `gradientFor` helper

**Files:**
- Create: `apps/web/src/lib/courseGradient.ts`
- Create: `apps/web/src/lib/courseGradient.test.ts`

**Step 1: Failing test.**

```ts
import { describe, expect, it } from 'vitest';
import { gradientFor } from './courseGradient';

describe('gradientFor', () => {
  it('returns the same gradient for the same input', () => {
    expect(gradientFor('CS101')).toBe(gradientFor('CS101'));
  });
  it('returns one of the 12 palette entries', () => {
    const g = gradientFor('SEE-2026-SUMMER');
    expect(g).toMatch(/^linear-gradient\(/);
  });
  it('case-insensitive (CS101 === cs101)', () => {
    expect(gradientFor('CS101')).toBe(gradientFor('cs101'));
  });
});
```

**Step 2: Run test — expect failure.**

```bash
pnpm --filter @coursewise/web test -- courseGradient
```

**Step 3: Implement.**

```ts
// apps/web/src/lib/courseGradient.ts
const PALETTE = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
  'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
  'linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%)',
  'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
  'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)',
  'linear-gradient(135deg, #c471f5 0%, #fa71cd 100%)',
  'linear-gradient(135deg, #5ee7df 0%, #b490ca 100%)',
];

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function gradientFor(courseCode: string): string {
  const idx = hashCode(courseCode.toLowerCase()) % PALETTE.length;
  return PALETTE[idx]!;
}
```

**Step 4: Run test — expect pass.**

**Step 5: Commit.**

```bash
git add apps/web/src/lib/courseGradient.ts apps/web/src/lib/courseGradient.test.ts
git commit -m "Web: courseGradient — deterministic banner fallback"
```

---

## Task 7: Front-end — `CourseCard` component (TDD)

**Files:**
- Create: `apps/web/src/components/course/CourseCard.tsx`
- Create: `apps/web/src/components/course/CourseCard.test.tsx`

**Step 1: Failing test.**

```tsx
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CourseCard } from './CourseCard';
import type { CourseSummary } from '@coursewise/shared';

const base: CourseSummary = {
  id: 'c1',
  code: 'TEST-101',
  title: 'Test Course',
  description: 'A short description.',
  termLabel: 'Spring 2026',
  status: 'active',
  gradingPolicy: null,
  archivedAt: null,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  bannerFileAssetId: null,
  bannerUrl: null,
  counts: { modules: 3, assignments: 5, presentations: 2, students: 18 },
};

function wrap(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe('CourseCard', () => {
  it('renders title, code, and four counts', () => {
    wrap(<CourseCard course={base} hrefBase="/teacher/courses" />);
    expect(screen.getByText('Test Course')).toBeInTheDocument();
    expect(screen.getByText(/TEST-101/)).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();   // modules
    expect(screen.getByText('5')).toBeInTheDocument();   // assignments
    expect(screen.getByText('2')).toBeInTheDocument();   // presentations
    expect(screen.getByText('18')).toBeInTheDocument();  // students
  });

  it('renders an img when bannerUrl is set', () => {
    wrap(<CourseCard course={{ ...base, bannerUrl: 'https://r2/banner.png' }} hrefBase="/teacher/courses" />);
    const img = screen.getByRole('img', { name: /test course/i });
    expect(img).toHaveAttribute('src', 'https://r2/banner.png');
  });

  it('does NOT render an img when bannerUrl is null (uses gradient instead)', () => {
    wrap(<CourseCard course={base} hrefBase="/teacher/courses" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
```

**Step 2: Run — expect failure (module not found).**

**Step 3: Implement.**

```tsx
import { Link } from 'react-router-dom';
import { ClipboardList, Library, Presentation, Users } from 'lucide-react';
import type { CourseSummary } from '@coursewise/shared';
import { Badge } from '@/components/ui/badge';
import { gradientFor } from '@/lib/courseGradient';

type Props = {
  course: CourseSummary;
  hrefBase: string; // '/teacher/courses' or '/student/courses'
};

export function CourseCard({ course, hrefBase }: Props): JSX.Element {
  const banner = course.bannerUrl ? (
    <img
      src={course.bannerUrl}
      alt={course.title}
      className="h-40 w-full object-cover"
      loading="lazy"
    />
  ) : (
    <div
      className="h-40 w-full"
      style={{ background: gradientFor(course.code) }}
      aria-hidden
    />
  );

  return (
    <Link
      to={`${hrefBase}/${course.id}`}
      className="group block overflow-hidden rounded-md border bg-card transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="relative">
        {banner}
        <div className="absolute left-2 top-2">
          <Badge
            variant={course.status === 'active' ? 'success' : 'secondary'}
            className="bg-background/80 backdrop-blur"
          >
            {course.status}
          </Badge>
        </div>
        <div className="absolute right-2 top-2 rounded-md bg-background/80 px-2 py-0.5 text-xs font-mono backdrop-blur">
          {course.code}
        </div>
      </div>
      <div className="space-y-2 p-4">
        <h3 className="line-clamp-1 text-base font-semibold">{course.title}</h3>
        <p className="text-xs text-muted-foreground">
          {course.code}
          {course.termLabel ? ` · ${course.termLabel}` : ''}
        </p>
        {course.description ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">{course.description}</p>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
        <Stat icon={Library} value={course.counts.modules} />
        <Stat icon={ClipboardList} value={course.counts.assignments} />
        <Stat icon={Presentation} value={course.counts.presentations} />
        <Stat icon={Users} value={course.counts.students} />
      </div>
    </Link>
  );
}

function Stat({ icon: Icon, value }: { icon: typeof Library; value: number }) {
  return (
    <span className="flex items-center gap-1">
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span className="tabular-nums">{value}</span>
    </span>
  );
}
```

**Step 4: Run — expect pass.**

**Step 5: Commit.**

```bash
git add apps/web/src/components/course/CourseCard.tsx apps/web/src/components/course/CourseCard.test.tsx
git commit -m "Web: CourseCard with banner + counts strip"
```

---

## Task 8: Front-end — wire CourseCard into both pages

**Files:**
- Modify: `apps/web/src/pages/teacher/TeacherCoursesPage.tsx`
- Modify: `apps/web/src/pages/student/StudentCoursesPage.tsx`

**Step 1:** Replace the inline card markup in `TeacherCoursesPage.tsx` with `CourseCard`:

```tsx
import { CourseCard } from '@/components/course/CourseCard';
// ... in the JSX, replace the map body:
{list.data.map((c) => <CourseCard key={c.id} course={c} hrefBase="/teacher/courses" />)}
```

Same change to `StudentCoursesPage.tsx` with `hrefBase="/student/courses"`.

The existing layout (`grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3`) stays — only the per-card content changes.

**Step 2: Verify.**

```bash
pnpm --filter @coursewise/web typecheck
pnpm --filter @coursewise/web test
```

Both clean. The web typecheck failures from Task 1 should now be resolved (or the next task closes them).

**Step 3: Commit.**

```bash
git add apps/web/src/pages/teacher/TeacherCoursesPage.tsx apps/web/src/pages/student/StudentCoursesPage.tsx
git commit -m "Web: course lists use CourseCard"
```

---

## Task 9: Front-end — banner upload UI on TeacherCourseSettings

**Files:**
- Modify: `apps/web/src/pages/teacher/TeacherCourseSettings.tsx`
- Modify: `apps/web/src/lib/queries.ts` (extend `useUpdateCourse` if needed; probably no change since the mutation already passes the full input through)

**Step 1: Find the file upload pattern.** Grep an existing upload site to copy:

```bash
grep -rln "files/upload\|/api/files/upload" apps/web/src/ | head
```

Use the same pattern — `FormData`, `fetch`, then read the returned `fileAssetId`.

**Step 2: Add a "Banner image" section** at the top of `TeacherCourseSettings.tsx`:

```tsx
const [uploading, setUploading] = useState(false);
const updateCourse = useUpdateCourse();
const toast = useToast();

async function onPickBanner(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    toast.push({ title: 'Image too large (max 5MB)', tone: 'error' });
    return;
  }
  setUploading(true);
  try {
    const form = new FormData();
    form.append('file', file);
    form.append('courseId', courseId);
    form.append('relatedType', 'course');
    form.append('relatedId', courseId);
    const res = await fetch('/api/files/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: form,
    });
    if (!res.ok) throw new Error('upload failed');
    const payload = await res.json();
    const fileAssetId = payload?.data?.id;
    await updateCourse.mutateAsync({ courseId, bannerFileAssetId: fileAssetId });
    toast.push({ title: 'Banner updated', tone: 'success' });
  } catch (e) {
    toast.push({ title: e instanceof Error ? e.message : String(e), tone: 'error' });
  } finally {
    setUploading(false);
  }
}

async function onClearBanner() {
  await updateCourse.mutateAsync({ courseId, bannerFileAssetId: null });
  toast.push({ title: 'Banner removed', tone: 'success' });
}
```

Adapt the auth header pattern to whatever the existing fetches do — there may be a wrapper.

**Step 3: Render the section.**

```tsx
<Card>
  <CardHeader>
    <CardTitle>Banner image</CardTitle>
  </CardHeader>
  <CardContent className="space-y-3">
    {course.data?.bannerUrl ? (
      <img src={course.data.bannerUrl} alt="" className="h-40 w-full rounded-md object-cover" />
    ) : (
      <div
        className="h-40 w-full rounded-md"
        style={{ background: gradientFor(course.data?.code ?? '') }}
      />
    )}
    <div className="flex flex-wrap gap-2">
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
        {uploading ? 'Uploading…' : 'Upload image'}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={onPickBanner}
          disabled={uploading}
        />
      </label>
      {course.data?.bannerFileAssetId ? (
        <Button variant="outline" onClick={onClearBanner}>
          Remove
        </Button>
      ) : null}
    </div>
    <p className="text-xs text-muted-foreground">
      Recommended: 1600×900, PNG/JPG/WebP, under 5MB.
    </p>
  </CardContent>
</Card>
```

**Step 4: Verify.**

```bash
pnpm --filter @coursewise/web typecheck
```

**Step 5: Commit.**

```bash
git add apps/web/src/pages/teacher/TeacherCourseSettings.tsx
git commit -m "Web: banner upload + remove in Course Settings"
```

---

## Task 10: i18n

**Files:**
- Modify: `apps/web/src/locales/en.ts`
- Modify: `apps/web/src/locales/zh-CN.ts`

Required new keys (every key must exist in BOTH files):

```
course.banner.title             "Banner image" / 横幅图片
course.banner.upload            "Upload image" / 上传图片
course.banner.uploading         "Uploading…" / 上传中…
course.banner.remove            "Remove" / 移除
course.banner.hint              "Recommended: 1600×900, PNG/JPG/WebP, under 5MB." / 推荐尺寸 1600×900,PNG/JPG/WebP,5MB 以内。
course.banner.updated           "Banner updated" / 横幅已更新
course.banner.removed           "Banner removed" / 横幅已移除
course.banner.tooLarge          "Image too large (max 5MB)" / 图片过大 (最大 5MB)
```

For the card stat strip, prefer reusing existing keys (`modules.title`, `assignments.title`, `presentations.title`, `enrollments.title` or similar). Grep first; only add new keys if no good existing one fits.

Replace hard-coded English in `TeacherCourseSettings.tsx` and `CourseCard.tsx` with `t()` calls.

**Step 1: Add keys + replace hard-coded strings. Step 2: Verify typecheck + tests. Step 3: Commit:**

```bash
git add apps/web/src/locales/ apps/web/src/pages/teacher/TeacherCourseSettings.tsx apps/web/src/components/course/CourseCard.tsx
git commit -m "i18n: course banner strings"
```

---

## Task 11: Full verification

```bash
pnpm typecheck
pnpm test
pnpm lint
```

All three clean.

Optional manual smoke (only if `DATABASE_URL` available locally + R2 binding set up):

1. Apply migration `0022_course_banner.sql` via `pnpm --filter @coursewise/api db:migrate`.
2. Teacher uploads a banner via Course Settings → preview updates → back to `/teacher/courses` → card shows banner.
3. Clear banner → card falls back to gradient.
4. Student visits `/student/courses` → sees banner + role-filtered counts.

No new commit — verification only.

---

## Task 12: PR + merge

Per the standing workflow:

```bash
git push -u origin course-cards-redesign
gh pr create --title "Course cards redesign with banner + counts" --body "$(cat <<'EOF'
## Summary
- Replaces the plain title/code/description cards on /teacher/courses and /student/courses with banner-first design
- Each card shows banner (or deterministic gradient when none), title, code, 2-line description, and a 4-stat strip (modules / assignments / presentations / students)
- Counts are role-aware (students miss drafts)
- Teacher/admin uploads banner from Course Settings via the existing /api/files/upload pipeline

## Test plan
- [ ] pnpm typecheck + test + lint clean
- [ ] Manual: upload banner from Course Settings → card grid shows it
- [ ] Manual: clear banner → card falls back to gradient
- [ ] Manual: student sees role-filtered counts (drafts excluded)
- [ ] DB: apply 0022 migration; existing courses get null banner; PATCH with cross-course asset → 400

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --squash --delete-branch
```

---

## Notes for the executor

- **Counts cost** — 4 COUNT(*) subqueries per row is fine for typical scale. Don't bother caching for v1.
- **Banner URL TTL** — 5 minutes. TanStack Query refetch on focus self-heals.
- **Cross-course asset attack** — PATCH validator must check `fileAssets.courseId === courseId`. Without that guard, a teacher could borrow someone else's image.
- **`relatedType` enum extension** — adding `'course'` to FILE_RELATED_TYPES is a Zod-level change; no DB migration needed because the column is plain text.
- **No image cropper, no CDN transforms.** Out of scope for v1.
