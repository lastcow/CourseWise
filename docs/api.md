# API reference

This is the human-readable cross-reference for the CourseWise REST API. For
the machine-readable spec, `GET /api/openapi.json` returns a complete
OpenAPI 3.1 document (also rebuildable via `buildOpenApiSpec()` in
`apps/api/src/lib/openapi.ts`).

## Conventions

- **Base URL** — local: `http://localhost:8787`, prod: your Workers route.
- **Auth header** — `Authorization: Bearer <token>` on every authenticated
  endpoint. `<token>` is either a JWT access token from
  `POST /api/auth/login` / `/refresh`, or an API token of the form `cmpt_…`.
- **Response envelope**
  - Success: `{ "success": true, "data": ... }`
  - Error: `{ "success": false, "error": { "code", "message", "i18nKey", "details?" } }`
- **Pagination** — list endpoints accept `limit` and `offset` query params.
- **i18n** — error `i18nKey` is the `i18next` key (`errors.*`); web clients
  localize from it.

### Scopes

An API-token caller must hold at least one scope from the route's
**scope group**. Scope groups (defined in `packages/shared/src/constants.ts`)
collapse the "JWT admin/teacher/student" allowance into a token-friendly
set. For example, `coursesRead` accepts any of:

```
admin:read, admin:write, teacher:read, teacher:write, courses:read, courses:write
```

JWT callers automatically pass scope checks; the resource-level role rules
above the scope check still apply.

---

## Public route whitelist

Every endpoint listed in the rest of this document requires a Bearer token.
The complete list of routes that accept anonymous traffic is:

| Method | Path                              | Description                          |
| ------ | --------------------------------- | ------------------------------------ |
| GET    | `/api/health`                     | Liveness probe                       |
| GET    | `/api/version`                    | Version + commit + build timestamp   |
| GET    | `/api/openapi.json`               | OpenAPI 3.1 document for this server |
| POST   | `/api/auth/login`                 | Email + password → JWT pair          |
| POST   | `/api/auth/refresh`               | Rotate the JWT pair                  |
| POST   | `/api/auth/register-student`      | Register a student against an invitation code (rate-limited) |

`apps/api/src/auth-coverage.test.ts` walks the live Hono route table on every
CI run and asserts the invariant: any route not on this list rejects a
no-auth request with `401 UNAUTHORIZED`.

## Meta

| Method | Path                  | Auth   | Description                          |
| ------ | --------------------- | ------ | ------------------------------------ |
| GET    | `/api/health`         | public | Liveness probe                       |
| GET    | `/api/version`        | public | Version + commit + build timestamp   |
| GET    | `/api/openapi.json`   | public | OpenAPI 3.1 document for this server |

## Auth

| Method | Path                              | Auth     | Description                              |
| ------ | --------------------------------- | -------- | ---------------------------------------- |
| POST   | `/api/auth/register-student`      | public   | Register a student against an invitation code (rate-limited) |
| POST   | `/api/auth/login`                 | public   | Email + password → JWT pair              |
| POST   | `/api/auth/refresh`               | public   | Rotate the JWT pair                      |
| POST   | `/api/auth/logout`                | Bearer   | Revoke the supplied refresh token (caller must hold a valid JWT or API token) |
| GET    | `/api/auth/me`                    | JWT      | Current user                             |

## Me (self-service)

JWT-only. The `/api/me` group is for the logged-in user managing their own
preferences and tokens.

