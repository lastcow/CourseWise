# Course Cards Redesign — Design

## Goal

Replace the plain title/code/description cards on `/teacher/courses` and `/student/courses` with a professional, banner-first card grid. Each card carries the course's banner image (or a deterministic gradient when none is set), the course name and code, a two-line description, and a four-stat strip showing how many modules, assignments, presentations, and students the course has. Teachers and admins can upload or clear a banner per course from Course Settings.

## Why

The current cards show four fields of text against a flat card surface. They're functional but feel undifferentiated — every course looks the same, and a teacher who wants to glance at "do I have ungraded work piling up here" or "is the roster what I expected" has to drill into the course. A banner image gives each course visual identity (recognizable at a glance, like Canvas / Google Classroom / Notion), and the count strip turns the card itself into a useful dashboard tile.

## Scope

In scope:

- New nullable `courses.banner_file_asset_id` FK referencing the existing `file_assets` table, with `ON DELETE SET NULL`.
- Hand-authored migration `0022_course_banner.sql`.
- Extend `CourseSummary` (and `CourseDetail`) with `bannerFileAssetId`, `bannerUrl`, and a `counts: { modules, assignments, presentations, students }` block populated server-side per role.
- Extend `PATCH /api/courses/:id` to accept `bannerFileAssetId` (null clears, UUID sets). Validate that the referenced file asset is the teacher's own and is course-scoped.
- Allow `relatedType: 'course'` on the existing `POST /api/files/upload` if the enum doesn't already include it.
- New shared `CourseCard` component used by both `TeacherCoursesPage` and `StudentCoursesPage`.
- Banner upload + remove UI on `TeacherCourseSettings`.
- Full i18n parity in `en.ts` and `zh-CN.ts`.

Out of scope for v1:

- In-browser image cropping.
- Image CDN transforms or server-side resize.
- Drag-and-drop reorder or favoriting on the card grid.
- Per-card stat tiles that drill into sub-pages — the whole card is the click target, no internal sub-links.

## Schema

```ts
// apps/api/src/db/schema.ts — inside the courses table
bannerFileAssetId: uuid('banner_file_asset_id').references(() => fileAssets.id, {
  onDelete: 'set null',
}),
```

`ON DELETE SET NULL` because if the underlying R2 file asset is purged (admin housekeeping, mistakenly-shared image) the course shouldn't break — it just falls back to the gradient.

Migration `apps/api/drizzle/0022_course_banner.sql` follows the hand-authored conventions of `0014` and `0021`:

```sql
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "banner_file_asset_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "courses" ADD CONSTRAINT "courses_banner_file_asset_id_file_assets_id_fk"
   FOREIGN KEY ("banner_file_asset_id") REFERENCES "file_assets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
```

Journal entry `{ idx: 22, version: "7", tag: "0022_course_banner", breakpoints: true, when: <0021.when + 86400000> }` is appended to `meta/_journal.json`.

## Shared types

```ts
export interface CourseSummary {
  // ... existing fields ...
  bannerFileAssetId: string | null;
  bannerUrl: string | null;
  counts: {
    modules: number;
    assignments: number;
    presentations: number;
    students: number;
  };
}
```

`CourseDetail extends CourseSummary` so the same fields ride through.

`updateCourseSchema` gains `bannerFileAssetId: z.string().uuid().nullable().optional()`. `null` clears the banner; `undefined` leaves it; a UUID sets it.

## API

`GET /api/courses` runs the existing role-scoped row query and joins in the banner asset + four `COUNT(*)` subqueries per course. The counts respect role visibility:

- **Teacher / admin**: counts every module, assignment, presentation regardless of status. Enrollment count uses `status = 'enrolled'`.
- **Student**: assignment and presentation counts are filtered to `status = 'published'`; module count is unfiltered (every module is visible to students). Enrollment count is the same.

When `banner_file_asset_id` is non-null, the handler signs a short-lived R2 GET URL (5-minute TTL — same convention as the existing presigned downloads in `routes/files.ts`) and puts it on `summary.bannerUrl`. When null, `bannerUrl: null` and the front-end renders a deterministic gradient.

`PATCH /api/courses/:courseId` accepts `bannerFileAssetId`. When present and non-null, the handler verifies the file asset exists, belongs to the same course (`fileAssets.courseId === courseId`), and is owned by the caller (`fileAssets.ownerId === auth.user.id` or admin). Without this guard, a teacher could point their banner at another course's image. `null` clears the banner.

`POST /api/files/upload` already accepts `relatedType` + `relatedId`. The web UI passes `relatedType: 'course'` + `relatedId: courseId` for banner uploads. If `'course'` isn't already in the `relatedType` enum, we extend it.

