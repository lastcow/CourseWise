# CourseWise

Single-tenant teaching platform: courses, modules, reading materials, presentations,
assignments, discussions, quizzes, attendance, grading policy, final-grade
calculation, risk alerts, and per-role dashboards.

- **Web** — React + Vite + TypeScript + Tailwind + shadcn/ui, deployed to Cloudflare Pages.
- **API** — Hono on Cloudflare Workers, Drizzle ORM, Neon Postgres, R2 for files.
- **Auth** — JWT (access + refresh) **and** long-lived API tokens with per-resource scopes. Every authenticated endpoint accepts both.
- **i18n** — `en` and `zh-CN`, complete.

---

## Layout

```
apps/
  web/        React + Vite + TypeScript + Tailwind + shadcn/ui
  api/        Hono on Cloudflare Workers + Drizzle + Neon
packages/
  shared/     Shared types, zod validators, constants
.github/workflows/deploy.yml   CI + Cloudflare deploy
docs/                          architecture / api / deployment
```

## Prerequisites

- Node.js ≥ 20 (see `.nvmrc`).
- pnpm ≥ 9 — `corepack enable && corepack prepare pnpm@9.12.0 --activate`.
- A Neon Postgres project (free tier is fine).
- A Cloudflare account with **Workers + Pages + R2** enabled.

## Quick start (fresh clone)

```bash
git clone https://github.com/lastcow/CourseWise.git
cd CourseWise

pnpm install
cp .env.example .env.local         # fill in DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET
cp apps/api/.dev.vars.example apps/api/.dev.vars   # wrangler dev reads these

pnpm db:migrate                    # apply all migrations to your Neon DB
pnpm db:seed                       # admin / teacher / student accounts + MGMT101

pnpm dev                           # web on :5173, api on :8787 in parallel
```

Open <http://localhost:5173> and log in with one of the seed accounts.

### Seed accounts

| Role    | Email                  | Password      |
| ------- | ---------------------- | ------------- |
| Admin   | `ebiz@chen.me`         | `Paradise@0`  |
| Teacher | `teacher@example.com`  | `Teacher123!` |
| Student | `student1@example.com` | `Student123!` |
| Student | `student2@example.com` | `Student123!` |
| Student | `student3@example.com` | `Student123!` |

The seed also creates course `MGMT101` and invitation code `MGMT101-2026` that
new students can register against.

---

## Scripts

| Command          | What it does                                      |
| ---------------- | ------------------------------------------------- |
| `pnpm dev`       | Run web + api in parallel                         |
| `pnpm build`     | Build all workspace packages and apps             |
| `pnpm typecheck` | Run `tsc --noEmit` across the workspace           |
| `pnpm lint`      | Run ESLint across the workspace                   |
| `pnpm test`      | Run Vitest in every workspace package             |
| `pnpm format`    | Format all files with Prettier                    |
| `pnpm db:generate` | Generate a Drizzle migration from schema changes |
| `pnpm db:migrate`  | Apply pending migrations against `DATABASE_URL`  |
| `pnpm db:seed`     | Seed admin / teacher / students / MGMT101        |

---

## Setting up Neon

1. Create a Neon project named `coursewise` (any region).
2. From the **Connection Details** panel, copy the **pooled** connection
   string (the host ending in `-pooler...`).
3. Put it in `.env.local` as `DATABASE_URL`.
4. Run `pnpm db:migrate && pnpm db:seed`.

## Setting up R2

1. In the Cloudflare dashboard, create an R2 bucket named `coursewise-files`.
   Leave it **private**.
2. The Worker binds to the bucket via `apps/api/wrangler.toml` — no extra
   access keys are needed in code. (For local `wrangler dev`, the worker uses
   bucket emulation; the bucket name still needs to match.)
3. Uploads go through the **presigned PUT** flow:
   `POST /api/files/upload-url` → client `PUT`s to R2 → `POST /api/files/complete-upload`.

## Setting up Wrangler (Workers)

```sh
cd apps/api
wrangler login

# Upload production secrets (do this once per Worker).
wrangler secret put DATABASE_URL
wrangler secret put JWT_SECRET
wrangler secret put JWT_REFRESH_SECRET
```