| Method | Path                                | Description                          |
| ------ | ----------------------------------- | ------------------------------------ |
| GET    | `/api/me/preferences`               | Get preferences (`preferredLanguage`) |
| PATCH  | `/api/me/preferences`               | Update preferences                   |
| GET    | `/api/me/api-tokens`                | List my tokens (no plaintext, includes revoked) |
| POST   | `/api/me/api-tokens`                | Mint a token: body `{ name, expiresInDays? }`. Scopes auto-bind to caller's role (server rejects any client-supplied `scopes` field). Plaintext returned **once**. |
| POST   | `/api/me/api-tokens/{id}/revoke`    | Revoke one of my tokens              |
| GET    | `/api/me/alerts`                    | My alerts across courses             |
| POST   | `/api/me/alerts/{alertId}/read`     | Mark alert as read                   |
| GET    | `/api/me/courses/{courseId}/attendance` | My attendance records            |
| GET    | `/api/me/courses/{courseId}/final-grade` | My final grade                  |
| GET    | `/api/me/quizzes/{quizId}/attempts` | My attempts for a quiz               |

## Admin

JWT, role `admin`.

| Method | Path                                    | Description                       |
| ------ | --------------------------------------- | --------------------------------- |
| GET    | `/api/admin/api-tokens`                 | List all API tokens               |
| POST   | `/api/admin/api-tokens`                 | Mint a token (any scope)          |
| POST   | `/api/admin/api-tokens/{id}/revoke`     | Revoke any token                  |
| GET    | `/api/admin/users/{userId}/api-tokens`  | List a user's tokens              |

## Teacher

JWT, role `teacher`.

| Method | Path                                  | Description                          |
| ------ | ------------------------------------- | ------------------------------------ |
| GET    | `/api/teacher/api-tokens`             | List my teacher tokens               |
| POST   | `/api/teacher/api-tokens`             | Mint a teacher token (non-admin scopes only) |
| POST   | `/api/teacher/api-tokens/{id}/revoke` | Revoke my token                      |

## Invitation codes

| Method | Path                                       | Auth                          | Description                          |
| ------ | ------------------------------------------ | ----------------------------- | ------------------------------------ |
| POST   | `/api/invitation-codes/validate`           | Bearer (rate-limited)         | Validate an invitation code. As of COU-17 this requires a Bearer token; anonymous registration validates the code as part of `POST /api/auth/register-student`. |
| GET    | `/api/invitation-codes`                    | admin · `invitationCodesRead` | List invitation codes                |
| GET    | `/api/invitation-codes/{id}`               | admin · `invitationCodesRead` | Get an invitation code               |
| POST   | `/api/invitation-codes`                    | admin · `invitationCodesWrite`| Create an invitation code            |
| PATCH  | `/api/invitation-codes/{id}`               | admin · `invitationCodesWrite`| Update an invitation code            |
| POST   | `/api/invitation-codes/{id}/deactivate`    | admin · `invitationCodesWrite`| Deactivate an invitation code        |

## Courses

| Method | Path                                                       | Scope          | Description                |
| ------ | ---------------------------------------------------------- | -------------- | -------------------------- |
| GET    | `/api/courses`                                             | `coursesRead`  | List courses for caller    |
| POST   | `/api/courses`                                             | `coursesWrite` | Create a course            |
| GET    | `/api/courses/{courseId}`                                  | `coursesRead`  | Get a course               |
| PATCH  | `/api/courses/{courseId}`                                  | `coursesWrite` | Update a course            |
| DELETE | `/api/courses/{courseId}`                                  | `coursesWrite` | Delete a course            |
| POST   | `/api/courses/{courseId}/archive`                          | `coursesWrite` | Archive                    |
| POST   | `/api/courses/{courseId}/activate`                         | `coursesWrite` | Activate                   |
| GET    | `/api/courses/{courseId}/students`                         | `coursesRead`  | List enrolled students     |
| POST   | `/api/courses/{courseId}/enrollments`                      | admin · `coursesWrite` | Enroll a student   |
| DELETE | `/api/courses/{courseId}/enrollments/{studentId}`          | admin · `coursesWrite` | Unenroll a student |

## Modules

