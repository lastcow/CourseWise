# Architecture

CourseWise is a single-tenant teaching platform. The repo is a pnpm monorepo
with three workspaces — `apps/web`, `apps/api`, `packages/shared`.

## Modules

```
                ┌────────────────────────┐
                │   apps/web (Pages)     │
                │   React 18 + Vite      │
                │   TanStack Query, RHF  │
                │   i18next (en, zh-CN)  │
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
              Drizzle  │         │  presigned S3 v4
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
  → jose signs access JWT (15 min) + refresh JWT (7 d)
  → audit_logs insert
  → { accessToken, refreshToken, user }

Subsequent requests:
  Authorization: Bearer <accessToken>
  → requireJwtAuth verifies signature, expiry, audience, issuer
  → loads user, sets c.var.user
  → route handler runs
```

### File upload (R2 presigned PUT)

```
POST /api/files/upload-url    { filename, contentType, size, relatedType }
  → validate MIME + size against MAX_UPLOAD_BYTES
  → file_assets insert (status='pending')
  → sign PUT URL (R2)
  → { fileId, uploadUrl, uploadHeaders }

client PUTs bytes directly to R2 (Worker does NOT proxy)

POST /api/files/complete-upload  { fileId }
  → file_assets.status = 'ready'

GET /api/files/{fileId}/download-url
  → visibility check (admin / course teacher / enrolled student)
  → sign GET URL with 5-min expiry
```

### Final-grade recalculation

```
POST /api/courses/{courseId}/final-grades/recalculate
  → load grading_policies (or backfill default)
  → for each enrolled student:
      aggregate attendance / assignments / quizzes / discussion / final-project
      (only *posted* items count — published and past their start date; drafts
       and not-yet-started items are excluded, so the grade reflects released work)
      weight × normalised score → final score
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

CourseWise accepts two credentials on every authenticated endpoint:

| Mechanism  | Token format                  | Lifetime         | Carries           |
| ---------- | ----------------------------- | ---------------- | ----------------- |
| JWT access | `Bearer <jose-jwt>`           | 15 min           | user id, role     |
| JWT refresh | `Bearer <jose-jwt>` to `/refresh` | 7 d        | user id           |
| API token  | `Bearer cmpt_<32B base62>`    | until revoked / `expiresAt` | scopes (array) |

JWT callers automatically pass every scope check. API-token callers must hold
at least one scope from the resource's `SCOPE_GROUPS[<group>]` list. Scope
groups, scopes, and the role-vs-scope allowlists live in
`packages/shared/src/constants.ts`.

Tokens are stored as SHA-256 hashes. The plaintext value is **only** ever
returned in the create response — afterwards the API only knows the hash.

## Permission matrix

|                       | Admin   | Teacher (own course) | Student (enrolled)        |
| --------------------- | ------- | -------------------- | ------------------------- |
| **Courses CRUD**      | full    | own only             | read PUBLISHED only       |
| **Modules**           | full    | own course           | read                      |
| **Enrollments**       | full    | read own course      | self via invitation code  |
| **Invitation codes**  | full    | read                 | public validate (RL)      |
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

`code` is one of `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`,
`CONFLICT`, `RATE_LIMITED`, `ACCOUNT_LOCKED`, `ACCOUNT_INACTIVE`,
`INVALID_CREDENTIALS`, `INVALID_INVITATION`, `INVALID_TOKEN`, `TOKEN_REVOKED`,
`TOKEN_EXPIRED`, `MISSING_SCOPE`, `INTERNAL_ERROR`. `i18nKey` is the
`i18next` key (`errors.*`); web clients localize from there.

## Audit log

Every write that affects user-visible state (auth events, course edits,
grading-policy changes, manual alerts, token revokes, etc.) writes a row to
`audit_logs` (`actor_id`, `actor_type` jwt|api_token, `action`, `entity_type`,
`entity_id`, `metadata` jsonb). Used by the admin dashboard for the recent-
activity widget.

## Rate limiting

`apps/api/src/middleware/rateLimit.ts` keys by IP + route. In production it
uses the Workers KV namespace bound as `RATE_LIMIT_KV`; in local dev it falls
back to an in-memory `Map` per isolate. Applied to login, register, and
`POST /api/invitation-codes/validate`.