Non-sensitive vars (`JWT_ISSUER`, `JWT_AUDIENCE`, `CORS_ORIGIN`) live in
`apps/api/wrangler.toml`. Override `CORS_ORIGIN` for production by uncommenting
the `[env.production.vars]` block.

For rate limiting, optionally bind a KV namespace:

```sh
wrangler kv namespace create RATE_LIMIT_KV
# paste the returned id into wrangler.toml under [[kv_namespaces]]
```

In dev, the rate-limit middleware falls back to an in-memory `Map`.

## Setting up Cloudflare Pages

1. In Cloudflare → Pages → **Create project**, name it `coursewise`.
2. Build command: `pnpm install --frozen-lockfile && pnpm --filter @coursewise/web build`.
3. Build output: `apps/web/dist`.
4. Env vars: set `VITE_API_BASE_URL` to your deployed API URL (e.g.
   `https://coursewise-api.<account>.workers.dev`) and optionally
   `VITE_DEFAULT_LOCALE`.
5. The CI workflow can also deploy on each push to `main`; see below.

## GitHub Secrets for CI deploy

Configure these in **Settings → Secrets and variables → Actions** (or via the
`gh` CLI):

| Secret                          | Used for                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`          | `cloudflare/wrangler-action`                                                   |
| `CLOUDFLARE_ACCOUNT_ID`         | Cloudflare account                                                             |
| `CLOUDFLARE_PAGES_PROJECT_NAME` | Pages project (defaults to `coursewise`)                                       |
| `VITE_API_BASE_URL`             | Baked into the Web build                                                       |
| `VITE_DEFAULT_LOCALE`           | Optional, defaults to `en`                                                     |
| `DATABASE_URL`                  | Pooled Neon connection string — used by the CI `migrate` job before each deploy |

```sh
gh secret set CLOUDFLARE_API_TOKEN          --body "<token>"
gh secret set CLOUDFLARE_ACCOUNT_ID         --body "<account-id>"
gh secret set CLOUDFLARE_PAGES_PROJECT_NAME --body "coursewise"
gh secret set VITE_API_BASE_URL             --body "https://coursewise-api.<account>.workers.dev"
gh secret set DATABASE_URL                  --body "postgresql://<user>:<pw>@<neon-pooler-host>/<db>?sslmode=require"
```

On `push: main`, `.github/workflows/deploy.yml` runs `ci`, then `migrate`
(applies pending Drizzle migrations against `DATABASE_URL`), then in
parallel: `deploy_api` (Wrangler `deploy`) and `deploy_web` (Pages publish).
A failing migration aborts both deploys.

---

## External API integration

CourseWise ships first-class **API tokens** so external systems can call the
same surface that the web app uses.

1. Sign in as any user (admin, teacher, or student).
2. Open **Settings → API Tokens** from the global side menu (or the link next
   to your name in the header).
3. Click **Create token**, pick a name and an expiry, and copy the plaintext
   token that is shown **once**.
4. Use it as `Authorization: Bearer cmpt_…` on any documented endpoint.

The minted token automatically inherits your role's permissions — admins get
admin scopes, teachers get teacher scopes, students get student scopes. The
server rejects any client-supplied scope so a teacher cannot mint an
admin-level token by tampering with the request.

Admins can still manage everyone's tokens from **`/api/admin/api-tokens`**
(the existing admin-wide endpoints).

OpenAPI 3.1 spec: `GET https://<api-host>/api/openapi.json` (no auth required).
Endpoint-by-endpoint reference: [`docs/api.md`](docs/api.md).

### Authentication contract

Every CourseWise route requires `Authorization: Bearer <token>` (either a JWT
or an API token) **except** the public service surface:

- `GET /api/health`
- `GET /api/version`
- `GET /api/openapi.json`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/register-student`

A unit test (`apps/api/src/auth-coverage.test.ts`) walks the live Hono route
table on every CI run and asserts the invariant: every non-whitelisted route
returns `401 UNAUTHORIZED` without a Bearer token.

### Curl walkthrough — teacher creating a course and uploading a file

```sh
API=https://coursewise-api.example.workers.dev
TOKEN=cmpt_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx   # teacher token with courses:write, materials:write

# 1. Create a course
curl -sS "$API/api/courses" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"ECON202","title":"Microeconomics","status":"draft"}'

