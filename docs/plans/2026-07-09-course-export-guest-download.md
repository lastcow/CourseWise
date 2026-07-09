# 课程导出 — 免登录（guest）下载方案

> 状态：定稿（2026-07-09），已实现。让教师把已完成的课程导出 ZIP 通过一个**能力共享链接**分享给没有 CourseWise 账号的人（合授教师、评估人、管理员等），并用**口令**加一道保护。

## 一、背景与出发点

现有导出下载是**刻意登录门控**的：导出完成后邮件里发的是应用内设置页链接（`/teacher/courses/:id/settings?export=:jobId`），真正下载要调 `GET /courses/:courseId/exports/:jobId/download-url`——该端点校验登录 + `coursesRead` scope + `canWriteCourse`（必须是该课程教师），通过后现签一个 **5 分钟**有效的 R2 预签名 URL。代码注释原话："so the email link alone is not a credential"。

需求是：**让没有账号的人也能下载**。这要求把"课程教师身份"这个凭证换成"持有秘密链接"。

## 二、FERPA 前提（不可回避）

导出 ZIP 含**学生教育记录**：每个在册学生的最终成绩、考勤、可读提交物、姓名/邮箱。因此本方案**不做匿名公开下载**，只做"教师主动发起、限时、限次、可撤销、可审计、可加口令"的定向共享——教师作为 school official 行使 §99.32 披露，系统负责把披露锁小、记全。

## 三、总体设计：能力链接（A 档）+ 口令

不需要 CourseWise 账号，但链接本身是一个 **高熵 + 限时 + 限次 + 可撤销 + 可加口令** 的秘密凭证。

关键安全参数：

| 参数 | 值 | 说明 |
|---|---|---|
| token | `randomBase62(48)` | 只存 `sha256Hex` 哈希（复用 password-reset 模式），明文只在创建时返回一次 |
| 口令 | 可选，bcrypt (`hashPassword`) | 人选低熵口令用慢哈希；token 已高熵，口令是第二因子 |
| 分享 TTL | 默认 24h，上限 = 导出自身 TTL（`COURSE_EXPORT_TTL_HOURS = 72`） | 分享绝不比导出文件活得久 |
| 下载次数上限 | 默认 10，可配 | 到达即失效 |
| 口令错误锁定 | 连续 10 次失败 → 锁定该分享 | 防口令暴力（token 泄露后的兜底） |
| 预签名有效期 | 5 分钟（沿用现值） | token/口令校验在前，长效 URL 不直接当凭证 |

## 四、数据模型

新表 `course_export_shares`（迁移 0054）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid pk | |
| `export_job_id` | uuid FK → course_export_jobs cascade | 导出被删/过期，分享随之失效 |
| `course_id` | uuid FK → courses cascade | 便于守卫与审计 |
| `created_by_id` | uuid FK → users set null | 披露发起人（FERPA actor） |
| `token_hash` | text unique | sha256 of the 48-char token |
| `passphrase_hash` | text nullable | bcrypt；null = 无口令 |
| `expires_at` | timestamptz | ≤ 导出 expiresAt |
| `max_downloads` | integer | 次数上限 |
| `download_count` | integer default 0 | |
| `failed_attempts` | integer default 0 | 口令连错计数 |
| `locked_at` | timestamptz nullable | 锁定时刻 |
| `revoked_at` | timestamptz nullable | 教师撤销 |
| `last_downloaded_at` | timestamptz nullable | |
| `created_at`/`updated_at` | timestamptz | |

索引：`token_hash` 唯一；`export_job_id` 普通索引。

## 五、端点

**教师侧**（`routes/courseExports.ts`，沿用 `requireAuth` + `coursesWrite/coursesRead` + `canWriteCourse` 守卫）：

- `POST /courses/:courseId/exports/:jobId/shares` — body `{ passphrase?, expiresInHours?, maxDownloads? }`；校验导出属于本课且 done 未过期；生成 token；返回**一次性明文链接** + 元数据；审计 `course.export.share.create`。
- `GET /courses/:courseId/exports/:jobId/shares` — 列出该导出的活跃分享（不含 token 明文/哈希）。
- `DELETE /courses/:courseId/exports/:jobId/shares/:shareId` — 撤销；审计 `course.export.share.revoke`。

**Guest 侧**（`routes/publicExports.ts`，**无全局 requireAuth**，两条路径加入 `PUBLIC_ROUTE_WHITELIST`）：

- `GET /api/public/exports/:token` — 按 token 哈希查分享；校验未撤销/未过期/未超次/未锁定，且底层导出仍 done 未过期。返回**不含 PII 的元数据**：`{ courseCode, fileName, sizeBytes, expiresAt, requiresPassphrase, downloadsRemaining }`。失效返回 404/410/409（不区分"不存在"与"口令错"以外的细节，避免枚举）。
- `POST /api/public/exports/:token/download` — body `{ passphrase? }`；重新校验全部条件 + 口令（bcrypt compare）；口令错 → `failed_attempts++`，达阈值置 `locked_at`；通过则 `download_count++`、`last_downloaded_at`、现签 5 分钟 R2 URL，返回 `{ downloadUrl }`；审计 `course.export.share.download`（`actorType:'system'`，metadata 含 shareId、courseId、IP、剩余次数）。

## 六、安全护栏

- 分享 TTL ≤ 导出 TTL；导出 sweep 作业删文件后分享自然死亡（cascade + 公共端点二次校验底层 job）。
- 口令用 bcrypt；连错锁定防暴力；token 高熵（48×log2(62)≈286 bit）不可猜。
- 公共端点只回课程代码 + 文件名 + 大小，**绝不回学生数据**；下载走 5 分钟预签名，不暴露长效 URL。
- 每次 guest 下载写审计，构成 §99.32 披露记录；教师页可见"被下载 N 次"。
- 生成分享时 UI 明确警告"此链接可免登录下载，含学生成绩/考勤，仅发给授权对象"，并提供撤销。
- **可选后续（P2，未实现）**：公共端点挂 Turnstile / 边缘速率限制，进一步防刷；按学生粒度写披露行。

## 七、前端

- **教师**：课程设置 → 导出区，每个可下载导出加"分享"按钮 → 弹窗（可选口令、TTL、次数）→ 生成后展示一次性链接可复制；下方列出活跃分享含"复制/撤销"。
- **Guest**：公共路由 `/share/export/:token` → `PublicExportDownloadPage`：显示课程/文件信息，若需口令则显示输入框，点击下载 → 跳转预签名 URL。用 `apiCall(path, { auth: false })`。

## 八、分阶段

1. **P1（本次）**：表 + 迁移、教师三端点、guest 两端点 + 白名单、口令 + 锁定、审计、教师分享 UI + guest 页 + 三语言。
2. **P2（可选）**：Turnstile / 速率限制、按学生披露行、分享用量分析。

## 九、明确不做

- 匿名公开下载（无 token）——FERPA 红线。
- 把预签名 URL 本身当分享链接（不可撤销、会泄漏在历史/referrer）。
- 分享链接活得比导出文件久。
