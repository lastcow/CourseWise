# Deployment

Single-tenant MVP. Workers + Pages + Neon Postgres + R2.

## Secrets

Never commit real secrets. The repo keeps placeholders in `.env.example` and
`apps/api/.dev.vars.example`. For local dev, copy them to `.env.local` (root,
used by Drizzle Kit) and `apps/api/.dev.vars` (used by `wrangler dev`).

## Wrangler secrets (production)

Set Workers secrets via Wrangler. Run from `apps/api`:

```sh
wrangler secret put DATABASE_URL
wrangler secret put JWT_SECRET
wrangler secret put JWT_REFRESH_SECRET
```

Non-sensitive vars (`JWT_ISSUER`, `JWT_AUDIENCE`, `CORS_ORIGIN`) live in
`apps/api/wrangler.toml` under `[vars]`. Do NOT put `DATABASE_URL` or any
`JWT_*` secret in `wrangler.toml`.

`DATABASE_URL` should be the **pooled** Neon connection string (the host that
includes `-pooler`). The Neon project is named `coursewise` and lives in
`aws-us-east-1`. Provisioning is done out-of-band via the Neon API; the
project's pooled URL is rotated by re-issuing through the Neon console.

## Database migrations

```sh
pnpm db:generate   # produce a new SQL migration from drizzle schema changes
pnpm db:migrate    # apply pending migrations against DATABASE_URL
pnpm db:seed       # seed admin / teacher / students / MGMT101 / invitation
```

`db:migrate` and `db:seed` read `.env.local` via `node --env-file`. CI does
NOT run migrations automatically yet — they are operator commands during M1.

## Cloudflare

- Workers name: `coursewise-api`
- Pages project: `coursewise`
- R2 bucket: `coursewise-files`
- Account ID and API token are CI secrets (`CLOUDFLARE_ACCOUNT_ID`,
  `CLOUDFLARE_API_TOKEN`). Deploy job is wired up in M6.

## Rate limiting

A Workers KV namespace named `RATE_LIMIT_KV` will be bound in production for
request rate limiting (auth login + register). Local dev falls back to an
in-memory `Map` per isolate. **The in-memory fallback is dev-only** and is
not safe for production — bind KV before deploying.
