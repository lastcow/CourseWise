# Deployment

Single-tenant MVP. Workers + Pages + Neon Postgres + R2. CI on every PR;
deploy on every push to `main`.

## Secrets

Never commit real secrets. The repo keeps placeholders in `.env.example` and
`apps/api/.dev.vars.example`. For local dev, copy them to `.env.local` (root,
used by Drizzle Kit) and `apps/api/.dev.vars` (used by `wrangler dev`).

## Provisioning checklist

Do these once per environment, in this order:

1. **Neon project**. Create a Neon project named `coursewise`. Copy the
   **pooled** connection string (`-pooler` host). Save it as `DATABASE_URL`.
2. **R2 bucket**. Create `coursewise-files`, leave private.
3. **Cloudflare Workers project**. `wrangler login`, then deploy once from
   `apps/api` so the Worker name is registered:
   ```sh
   cd apps/api && wrangler deploy --dry-run --outdir ./.wrangler/dry
   ```
4. **Wrangler secrets** (from `apps/api`):
   ```sh
   wrangler secret put DATABASE_URL
   wrangler secret put JWT_SECRET
   wrangler secret put JWT_REFRESH_SECRET
   ```
   Non-sensitive vars (`JWT_ISSUER`, `JWT_AUDIENCE`, `CORS_ORIGIN`) live in
   `wrangler.toml` under `[vars]`. **Do NOT** put `DATABASE_URL` or `JWT_*`
   there.
5. **Rate-limit KV namespace** (optional but recommended for production):
   ```sh
   wrangler kv namespace create RATE_LIMIT_KV
   ```
   Paste the returned id into the commented `[[kv_namespaces]]` block of
   `apps/api/wrangler.toml`. Without it, the rate limiter falls back to an
   in-memory `Map` per isolate, which is **dev only** — it does not span
   isolates and resets when the Worker scales down.
6. **Cloudflare Pages project**. Create a Pages project named `coursewise`.
   Build command: `pnpm install --frozen-lockfile && pnpm --filter @coursewise/web build`.
   Output directory: `apps/web/dist`. Env vars on the Pages project:
   - `VITE_API_BASE_URL=https://coursewise-api.<account>.workers.dev`
   - `VITE_DEFAULT_LOCALE=en`
7. **GitHub Secrets** for the CI deploy workflow:
   ```sh
   gh secret set CLOUDFLARE_API_TOKEN          --body "<token>"
   gh secret set CLOUDFLARE_ACCOUNT_ID         --body "<account-id>"
   gh secret set CLOUDFLARE_PAGES_PROJECT_NAME --body "coursewise"
   gh secret set VITE_API_BASE_URL             --body "https://coursewise-api.<account>.workers.dev"
   gh secret set DATABASE_URL                  --body "postgresql://<user>:<pw>@<neon-pooler-host>/<db>?sslmode=require"
   # optional
   gh secret set VITE_DEFAULT_LOCALE           --body "en"
   ```

   `DATABASE_URL` is the **pooled** Neon connection string for prod
   (`coursewise` project, branch `main`, db `neondb`). The CI `migrate` job
   uses it to apply pending Drizzle migrations before each deploy.

## Database migrations

```sh
pnpm db:generate   # produce a new SQL migration from drizzle schema changes
pnpm db:migrate    # apply pending migrations against DATABASE_URL
pnpm db:seed       # seed admin / teacher / students / MGMT101 / invitation
```

`db:migrate` and `db:seed` read `.env.local` via `node --env-file`. CI
**does** run `pnpm db:migrate` automatically on every push to `main` — see
the `migrate` job in `.github/workflows/deploy.yml`. It uses the
`DATABASE_URL` GitHub Actions secret and runs before `deploy_api` /
`deploy_web`, so a failing migration aborts the deploy. `db:seed` is still
an operator-only command — CI never runs it.

## CI / deploy workflow

`.github/workflows/deploy.yml` runs four jobs:

| Job          | When                            | Does                                                  |
| ------------ | ------------------------------- | ----------------------------------------------------- |
| `ci`         | every PR and push               | install → typecheck → lint → test → build             |
| `migrate`    | push to `main`, after `ci`      | `pnpm --filter @coursewise/api db:migrate` against the `DATABASE_URL` secret |
| `deploy_api` | push to `main`, after `migrate` | `wrangler deploy` from `apps/api`                     |
| `deploy_web` | push to `main`, after `migrate` | `pnpm --filter @coursewise/web build` then `pages deploy apps/web/dist` |

The two deploy jobs run in parallel after `migrate`; failure of either deploy
does not block the other, but a failed migration blocks both. The `migrate`
job is a no-op (drizzle reports no pending migrations) when nothing has
changed since the last apply.

## First deploy (manual)

If you prefer to run the first deploy by hand to confirm everything wired up
correctly:

```sh
# API
cd apps/api
wrangler deploy

# Web
cd ../web
pnpm build
wrangler pages deploy dist --project-name=coursewise --branch=main
```

## Post-deploy smoke test

After every production deploy, run this smoke runbook (5 minutes, no GUI):

```sh
API=https://coursewise-api.<account>.workers.dev

# 1. Health
curl -fsS "$API/api/health" | jq .
# expected: { "status": "ok", "timestamp": "..." }

# 2. Version (should reflect the new GIT_SHA)
curl -fsS "$API/api/version" | jq .

# 3. OpenAPI spec discoverable
curl -fsS "$API/api/openapi.json" | jq '.info, .paths | keys | length'

# 4. Admin login
ADMIN_JWT=$(curl -fsS "$API/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"ebiz@chen.me","password":"Paradise@0"}' | jq -r '.data.accessToken')
[ -n "$ADMIN_JWT" ] || { echo "login failed" >&2; exit 1; }

# 5. Mint a teacher API token
TOKEN=$(curl -fsS "$API/api/admin/api-tokens" \
  -H "Authorization: Bearer $ADMIN_JWT" -H 'Content-Type: application/json' \
  -d '{"name":"smoke","scopes":["courses:read","dashboards:read"]}' \
  | jq -r '.data.token')

# 6. Exercise it
curl -fsS "$API/api/courses" -H "Authorization: Bearer $TOKEN" | jq '.data | length'
curl -fsS "$API/api/dashboards/admin" -H "Authorization: Bearer $ADMIN_JWT" | jq '.data'

# 7. Clean up the smoke token (in the admin UI: API Tokens → revoke)
```

If any of the above returns non-2xx, **roll back**: `wrangler deployments
list && wrangler rollback <previous-id>` from `apps/api`, and re-publish the
prior Pages deployment from the Pages dashboard.

## Cloudflare resources at a glance

- Workers name: `coursewise-api`
- Pages project: `coursewise`
- R2 bucket: `coursewise-files`
- KV namespace: `RATE_LIMIT_KV` (optional in dev, required in prod)
- Observability: `[observability] enabled = true` in `wrangler.toml`

## Rate limiting

The rate-limit middleware keys by IP + route. In production it uses the
Workers KV namespace bound as `RATE_LIMIT_KV`. Local dev falls back to an
in-memory `Map` per isolate. **The in-memory fallback is dev-only** and is
not safe for production — bind KV before deploying.

## Rolling back

```sh
cd apps/api
wrangler deployments list
wrangler rollback <deployment-id>
```

Pages rollbacks are done from the Cloudflare dashboard (Pages → project →
Deployments → Rollback). Schema rollbacks are manual — write a forward-only
migration that undoes the change.