# 2. Request a presigned PUT URL for an R2 upload
curl -sS "$API/api/files/upload-url" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"filename":"syllabus.pdf","contentType":"application/pdf","size":214312,"relatedType":"material"}'

# 3. PUT the bytes (URL + headers from step 2)
curl -sS -X PUT "<uploadUrl>" --data-binary @syllabus.pdf -H "Content-Type: application/pdf"

# 4. Finalize the upload (marks file ready)
curl -sS "$API/api/files/complete-upload" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fileId":"<id-from-step-2>"}'
```

### Curl walkthrough — self-serve token (any role)

```sh
API=https://coursewise-api.example.workers.dev

# Get a JWT first
curl -sS "$API/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"teacher@example.com","password":"Teacher123!"}' | jq -r '.data.accessToken' > /tmp/jwt

JWT=$(cat /tmp/jwt)

# Mint a token bound to the caller's role (here: teacher scopes, expires in 90 days).
# Note: no `scopes` field — the server picks the set from the caller's role.
curl -sS "$API/api/me/api-tokens" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"name":"Grading export bot","expiresInDays":90}'

# List your own tokens
curl -sS "$API/api/me/api-tokens" -H "Authorization: Bearer $JWT"

# Revoke a token by ID
curl -sS -X POST "$API/api/me/api-tokens/<id>/revoke" -H "Authorization: Bearer $JWT"
```

The create response includes `data.token` — that is the plaintext value. It
is **only returned on create**; afterwards only the SHA-256 hash is stored.

### Curl walkthrough — admin minting a token for another user

Admins can also use the admin-wide `/api/admin/api-tokens` endpoint, which
accepts an explicit `scopes` array (so an admin can issue, for example, a
narrow read-only token for an external grading dashboard):

```sh
curl -sS "$API/api/admin/api-tokens" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"name":"Grading export bot","scopes":["grades:read","alerts:read","dashboards:read"]}'
```

### Response envelope

Every endpoint returns:

```json
{ "success": true,  "data":  ... }
```

or

```json
{
  "success": false,
  "error": {
    "code":   "MISSING_SCOPE",
    "message": "Token lacks required scope",
    "i18nKey": "errors.missingScope",
    "details": []
  }
}
```

`i18nKey` is what the web app feeds into `i18next`; an external integrator can
either show `message` directly or look up their own translation.

---

## More documentation

- [`docs/architecture.md`](docs/architecture.md) — modules, data flow, permission matrix.
- [`docs/api.md`](docs/api.md) — every endpoint, grouped by resource.
- [`docs/deployment.md`](docs/deployment.md) — full deploy playbook + post-deploy smoke test.
- `GET /api/openapi.json` — machine-readable OpenAPI 3.1.

---

# CourseWise（中文）

单租户教学平台：课程、章节、阅读资料、演示文稿、作业、讨论、测验、考勤、评分策略、
最终成绩计算、风险告警、以及按角色的仪表板。

## 技术栈

- **前端**：React + Vite + TypeScript + Tailwind + shadcn/ui，部署到 Cloudflare Pages。
- **后端**：基于 Cloudflare Workers 的 Hono，使用 Drizzle ORM、Neon Postgres，文件存储在 R2。
- **鉴权**：JWT（access + refresh）**以及**带作用域的长期 API Token；所有需要鉴权的接口两种方式都支持。
- **国际化**：`en` 与 `zh-CN` 同步完整翻译。

## 准备环境

- Node.js ≥ 20（见 `.nvmrc`）。
- pnpm ≥ 9：`corepack enable && corepack prepare pnpm@9.12.0 --activate`。
- 一个 Neon Postgres 项目（免费层即可）。
- 启用了 **Workers + Pages + R2** 的 Cloudflare 账户。

## 本地启动

```bash
git clone https://github.com/lastcow/CourseWise.git
cd CourseWise

pnpm install
cp .env.example .env.local          # 填入 DATABASE_URL、JWT_SECRET、JWT_REFRESH_SECRET
cp apps/api/.dev.vars.example apps/api/.dev.vars

pnpm db:migrate                     # 应用所有迁移
pnpm db:seed                        # 写入 admin / teacher / students 以及 MGMT101

