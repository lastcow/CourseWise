# Gamma Presentations — Design

## Goal

Let teachers generate a presentation by selecting reading materials, optionally adding instructions, picking a PPT theme and image style, and having Gamma render the deck. The resulting presentation surfaces in the existing presentations list with an "Open in Gamma" link and a one-click `.pptx` download.

## Why

CourseWise's home-grown presentations entity is a container of DB-stored slides — useful for the in-app slide editor, but it can't compete with the visual quality of a Gamma deck. Gamma's public Generate API (v1.0 GA Nov 2025) lets us hand off the slide rendering entirely and just record where the deck lives.

## What Gamma's API gives us

- `POST /v1.0/generations` — body includes `inputText` (≤ 400 000 chars), `format: 'presentation'`, `additionalInstructions`, `themeId`, `textOptions.amount` (`brief`/`medium`/`detailed`/`extensive`), `imageOptions.{source,style}`, `exportAs: 'pptx'`. Returns `{ generationId }`. Auth via `X-API-KEY: skgamma-…`. Credits-billed.
- `GET /v1.0/generations/{id}` — poll every ~5 s. On `completed`: `gammaUrl` (share/edit link), `exportUrl` (signed `.pptx`, valid ~1 week), `credits.remaining`.
- `GET /v1.0/themes` — list of `themeId`s and human names; stable, safe to cache for an hour.
- Typical generation: 1–3 minutes. Rate-limit headers on every response.

## Architecture

**Worker side**

- Single new secret: `GAMMA_API_KEY` (admin runs `wrangler secret put`).
- One new table `gamma_generation_jobs` for the async lifecycle (a job knows its target presentation, the materials snapshot, the request params, and the Gamma generation id).
- Three new columns on `presentations`: `external_url`, `provider`, `file_asset_id`. They stay `null` for all hand-authored presentations.
- New service module `apps/api/src/services/gamma/` with a typed REST client (no SDK — direct `fetch`), a `buildInputText` helper that concatenates manual-text content + a stub for non-manual materials, and a `pollAndFinalize` function that handles "if job is `pending`, hit Gamma once (throttled to ≥ 4 s between calls per job); on `completed`, stream the `.pptx` into R2 via the `COURSE_FILES` binding and update the presentation row".
- Three new routes:
  - `GET  /api/gamma/themes` — caches Gamma's `GET /themes` in `RATE_LIMIT_KV` for 1 h.
  - `POST /api/courses/{courseId}/presentations/gamma` — scope `presentationsWrite`. Body: `{ title, moduleId?, materialIds: uuid[], additionalInstructions?, themeId?, imageSource?, imageStyle?, amount?, exportAs }`. Creates the placeholder presentation + job, kicks off the Gamma generation, returns both ids.
  - `GET  /api/gamma-jobs/{jobId}` — scope `presentationsRead`. Calls `pollAndFinalize`, returns the job row.

No Cloudflare Workflows: the polling lifecycle lives entirely on Gamma's side, the Worker just relays status when asked. Browser polls our endpoint every 5 s; we throttle to Gamma so a polling client can't blow our quota.

**Web side**

- New "Generate with Gamma" button on `TeacherPresentationsPage` opens a dialog with: title, optional module, multi-select reading-material picker (grouped by module, pre-checks every `manual_text` material), additional-instructions textarea, theme dropdown (live from `/api/gamma/themes`), image-source dropdown, free-text image-style, detail-length dropdown (`amount`).
- The newly-created presentation appears in the list with a `Generating in Gamma…` badge; the page polls the job endpoint every 5 s until the badge flips to the normal `draft` chip.
- A finished Gamma-backed presentation shows two extra buttons in the list row: **Open in Gamma** (`external_url`) and **Download .pptx** (presigned URL from the existing `/api/files/{fileId}/download-url`).
- The slide-list page renders a placeholder "This deck lives in Gamma — open it there to edit, or download the .pptx" when `presentations.provider === 'gamma'`, instead of the slide editor.

## Inputs we send to Gamma

`buildInputText(materials)`:

```
{material.title}\n\n{material.content}            // manual_text
[Slide source: {material.title} — {description}]  // upload / external_link
```

Materials are joined with `\n\n---\n\n`. We hard-truncate to 380 000 chars to leave headroom inside Gamma's 400 000 cap.

## Failure modes

- **Gamma 401/402/4xx on `POST /generations`** → job lands in `failed` status with `error_message`, no placeholder presentation created (transactional rollback).
- **Gamma 5xx on poll** → keep job `pending`, surface the last response so the next poll retries.
- **R2 binding missing or upload fails when fetching the `.pptx`** → job marks `completed` (Gamma succeeded), but `file_asset_id` stays null. UI shows "Open in Gamma" only.
- **`exportUrl` expired (> 1 week)** → user can re-trigger a generation; the old presentation row gets a new job.

## Out of scope

- Editing the Gamma deck from inside CourseWise (Gamma owns the editor).
- Per-teacher Gamma keys / billing isolation.
- PDF text extraction for uploaded materials.
- Watching Gamma's webhooks (Gamma doesn't offer one yet — poll-only).
