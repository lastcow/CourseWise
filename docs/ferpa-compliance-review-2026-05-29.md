# FERPA Compliance Review — CourseWise

**Date:** 2026-05-29
**Scope:** US federal FERPA (20 U.S.C. § 1232g; 34 CFR Part 99). Implementation
review of `apps/api`, `apps/web`, `packages/shared`, plus the platform's stated
legal posture (`apps/web/src/pages/legal/*`).
**Method:** Static code reading with file:line evidence across three workstreams
— (1) access control & disclosure, (2) records rights & audit, (3) AI/external
sharing, minors/COPPA, and security safeguards.

> **Posture context.** CourseWise positions itself as a **"school official"**
> under FERPA §99.31(a)(1)(i)(B) (see `PrivacyPage.tsx`, `DpaPage.tsx`,
> `FerpaPage.tsx`). Under that model the *institution* is the data controller
> and remains responsible for the §99.7 annual notice, §99.10 inspection
> timeline, and the §99.21 amendment/hearing process; CourseWise's duty is to
> support those obligations and to use "reasonable methods" to protect records.
> Several gaps below are legitimately the institution's responsibility — but the
> product either claims to implement them or builds half of the mechanism, so
> they are scored on whether the *code* lives up to the *claim*.

---

## Executive summary

CourseWise is **unusually FERPA-aware for an LMS**. It implements a genuine
§99.32 disclosure-accounting model (per-student audit rows, a dedicated index,
and a student-facing disclosure log), a complete §99.10 self-inspection export,
a §99.7 annual-acknowledgment gate, and a retention sweep that deliberately
preserves disclosure records while anonymizing network fingerprints. Critically,
the AI/Gamma generation paths are **architected to never transmit student PII** —
only teacher-authored course content is sent to external providers.

The material gaps are concentrated in five areas:

1. **Disclosure ledger is incomplete and not durable** — the most frequent
   student-to-student PII exposure (peer roster email) and all admin reads are
   not logged; disclosure writes are best-effort and are orphaned on student
   deletion.
2. **No "directory information" / opt-out model** — all roster PII (incl. peer
   email) is treated identically and disclosed unconditionally (§99.37).
3. **§99.21 amendment process is only half-built** — request + unilateral
   accept/decline exist, but there is no hearing and no statement-of-disagreement
   that travels with the record.
4. **No minors vs. eligible-student (18+) distinction** — nothing in the data
   model knows which FERPA rights-holder regime applies, despite the COPPA page
   claiming the service is directed in part to children under 13.
5. **Token & operational-security gaps** — over-broad non-expiring admin tokens,
   a dead per-course scoping control, PII in production logs, and silent
   rate-limiter degradation.

| Severity | Count | Areas |
| -------- | ----- | ----- |
| **High** | 5 | Peer email disclosure w/o opt-out; admin/peer reads not logged; disclosure record orphaned on delete; over-broad admin tokens; no minors/18+ distinction |
| **Medium** | 8 | No §99.21 hearing/statement; teacher AI free-text PII channel; no DB-backed inspection-SLA tracking; best-effort audit writes; PII in production logs; silent rate-limiter fallback; body-delivered non-revocable tokens; dead per-course token scoping |
| **Low** | 6 | Disclosure rows lack IP/UA; token-actor attribution in student log; acknowledgment not notice-version-aware; unsalted SHA-256 token hashing; no JWT-secret length check; draft legal pages with placeholders |

---

## 1. What is implemented well

- **§99.32 disclosure accounting is first-class.** `services/audit.ts:23,43-50`
  fans out one `audit_logs` row **per affected student** via `disclosedStudentIds`,
  indexed by `audit_logs_disclosed_student_idx` (`db/schema.ts:1084-1087`).
  Staff reads/exports of student records are logged at the actual read points:
  gradebook view (`grading.ts:233-240`), CSV export (`grading.ts:455-463`),
  attendance export (`attendance.ts:685-694`), submission view/bulk
  (`assignments.ts:957-960`, `752-768`), correction resolution
  (`recordCorrections.ts:267`).