pnpm dev                            # web → 5173，api → 8787
```

### 测试账号

| 角色     | 邮箱                   | 密码          |
| -------- | ---------------------- | ------------- |
| 管理员   | `ebiz@chen.me`         | `Paradise@0`  |
| 教师     | `teacher@example.com`  | `Teacher123!` |
| 学生     | `student1@example.com` | `Student123!` |
| 学生     | `student2@example.com` | `Student123!` |
| 学生     | `student3@example.com` | `Student123!` |

Seed 还会创建课程 `MGMT101` 和邀请码 `MGMT101-2026`，新学生可以用它注册。

## 部署

CI / 部署工作流位于 `.github/workflows/deploy.yml`。每次推送到 `main`：

1. `ci` 阶段执行 install → typecheck → lint → test → build。
2. `migrate` 通过 `DATABASE_URL` GitHub Secret 对 Neon 生产库执行 `pnpm db:migrate`；失败会中止后续部署。
3. `deploy_api` 通过 `cloudflare/wrangler-action` 部署 Workers。
4. `deploy_web` 构建并发布到 Cloudflare Pages 项目 `coursewise`。

需要在 GitHub Secrets 中配置：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、
`CLOUDFLARE_PAGES_PROJECT_NAME`、`VITE_API_BASE_URL`、`DATABASE_URL`
（以及可选的 `VITE_DEFAULT_LOCALE`）。详细步骤见 [`docs/deployment.md`](docs/deployment.md)。

## 外部 API

外部系统通过 **API Token** 调用本平台。任何用户都可以自助生成 Token：

1. 任意角色（管理员 / 教师 / 学生）登录。
2. 在左侧菜单的 **设置 → API 令牌** 中（或顶部用户名旁的入口）点击「创建令牌」。
3. 填写名称、选择有效期后提交，明文 Token 仅显示一次,请立即复制。
4. 用 `Authorization: Bearer cmpt_…` 调用任意已记录的接口。

生成的 Token 自动继承当前用户的角色权限，服务端会拒绝任何客户端尝试自带 `scopes` 字段
（防止教师铸造管理员 Token 等越权操作）。管理员仍然可以通过
`/api/admin/api-tokens` 端点为其他用户创建带显式 scopes 的 Token。

### 认证范围

除以下公开服务接口外，所有 API 路由都必须携带 `Authorization: Bearer <token>`
（JWT 或 API Token 二者皆可）：

- `GET /api/health`
- `GET /api/version`
- `GET /api/openapi.json`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/register-student`

`apps/api/src/auth-coverage.test.ts` 在 CI 中遍历 Hono 路由表,确保任何不在白名单
里的路由都会对未携带 Bearer Token 的请求返回 `401`。

OpenAPI 3.1 规范：`GET https://<api-host>/api/openapi.json`（无需鉴权）。
完整接口清单见 [`docs/api.md`](docs/api.md)。

### 示例：自助创建 Token（任意角色）

```sh
API=https://coursewise-api.example.workers.dev

JWT=$(curl -sS "$API/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"teacher@example.com","password":"Teacher123!"}' | jq -r '.data.accessToken')

# 创建令牌（无需指定 scopes，服务端按角色自动绑定）
curl -sS "$API/api/me/api-tokens" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"name":"评分导出脚本","expiresInDays":90}'

# 查看自己的令牌列表
curl -sS "$API/api/me/api-tokens" -H "Authorization: Bearer $JWT"

# 撤销令牌
curl -sS -X POST "$API/api/me/api-tokens/<id>/revoke" -H "Authorization: Bearer $JWT"
```

### 示例：管理员发放 Token（高级，可自定义 scopes）

```sh
JWT=$(curl -sS "$API/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"ebiz@chen.me","password":"Paradise@0"}' | jq -r '.data.accessToken')

curl -sS "$API/api/admin/api-tokens" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"name":"导出机器人","scopes":["grades:read","alerts:read","dashboards:read"]}'
```

## 响应格式

```json
{ "success": true,  "data": ... }
```

或：

```json
{
  "success": false,
  "error": {
    "code":   "MISSING_SCOPE",
    "message": "Token lacks required scope",
    "i18nKey": "errors.missingScope",
    "details": []
  }
}
```

`i18nKey` 是前端 `i18next` 用来本地化的键，外部集成方也可以自行查表。