| Method | Path                                                | Scope          | Description           |
| ------ | --------------------------------------------------- | -------------- | --------------------- |
| GET    | `/api/courses/{courseId}/modules`                   | `coursesRead`  | List modules          |
| POST   | `/api/courses/{courseId}/modules`                   | `coursesWrite` | Create a module       |
| POST   | `/api/courses/{courseId}/modules/reorder`           | `coursesWrite` | Reorder modules       |
| GET    | `/api/modules/{moduleId}`                           | `coursesRead`  | Get a module          |
| PATCH  | `/api/modules/{moduleId}`                           | `coursesWrite` | Update a module       |
| DELETE | `/api/modules/{moduleId}`                           | `coursesWrite` | Delete a module       |

## Reading materials

| Method | Path                                                | Scope             | Description                    |
| ------ | --------------------------------------------------- | ----------------- | ------------------------------ |
| GET    | `/api/courses/{courseId}/materials`                 | `materialsRead`   | List reading materials         |
| POST   | `/api/courses/{courseId}/materials`                 | `materialsWrite`  | Create a reading material      |
| GET    | `/api/materials/{materialId}`                       | `materialsRead`   | Get a reading material         |
| PATCH  | `/api/materials/{materialId}`                       | `materialsWrite`  | Update a reading material      |
| DELETE | `/api/materials/{materialId}`                       | `materialsWrite`  | Delete a reading material      |
| POST   | `/api/materials/{materialId}/publish`               | `materialsWrite`  | Publish                        |
| POST   | `/api/materials/{materialId}/archive`               | `materialsWrite`  | Archive                        |

## Files (R2)

| Method | Path                                | Scope            | Description                          |
| ------ | ----------------------------------- | ---------------- | ------------------------------------ |
| POST   | `/api/files/upload`                 | `materialsWrite` | Direct multipart upload (single call) |
| GET    | `/api/files/{fileId}/download-url`  | `materialsRead`  | Presigned GET URL (5 min)            |
| DELETE | `/api/files/{fileId}`               | `materialsWrite` | Delete file asset                    |

### `POST /api/files/upload`

Uploads a single file in one call. The Worker streams the body straight to R2
via the bound bucket (no S3-API credentials involved), inserts a `file_assets`
row in `ready` status, and returns the asset id.

Request — `multipart/form-data`:

| Field         | Required | Description                                                        |
| ------------- | -------- | ------------------------------------------------------------------ |
| `file`        | yes      | The binary file. `name` and `type` are read from the form part.   |
| `courseId`    | yes      | UUID of the course the file attaches to.                           |
| `relatedType` | no       | `material` (default) · `assignment` · `submission`.                |

Validation (returns 400 on failure):

- File name ≤ 255 chars, no `/ \ ? < > : " | *`
- `Content-Type` of the file part must be in the upload allowlist
  (see `ALLOWED_UPLOAD_MIME_TYPES` in `packages/shared/src/constants.ts`)
- File size > 0 and ≤ `MAX_UPLOAD_BYTES` (50 MiB)
- `courseId` must be a UUID

Authorization: teachers/admins can upload `material`/`assignment` parts to
courses they can write; enrolled students may upload `submission` parts.

Response — `201 Created`:

```json
{
  "success": true,
  "data": {
    "fileAssetId": "uuid",
    "r2Key": "courses/<courseId>/<uuid>/<filename>",
    "sizeBytes": 12345,
    "contentType": "application/pdf",
    "originalFilename": "syllabus.pdf",
    "status": "ready"
  }
}
```

Example with curl:

```sh
curl -X POST "$API/api/files/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./syllabus.pdf;type=application/pdf" \
  -F "courseId=$COURSE_ID" \
  -F "relatedType=material"
```

## Presentations & slides