- **§99.10 right to inspect** is real and instant. `services/recordsExport.ts:35-329`
  assembles the full subject-centered record (profile, enrollments, submissions
  with scores+feedback, quiz attempts + per-answer detail, attendance, discussion
  posts/grades, final grades **including teacher override score & reason**,
  alerts, and the student's own disclosure log), served at `GET /me/records/export`
  (`me.ts:248-277`).
- **§99.32(c) inspection of the disclosure record** — `GET /me/records/disclosures`
  (`me.ts:173-232`), surfaced in `SettingsDisclosuresPage.tsx`.
- **§99.7 annual notice acknowledgment** — `ferpaAcknowledgments` table keyed by
  `(userId, academicYear)` with IP/UA capture (`schema.ts:1341-1361`,
  `me.ts:284-339`); unskippable, year-rolling modal (`FerpaAcknowledgmentGuard.tsx`).
- **Uniform course-scoped authorization.** `requireCourseTeacher` /
  `requireCourseEnrollment` / `requireCourseAccess` (`middleware/auth.ts:94-165`),
  mirrored in `services/courseAccess.ts:6-51`, enforce the "legitimate
  educational interest" boundary everywhere. Teachers are confined to their own
  courses (`students.ts:62-82`, `dashboards.ts:108-113`); students are pinned to
  self on every aggregate endpoint (`dashboards.ts:207`, `grading.ts:103-105`,
  `253-262`, `alerts.ts:43-45`, `assignments.ts:938-943`).
- **AI/Gamma never receive student PII by construction.** Material generation
  interpolates only course/module metadata + teacher instructions
  (`workflows/materialGeneration.ts:287-307`, `services/ai/promptDefaults.ts:10-30`);
  Gamma receives only reading-material content (`services/gamma/buildInputText.ts:24-51`).
  No student table is loaded into any prompt.
- **Retention sweep preserves the disclosure record.** `services/retentionSweep.ts:25-29,71-73`
  anonymizes IP/UA after 90 days but **never deletes audit rows or
  `disclosed_student_id`** — correctly keeping the §99.32 record "as long as the
  record is maintained."
- **Solid security baseline.** bcrypt with configurable rounds (`password.ts:3`);
  per-email login lockout + rate limiting (`auth.ts:233,257-296`); hashed,
  single-use, 60-min password-reset tokens (`passwordReset.ts:9-25`); refresh-token
  family rotation with reuse revocation (`auth.ts:404-473`); fail-closed CORS
  (`index.ts:54-78`); authorization-checked, 5-minute, attachment-only presigned
  file URLs with audit (`files.ts:213-321`).

---

## 2. Findings & suggested improvements

### HIGH

#### H-1. Peer roster email disclosed unconditionally; no "directory information" / opt-out model — §99.37
`routes/courses.ts:611-632` returns every enrolled peer's `name` **and `email`**
to any enrolled student. FERPA treats email as directory information only if the
institution *designates* it and the student has *not opted out*. There is no
`directory_information` flag, consent record, or opt-out anywhere in the
codebase. The peer-roster read is **also not recorded as a disclosure** (no
`disclosedStudentIds`), so the most frequent student-to-student PII exposure is
invisible in the §99.32 ledger.
**Suggested improvement:** Add a per-student directory-info opt-out
(`student_profiles.directory_opt_out` or a designated-fields table); gate
peer-visible fields on it; default peer roster to name-only and require an
institution toggle to expose email; record peer roster reads as disclosures.

#### H-2. Admin and peer reads are not disclosure-logged — §99.32(a)
Every middleware short-circuits on `role === 'admin'` (`auth.ts:98,118,141`;
`courseAccess.ts:37,48`). Admin dashboard (`dashboards.ts:36-94`), admin-driven
student dashboard with arbitrary `?studentId=` (`dashboards.ts:200-207`), and
admin final-grade lookup (`grading.ts:262`) let an admin read any student's full
academic snapshot **with no `disclosedStudentIds` entry**. Combined with H-1,
the disclosure ledger systematically omits two of the highest-volume access
paths.
**Suggested improvement:** Add `disclosedStudentIds` to admin/individual student
read paths (dashboards, single-student grade/alert/attendance views) so the
§99.32 accounting is complete regardless of caller role.

#### H-3. Disclosure record is severed from the student on hard delete — §99.32(b)
`audit_logs.actor_user_id` and `disclosed_student_id` are both
`ON DELETE SET NULL` (`schema.ts:1058-1075`). The student hard-delete endpoint
(`students.ts:333-442`) destroys the education records *and* orphans the
disclosure history; `user_deletion_log` keeps only aggregate `childCounts`, not
the records or their disclosure trail. FERPA requires the disclosure record be
kept *with the education record* for as long as the record is maintained.
**Suggested improvement:** Replace hard delete with anonymization/tombstoning for
students who have any disclosure history or graded records; or snapshot the
disclosure ledger into the deletion log. Add an explicit guard so the destructive
path is reserved for the "wrong-email registration" recovery case the schema
comment describes (`schema.ts:1259-1262`).

#### H-4. Admin tokens can over-share all student records and never expire
`admin.post('/api-tokens')` (`routes/admin.ts:44-76`) accepts an arbitrary
client-supplied `scopes` array (`validators.ts:73-78` only checks each scope is
known) with **no per-course restriction and optional `expiresAt`**. An admin can
mint a non-expiring bearer token holding `grades:read`/`submissions:read`/`admin:read`
that reads every student's records platform-wide; creation logs only `{ scopes }`
(`admin.ts:71`), not which students it can reach.
**Suggested improvement:** Require an expiry on minted tokens (cap max lifetime);
support and encourage per-course scoping (see H-5); log token scope + reach at
creation; consider an institution-level cap on platform-wide read tokens.

#### H-5. No minors vs. eligible-student (18+) distinction — §99.5 / §99.3
There is **no birthdate, age, grade-level, guardian, or parental-consent field
anywhere** (`studentProfiles` holds only `userId`, `studentNumber`,
`enrollmentYear` — `schema.ts:175-184`; `users` has no DOB — `schema.ts:152-173`).
FERPA rights belong to the *parent* until the student turns 18 / enters
postsecondary, then transfer to the "eligible student." CourseWise cannot tell
which regime applies, so it cannot route inspection/amendment/consent
differently — and the COPPA page (`CoppaPage.tsx`) simultaneously claims the
service is "directed in part to children under 13" with no under-13 handling in
code.
**Suggested improvement:** Decide the target population explicitly. If K-12 is in
scope, add an age/rights-holder model (or an institution-set "rights holder is
parent" flag per roster), a delegated-consent record, and parent-account routing
for inspection/amendment; otherwise restrict the product (and the COPPA page) to
postsecondary/eligible students.

### MEDIUM

#### M-1. §99.21 amendment process is only half-built
`routes/recordCorrections.ts` implements student *request* + staff unilateral
*accept/decline* (status `open/accepted/declined/withdrawn`). FERPA §99.21
requires that on a decline the student be informed of the **right to a hearing**,
and after an adverse hearing may insert a **statement of disagreement** kept with
the record and disclosed whenever the record is disclosed. None of this exists; a
declined request is terminal (`recordCorrections.ts:155`), and an "accepted"
correction only sets status — it does **not** mutate the underlying grade/record.
The records export carries no disagreement statement.
**Suggested improvement:** Add a hearing status + statement-of-disagreement
entity that is included in `recordsExport.ts` and travels with disclosures; or, if
the hearing is intentionally the institution's job, make that explicit in-product
(the `FerpaPage.tsx:107-112` prose is not surfaced in the correction flow).

#### M-2. Teacher AI free-text is an unguarded PII egress channel
`materialGeneration.ts:299-301` injects `context.instructions` verbatim into the
Anthropic prompt; Gamma's `additionalInstructions` (`gamma/client.ts:26`) is
passed through unmodified. A teacher can paste identifiable student data ("rewrite
for Jane Doe, failing at 42%") straight to an external provider. No filtering,
warning, or audit flag exists. The no-training commitment lives only in prose
(`FerpaPage.tsx:56-58`); the request bodies (`gateway.ts:158-163`,
`gamma/client.ts:75-79`) assert no training opt-out flag.
**Suggested improvement:** Add an inline warning + (optional) PII heuristic scan
on instruction fields; flag AI jobs whose instructions are non-empty in the audit
trail; assert provider no-training flags/headers where the API supports them.

#### M-3. No DB-backed inspection/request SLA tracking — §99.10 (45 days)
In-system self-inspection is instant (better than 45 days), but third-party/parent
intake (`DataRequestsPage.tsx:137-151`) is a generic `/api/contact` email with a
`TODO` to build a ticketed endpoint; the page prose promises "30 days"
(`:220`) with **no DB-backed request, status, or deadline tracking** to enforce
it.
**Suggested improvement:** Add a tracked data-request entity with status +
due-date; surface to admins; this also underpins the parent-routing in H-5.

#### M-4. Audit/disclosure writes are best-effort, not transactional
`audit.ts:51-53` swallows errors so audit failure never blocks the operation — an
availability choice that produces silent gaps in a record FERPA expects to be
maintained.
**Suggested improvement:** For disclosure rows specifically, write in the same
transaction as the disclosing read where feasible, or queue failed audit writes
for retry (a pattern the codebase already uses for R2 cleanup).

#### M-5. PII in production-reachable logs
`auth.ts:114` logs the recipient **email address** on reset-email failure and is
**not** environment-gated (unlike the dev-gated invite-URL logs at
`teacherInvitations.ts:289,382`).
**Suggested improvement:** Redact/hash email in failure logs or gate behind a
non-production check; sweep for other un-gated PII log lines.

#### M-6. Rate limiter silently degrades without KV
`rateLimit.ts:80-83` falls back to a DEV-ONLY in-memory limiter
(`rateLimit.ts:19-41`) when `RATE_LIMIT_KV` is unbound — across isolates this
effectively disables login/reset brute-force protection in production with no
startup assertion.
**Suggested improvement:** Assert `RATE_LIMIT_KV` is bound in production at boot
(fail loud, mirroring the CORS pattern in `index.ts:54-69`).

#### M-7. Auth tokens delivered in response body; access JWT not revocable
Access (12h) and refresh (7d) tokens are returned in JSON (`auth.ts:212-213`,
`313-314`, `483-485`), landing in client-accessible storage (XSS exposure). Only
refresh tokens are tracked in DB; a leaked access token stays valid for up to 12h
regardless of logout/lock (`jwt.ts:4`).
**Suggested improvement:** Consider httpOnly cookies for the refresh token and a
shorter access-token TTL or a revocation/denylist check on sensitive routes.

#### M-8. Per-course token scoping is built but dead
`requireTokenCourseAccess` (`auth.ts:172-187`) restricts a token to `course:<id>`
scopes, but **no `course:*` scope is defined in `API_TOKEN_SCOPES`**
(`constants.ts:15-51`) and no route mints one — so per `auth.ts:178` every token
is unrestricted across all courses the role can reach. The data-minimization
control exists only in code, never in practice.
**Suggested improvement:** Define `course:<id>` scopes, let admins/teachers mint
course-scoped tokens, and default external-integration tokens to course scope.

### LOW

- **L-1.** Disclosure call sites pass no `ip`/`userAgent` (`grading.ts:239,462`,
  `assignments.ts:768,960`, `attendance.ts:694`, `recordCorrections.ts:267`), so
  disclosure rows lack actor-network forensics the schema anticipates.
- **L-2.** Token-mediated disclosures show only the token *name* with `role:null`
  in the student log (`me.ts:213-220`) — no human accountable party.
- **L-3.** Annual acknowledgment is keyed only on academic year (`me.ts:301-339`);
  a mid-year notice-text change won't force re-acknowledgment. Add notice
  versioning.
- **L-4.** API/reset tokens hashed with **unsalted SHA-256** (`crypto.ts:14-18`).
  Fine for high-entropy random tokens, but an HMAC with a server secret would
  resist offline checking of a leaked DB dump.
- **L-5.** No length/strength validation on `JWT_SECRET` / `JWT_REFRESH_SECRET`
  (`auth.ts:64-67`, `jwt.ts:28-30`); a weak secret silently yields forgeable
  tokens. Assert minimum length at boot.
- **L-6.** Legal pages are unexecuted drafts — `FerpaPage.tsx:11` /
  `CoppaPage.tsx:11` are `v0.1-draft` with `[COMPANY LEGAL NAME]` /
  `[INSTITUTION NAME]` placeholders; `DpaPage.tsx` is `v0.1-draft`,
  `SubprocessorsPage.tsx` `v0.2-draft`. Finalize before relying on the
  school-official representations they make.

---

## 3. Prioritized remediation roadmap

1. **Close the disclosure ledger** (H-1 partial, H-2, L-1, M-4): log peer-roster
   and admin/individual student reads with IP/UA; make disclosure writes durable.
2. **Make the disclosure record durable on deletion** (H-3): anonymize instead of
   hard-deleting students with records/disclosure history.
3. **Directory-information & opt-out model** (H-1): gate peer email; institution
   designation + student opt-out.
4. **Token hardening** (H-4, M-8, M-7): require/cap expiry, log reach, activate
   per-course scoping, reconsider token delivery & access-token revocation.
5. **Decide & implement the minors story** (H-5): age/rights-holder model + parent
   routing, or restrict to eligible students and correct the COPPA page.
6. **Complete the §99.21 amendment workflow** (M-1) and **SLA-tracked data
   requests** (M-3).
7. **Operational hygiene** (M-2, M-5, M-6, L-3/4/5): AI PII guardrails, redact log
   PII, assert KV/secret config at boot, notice versioning.
8. **Finalize legal drafts** (L-6) so the school-official representations are
   executable.

---

*This review is a technical assessment of the codebase, not legal advice. FERPA
determinations for a specific deployment depend on the institution's contracts,
the population served, and how the platform is configured.*
