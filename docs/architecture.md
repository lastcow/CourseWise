# Architecture

> Last verified against `main` at `eb9344b` on 2026-08-04.

CourseWise is a single-tenant teaching platform. The repo is a pnpm monorepo
with three workspaces — `apps/web`, `apps/api`, `packages/shared`.

## Modules

```
                ┌────────────────────────┐
                │   apps/web (Pages)     │
                │   React 18 + Vite      │
                │   TanStack Query, RHF  │
                │ i18next (en, zh-CN, fr)│
                └──────────┬─────────────┘
                           │  HTTPS  (Bearer JWT or API token)
                           ▼
                ┌────────────────────────┐
                │   apps/api (Workers)   │
                │   Hono + zod           │
                │   middleware: auth,    │
                │     scope, role,       │
                │     course access,     │
                │     rate-limit (KV)    │
                └──────┬─────────┬───────┘
                       │         │
              Drizzle  │         │ R2 binding + S3 v4 GET
                       ▼         ▼
            ┌─────────────────┐  ┌─────────────────┐
            │  Neon Postgres  │  │   R2 bucket     │
            │  coursewise     │  │ coursewise-files│
            └─────────────────┘  └─────────────────┘
```

`packages/shared` is the dependency boundary between web and api: types,
zod validators, scope constants, the role / scope-group enums, and the
`API_ROUTES` map all live there so the two sides cannot drift.

## Data flow

### Login → JWT → API call

```
POST /api/auth/login   (email, password)
  → bcrypt verify against users.passwordHash
  → jose signs access JWT (12 h) + refresh JWT (7 d, or 30 d with remember-me)
  → audit_logs insert
  → { accessToken, refreshToken, user }

Subsequent requests:
  Authorization: Bearer <accessToken>
  → requireJwtAuth verifies signature, expiry, audience, issuer
  → loads user, sets c.var.user
  → route handler runs
```

### File upload and download (R2)

```
POST /api/files/upload    multipart { file, courseId, relatedType? }
  → authenticate user and check course write/enrollment access
  → validate filename, MIME/extension allowlist, and size (≤ 50 MiB)
  → stream bytes to R2 through the COURSE_FILES binding
  → insert file_assets (status='ready')
  → { fileAssetId, r2Key, sizeBytes, contentType, originalFilename, status }

GET /api/files/{fileId}/download-url
  → visibility check (admin / course teacher / enrolled student)
  → sign an S3-compatible GET URL with 5-min expiry
```

### Final-grade recalculation

```
POST /api/courses/{courseId}/final-grades/recalculate
  → load grading_policies + weighted assignment groups
  → for each enrolled student:
      aggregate posted assignments / quizzes / graded discussions by group
      roll assignment sets and quiz sets into one score per set
      calculate attendance as its own weighted bucket
      (only *posted* items count — published and past their start date; drafts
       and not-yet-started items are excluded, so the grade reflects released work)
      renormalise across usable weighted buckets → final score
      letter from policy.lettersJson (or DEFAULT_LETTER_GRADES)
      preserve teacherOverrideScore + reason from existing row
  → upsert final_grades, clear isOutdated
  → audit_logs insert
```

### Alert generation

```
POST /api/courses/{courseId}/alerts/generate
  → for each enrolled student, evaluate five rules
       (attendance_low, consecutive_absences, late_submissions,
        quiz_average_low, inactivity)
  → for each triggered rule, upsertOpenAlert(user, course, type)
      — race-safe via partial unique index on (user_id, course_id, type) WHERE status='open'
  → returns counts: generated / refreshed / unchanged
```

## Auth model

CourseWise has two authenticated credential types. Course-resource endpoints
generally accept both; account/session endpoints and selected administration
surfaces are JWT-only:

| Mechanism  | Token format                  | Lifetime         | Carries           |
| ---------- | ----------------------------- | ---------------- | ----------------- |
| JWT access | `Bearer <jose-jwt>`           | 12 h             | user id, role     |
| JWT refresh | request body to `/refresh`   | 7 d; 30 d with remember-me | user id, token family |
| API token  | `Bearer cmpt_<32B base62>`    | until revoked / `expiresAt` | scopes (array) |

On routes that accept both methods, JWT callers automatically pass scope checks;
API-token callers must hold at least one scope from the resource's
`SCOPE_GROUPS[<group>]` list. Role and course-access checks still apply to both.
Scope groups, scopes, and the role-vs-scope allowlists live in
`packages/shared/src/constants.ts`.

Tokens are stored as SHA-256 hashes. The plaintext value is **only** ever
returned in the create response — afterwards the API only knows the hash.

## Permission matrix

|                       | Admin   | Teacher (own course) | Student (enrolled)        |
| --------------------- | ------- | -------------------- | ------------------------- |
| **Courses CRUD**      | full    | own only             | read enrolled courses     |
| **Modules**           | full    | own course           | read PUBLISHED only       |
| **Enrollments**       | full    | manage own course    | self via invitation code  |
| **Invitation codes**  | full    | manage own course    | authenticated validate/redeem |
| **Reading materials** | full    | own course           | read PUBLISHED enrolled   |
| **Files**             | full    | own course           | download if material visible |
| **Presentations**     | full    | own course           | read PUBLISHED enrolled   |
| **Assignments**       | full    | own course           | read PUBLISHED enrolled   |
| **Submissions**       | full    | own course (grade)   | own submissions           |
| **Discussions**       | full    | own course           | post + grade self         |
| **Quizzes**           | full    | own course           | read PUBLISHED, attempt   |
| **Quiz attempts**     | full    | own course (grade)   | own attempts              |
| **Attendance**        | full    | own course           | own records (read)        |
| **Grading policy**    | full    | own course           | —                         |
| **Final grades**      | full    | own course           | own grade (read)          |
| **Alerts**            | full    | own course (resolve) | own alerts (read + mark read) |
| **Dashboards**        | admin   | teacher              | student                   |

Middleware enforcing the rows above:

- `requireRole`, `requireAdmin`, `requireTeacher`, `requireStudent`
- `requireCourseTeacher` — caller is teacher of `:courseId`
- `requireCourseEnrollment` — caller is enrolled in `:courseId`
- `requireCourseAccess` — either of the previous, plus admin
- `requireTokenOwnerRole` — API token owner has the role its scopes require
- `requireTokenCourseAccess` — API token owner has access to `:courseId`
- `requireScopeGroup(<group>)` — JWT passes; API token must hold at least one scope from the named group

## Error envelope

```
{ "success": false, "error": { "code", "message", "i18nKey", "details?" } }
```

The canonical code list lives in `apps/api/src/lib/errors.ts`. It currently
includes validation/auth/access failures, invitation lifecycle errors,
assignment/group/course-window errors, rate limiting, token lifecycle errors,
`INTERNAL_ERROR`, and `UPSTREAM_UNAVAILABLE`. `i18nKey` is the corresponding
`i18next` key (`errors.*`); web clients localize from there.

## Audit log

Writes and sensitive education-record reads record rows in `audit_logs`
(`actor_type`, `actor_user_id`, `actor_token_id`, `action`, `target`, IP/UA,
`metadata_json`, and optional `disclosed_student_id`). Disclosure reads can
fan out to one row per affected student so students can inspect their own
FERPA disclosure history. The admin dashboard also uses the log for recent
activity.

## Rate limiting

`apps/api/src/middleware/rateLimit.ts` keys by IP + route. In production it
uses the Workers KV namespace bound as `RATE_LIMIT_KV`; in local dev it falls
back to an in-memory `Map` per isolate. Applied to authentication, password
reset, invitation validation, and other abuse-sensitive endpoints as configured
by their route handlers. The in-memory fallback is for development only.