| Method | Path                                                       | Scope                 |
| ------ | ---------------------------------------------------------- | --------------------- |
| GET    | `/api/courses/{courseId}/presentations`                    | `presentationsRead`   |
| POST   | `/api/courses/{courseId}/presentations`                    | `presentationsWrite`  |
| GET    | `/api/presentations/{presentationId}`                      | `presentationsRead`   |
| PATCH  | `/api/presentations/{presentationId}`                      | `presentationsWrite`  |
| DELETE | `/api/presentations/{presentationId}`                      | `presentationsWrite`  |
| POST   | `/api/presentations/{presentationId}/publish`              | `presentationsWrite`  |
| POST   | `/api/presentations/{presentationId}/archive`              | `presentationsWrite`  |
| GET    | `/api/presentations/{presentationId}/slides`               | `presentationsRead`   |
| POST   | `/api/presentations/{presentationId}/slides`               | `presentationsWrite`  |
| POST   | `/api/presentations/{presentationId}/slides/reorder`       | `presentationsWrite`  |
| GET    | `/api/slides/{slideId}`                                    | `presentationsRead`   |
| PATCH  | `/api/slides/{slideId}`                                    | `presentationsWrite`  |
| DELETE | `/api/slides/{slideId}`                                    | `presentationsWrite`  |

## Assignments & submissions

| Method | Path                                                       | Scope                 |
| ------ | ---------------------------------------------------------- | --------------------- |
| GET    | `/api/courses/{courseId}/assignments`                      | `assignmentsRead`     |
| POST   | `/api/courses/{courseId}/assignments`                      | `assignmentsWrite`    |
| GET    | `/api/assignments/{assignmentId}`                          | `assignmentsRead`     |
| PATCH  | `/api/assignments/{assignmentId}`                          | `assignmentsWrite`    |
| DELETE | `/api/assignments/{assignmentId}`                          | `assignmentsWrite`    |
| POST   | `/api/assignments/{assignmentId}/publish`                  | `assignmentsWrite`    |
| POST   | `/api/assignments/{assignmentId}/close`                    | `assignmentsWrite`    |
| POST   | `/api/assignments/{assignmentId}/archive`                  | `assignmentsWrite`    |
| GET    | `/api/assignments/{assignmentId}/submissions`              | `submissionsRead`     |
| POST   | `/api/assignments/{assignmentId}/submissions`              | `submissionsWrite`    |
| GET    | `/api/submissions/{submissionId}`                          | `submissionsRead`     |
| PATCH  | `/api/submissions/{submissionId}`                          | `submissionsWrite`    |
| POST   | `/api/submissions/{submissionId}/submit`                   | `submissionsWrite`    |
| POST   | `/api/submissions/{submissionId}/unsubmit`                 | `submissionsWrite`    |
| POST   | `/api/submissions/{submissionId}/grade`                    | `gradesWrite`         |
| PATCH  | `/api/submissions/{submissionId}/return`                   | `gradesWrite`         |

## Discussions

| Method | Path                                                       | Scope               |
| ------ | ---------------------------------------------------------- | ------------------- |
| GET    | `/api/courses/{courseId}/discussion-topics`                | `discussionsRead`   |
| POST   | `/api/courses/{courseId}/discussion-topics`                | `discussionsWrite`  |
| GET    | `/api/discussion-topics/{topicId}`                         | `discussionsRead`   |
| PATCH  | `/api/discussion-topics/{topicId}`                         | `discussionsWrite`  |
| DELETE | `/api/discussion-topics/{topicId}`                         | `discussionsWrite`  |
| POST   | `/api/discussion-topics/{topicId}/publish`                 | `discussionsWrite`  |
| POST   | `/api/discussion-topics/{topicId}/archive`                 | `discussionsWrite`  |
| POST   | `/api/discussion-topics/{topicId}/pin`                     | `discussionsWrite`  |
| POST   | `/api/discussion-topics/{topicId}/unpin`                   | `discussionsWrite`  |
| GET    | `/api/discussion-topics/{topicId}/posts`                   | `discussionsRead`   |
| POST   | `/api/discussion-topics/{topicId}/posts`                   | `discussionsWrite`  |
| GET    | `/api/discussion-posts/{postId}`                           | `discussionsRead`   |
| PATCH  | `/api/discussion-posts/{postId}`                           | `discussionsWrite`  |
| DELETE | `/api/discussion-posts/{postId}`                           | `discussionsWrite`  |
| POST   | `/api/discussion-topics/{topicId}/grades`                  | `gradesWrite`       |
| GET    | `/api/discussion-topics/{topicId}/grades`                  | `gradesRead`        |
| PATCH  | `/api/discussion-topics/{topicId}/grades/{studentId}`      | `gradesWrite`       |

