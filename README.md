# CourseWise

Monorepo for the CourseWise platform.

## Layout

```
apps/
  web/        React + Vite + TypeScript + Tailwind + shadcn/ui
  api/        Hono on Cloudflare Workers + Drizzle + Neon
packages/
  shared/     Shared types, zod validators, constants
```

## Prerequisites

- Node.js >= 20 (see `.nvmrc`)
- pnpm >= 9 (`corepack enable && corepack prepare pnpm@9.12.0 --activate`)

## Quick start

```bash
pnpm install
cp .env.example .env       # fill in local values
pnpm dev                   # runs web (5173) and api (8787) in parallel
```

## Scripts

| Command          | What it does                            |
| ---------------- | --------------------------------------- |
| `pnpm dev`       | Run web + api in parallel               |
| `pnpm build`     | Build all workspace packages and apps   |
| `pnpm typecheck` | Run `tsc --noEmit` across the workspace |
| `pnpm lint`      | Run ESLint across the workspace         |
| `pnpm test`      | Run Vitest in every workspace package   |
| `pnpm format`    | Format all files with Prettier          |

## Environment

See `.env.example` for the full list of required variables. Never commit real
secrets — `.env`, `.env.local`, and `.dev.vars` are ignored by git.

## Deployment

- `apps/web` deploys to Cloudflare Pages.
- `apps/api` deploys to Cloudflare Workers via `wrangler`.

The CI workflow under `.github/workflows/deploy.yml` runs install, typecheck,
lint, and build on every push. The deploy step is wired up in M6.