## Web

`CourseCard` is a single new component under `apps/web/src/components/course/CourseCard.tsx`, shared by `TeacherCoursesPage` and `StudentCoursesPage`. Layout:

- Top half: banner image (`object-cover`, `h-40`, rounded top) OR a `<div>` filled by the deterministic gradient `gradientFor(course.code)`. A small status badge sits in the top-left corner of the banner; a code pill sits in the top-right. Both are glass-effect (translucent background + backdrop blur) so they read against any image.
- Bottom: bold course title, then `code · termLabel` in muted small text, then a 2-line clamped description.
- A divider, then a 4-stat strip with Lucide icons: `Library` for modules, `ClipboardList` for assignments, `Presentation` for presentations, `Users` for students. Format: `Icon Number Icon Number ...`. The whole strip is a single row that wraps gracefully at narrow widths.
- The whole card is a `<Link>` to the course overview. Hover state: `translate-y-[-2px]`, `shadow-lg`, subtle accent border. Active state lifts slightly less.

The deterministic gradient is a tiny helper that hashes `course.code` and picks one of 12 curated linear gradients from a static palette. Pure function. Tested.

`TeacherCourseSettings` gets a new section above the existing metadata form:

- Card titled "Banner image"
- Current banner preview (or gradient placeholder)
- "Upload image" button → opens a file picker accepting `image/png`, `image/jpeg`, `image/webp`, max 5MB client-side. On select, uploads via `POST /api/files/upload` with `relatedType='course'` + `relatedId=courseId`, then `PATCH /api/courses/:id` with the returned `fileAssetId`. Toast on success; inline error on failure.
- "Remove" button → `PATCH /api/courses/:id` with `bannerFileAssetId: null`. Disabled when no banner is set.
- Helper text: "Recommended: 1600×900, PNG/JPG, under 5MB"

Five locale keys per language: `course.banner.title`, `course.banner.upload`, `course.banner.remove`, `course.banner.hint`, `course.banner.uploaded`. Counts strip uses `common.modules`, `common.assignments`, `common.presentations`, `common.students` or course-scoped equivalents — picks whichever already exists to keep new strings minimal.

## Testing

API permissions (no DB):

- `PATCH /api/courses/:id` with `bannerFileAssetId` field gets normal write-scope handling.
- Wiring smoke for `relatedType: 'course'` on the upload endpoint.

API integration (skipIf no DB):

- Seed a course + a teacher. PATCH banner with a valid file asset → `bannerUrl` is non-null on subsequent GET. PATCH with `null` → `bannerUrl` is null.
- PATCH with a file asset owned by a different course → 400.
- Counts: seed 3 modules, 2 published + 1 draft assignment, 2 published presentations, 4 enrolled + 1 dropped student. Teacher sees `{3,3,2,4}`. Student sees `{3,2,2,4}`.

Web component tests:

- `CourseCard.test.tsx`: renders gradient when `bannerUrl` is null; renders `<img>` when set; stat strip shows the four counts; card link goes to `/teacher/courses/:id/overview` for teacher role and `/student/courses/:id/overview` for student role.
- `gradientFor.test.ts`: same input → same gradient across runs; different codes mostly map to different gradients (twelve buckets, collisions allowed).

Manual smoke before merge:

1. Teacher uploads a banner in Course Settings → preview updates immediately → navigates to `/teacher/courses` → card shows the banner.
2. Teacher clears the banner → card falls back to a gradient.
3. Student visits `/student/courses` → sees the same banner + role-appropriate counts (drafts excluded).
4. Wrong-course file asset attempted via PATCH → 400.
5. Card grid renders correctly at mobile width (single column, 2-up at md, 3-up at lg).

## Risks and trade-offs

- **Counts cost** — four `COUNT(*)` subqueries per row is fine for typical scale (single-digit to low-double-digit courses per user). At hundreds of courses we'd want a cached aggregate; the design accepts this for v1.
- **Presigned banner URL TTL** — 5 minutes is short for a tab that stays open. TanStack Query refetches on focus, so a stale URL self-heals on the next interaction. Acceptable v1.
- **No image transforms** — a 12MB photo is served at 12MB. Client-side 5MB cap mitigates. Long-term, R2 image transforms or a worker-side resize would help.
- **`object-cover` crop** — the teacher uploads an image at whatever aspect ratio; we crop to fit. Recommended dimensions hint nudges them; no in-browser cropper in v1.
- **Other-course-asset attack** — the PATCH handler validates `fileAssets.courseId === courseId` to keep a teacher from pointing their banner at someone else's upload. Without this guard, an admin who can see all uploads could trivially borrow images; with it, teachers must upload through the course's own scope.