## Quizzes

| Method | Path                                              | Scope                 |
| ------ | ------------------------------------------------- | --------------------- |
| GET    | `/api/courses/{courseId}/quizzes`                 | `quizzesRead`         |
| POST   | `/api/courses/{courseId}/quizzes`                 | `quizzesWrite`        |
| GET    | `/api/quizzes/{quizId}`                           | `quizzesRead`         |
| PATCH  | `/api/quizzes/{quizId}`                           | `quizzesWrite`        |
| DELETE | `/api/quizzes/{quizId}`                           | `quizzesWrite`        |
| POST   | `/api/quizzes/{quizId}/publish`                   | `quizzesWrite`        |
| POST   | `/api/quizzes/{quizId}/close`                     | `quizzesWrite`        |
| POST   | `/api/quizzes/{quizId}/archive`                   | `quizzesWrite`        |
| GET    | `/api/quizzes/{quizId}/questions`                 | `quizzesRead`         |
| POST   | `/api/quizzes/{quizId}/questions`                 | `quizzesWrite`        |
| GET    | `/api/quiz-questions/{questionId}`                | `quizzesRead`         |
| PATCH  | `/api/quiz-questions/{questionId}`                | `quizzesWrite`        |
| DELETE | `/api/quiz-questions/{questionId}`                | `quizzesWrite`        |
| POST   | `/api/quizzes/{quizId}/attempts`                  | `quizAttemptsWrite`   |
| POST   | `/api/quiz-attempts/{attemptId}/submit`           | `quizAttemptsWrite`   |
| GET    | `/api/quiz-attempts/{attemptId}`                  | `quizAttemptsRead`    |
| PATCH  | `/api/quiz-attempts/{attemptId}`                  | `quizAttemptsWrite`   |
| POST   | `/api/quiz-answers/{answerId}/grade`              | `quizGradeWrite`      |
| GET    | `/api/quizzes/{quizId}/attempts`                  | `quizAttemptsRead`    |
| PATCH  | `/api/quiz-attempts/{attemptId}/review`           | `quizGradeWrite`      |

## Attendance

| Method | Path                                                       | Scope              |
| ------ | ---------------------------------------------------------- | ------------------ |
| GET    | `/api/courses/{courseId}/attendance-sessions`              | `attendanceRead`   |
| POST   | `/api/courses/{courseId}/attendance-sessions`              | `attendanceWrite`  |
| GET    | `/api/attendance-sessions/{sessionId}`                     | `attendanceRead`   |
| PATCH  | `/api/attendance-sessions/{sessionId}`                     | `attendanceWrite`  |
| POST   | `/api/attendance-sessions/{sessionId}/close`               | `attendanceWrite`  |
| DELETE | `/api/attendance-sessions/{sessionId}`                     | `attendanceWrite`  |
| GET    | `/api/attendance-sessions/{sessionId}/records`             | `attendanceRead`   |
| POST   | `/api/attendance-sessions/{sessionId}/records`             | `attendanceWrite`  |
| GET    | `/api/courses/{courseId}/attendance/export.csv`            | `attendanceRead`   |

## Grading policy & final grades

| Method | Path                                                       | Scope          | Description                            |
| ------ | ---------------------------------------------------------- | -------------- | -------------------------------------- |
| GET    | `/api/courses/{courseId}/grading-policy`                   | `gradesRead`   | Get policy                             |
| PUT    | `/api/courses/{courseId}/grading-policy`                   | `gradesWrite`  | Update policy (sum must equal 100)     |
| GET    | `/api/courses/{courseId}/final-grades`                     | `gradesRead`   | List final grades                      |
| POST   | `/api/courses/{courseId}/final-grades/recalculate`         | `gradesWrite`  | Recompute every student's final grade  |
| PATCH  | `/api/final-grades/{finalGradeId}`                         | `gradesWrite`  | Teacher override                       |
| GET    | `/api/courses/{courseId}/grades/export.csv`                | `gradesRead`   | CSV export                             |

CSV columns (in order): `Student`, `Email`, `Course Code`, `Course Title`,
`Score`, `Letter Grade`, `Override Score`, `Override Reason`, `Outdated`.

## Alerts

| Method | Path                                                       | Scope          | Description                                  |
| ------ | ---------------------------------------------------------- | -------------- | -------------------------------------------- |
| GET    | `/api/courses/{courseId}/alerts`                           | `alertsRead`   | List alerts for a course                     |
| POST   | `/api/courses/{courseId}/alerts`                           | `alertsWrite`  | Manual alert                                 |
| POST   | `/api/courses/{courseId}/alerts/generate`                  | `alertsWrite`  | Evaluate the five risk rules                 |
| POST   | `/api/alerts/{alertId}/resolve`                            | `alertsWrite`  | Resolve / dismiss                            |

The five risk rules (defaults; configurable per course via grading policy in
future):

- `attendance_low` — attendance rate < **70 %**
- `consecutive_absences` — ≥ **2** consecutive absent sessions
- `late_submissions` — ≥ **2** late assignment submissions
- `quiz_average_low` — quiz average < **60 %**
- `inactivity` — no activity for **7 days** (escalates to `critical` at 14 d)

## Dashboards

| Method | Path                          | Scope             | Description               |
| ------ | ----------------------------- | ----------------- | ------------------------- |
| GET    | `/api/dashboards/admin`       | admin · `dashboardsRead`   | Workspace-wide aggregates |
| GET    | `/api/dashboards/teacher`     | teacher · `dashboardsRead` | At-risk + ungraded queue  |
| GET    | `/api/dashboards/student`     | `dashboardsRead`           | Own course summaries      |

## Error codes

| `code`                | HTTP | Meaning                                              | `i18nKey`              |
| --------------------- | ---- | ---------------------------------------------------- | ---------------------- |
| `VALIDATION_ERROR`    | 400  | Request body / query failed zod validation           | `errors.validation`    |
| `UNAUTHORIZED`        | 401  | No / invalid token                                   | `errors.unauthorized`  |
| `INVALID_CREDENTIALS` | 401  | Login failed                                         | `errors.invalidCredentials` |
| `INVALID_TOKEN`       | 401  | Refresh / API token is malformed                     | `errors.invalidToken`  |
| `TOKEN_EXPIRED`       | 401  | JWT expired                                          | `errors.tokenExpired`  |
| `TOKEN_REVOKED`       | 401  | Refresh / API token has been revoked                 | `errors.tokenRevoked`  |
| `FORBIDDEN`           | 403  | Role does not permit this action                     | `errors.forbidden`     |
| `MISSING_SCOPE`       | 403  | API token lacks a required scope                     | `errors.missingScope`  |
| `ACCOUNT_LOCKED`      | 403  | Too many failed logins                               | `errors.accountLocked` |
| `ACCOUNT_INACTIVE`    | 403  | User account is disabled                             | `errors.accountInactive` |
| `NOT_FOUND`           | 404  | Resource not found / not visible to caller           | `errors.notFound`      |
| `CONFLICT`            | 409  | Unique constraint, duplicate, or state-transition violation | `errors.conflict` |
| `RATE_LIMITED`        | 429  | Rate limit exceeded                                  | `errors.rateLimited`   |
| `INVALID_INVITATION`  | 400  | Invitation code unknown / expired / used             | `errors.invalidInvitation` |
| `INTERNAL_ERROR`      | 500  | Unhandled server error                               | `errors.internal`      |
