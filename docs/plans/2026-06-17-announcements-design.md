# 课程公告(Announcements）— 设计方案

> 本文用中文撰写（应需求方要求）。仓库其余 plans 文档为英文；如需统一可后续翻译。

## 目标（Goal）

让老师在课程内发布**一对多的公告**，学生在课程内的公告 feed 中阅读，并支持：草稿→发布工作流、定时发布、置顶、附件、定向到指定分组的受众；学生可在公告下**评论与表情回应**；发布时通过**站内未读角标 + 邮件**通知学生，并**逐条追踪已读**。

## 背景（Why）

现有 messaging 是严格的 1:1 私信：`message_threads` 只有 `participant_a_id` / `participant_b_id`，并有唯一约束 `message_threads_course_pair_uniq`（`apps/api/src/db/schema.ts:1650` 起），没有任何 1→多广播概念，grep 全仓也无 announcement/broadcast。公告的语义是"一发多收 + 已读 + 评论/表情"，数据模型与 UI 都与私信不同，应**独立建表**，但通知层面**复用**现有 alerts 体系（`schema.ts:98` 的 `alertTypeEnum`、`services/alertRules.ts` 的 `upsertOpenAlert()`）与 Cloudflare 邮件（`services/email.ts:44` 的 `sendEmailViaCloudflare`）。

> ⚠️ **关键约束（决定通知架构）**：`alerts` 有唯一索引 `alerts_open_type_idx`（`schema.ts:1256`），作用域 `(userId, courseId, type) WHERE status='open'` —— 同一学生在同一课程下、同一 type **只能有一条 open alert**。因此**不能**给"每条公告"各插一条 `type='announcement'` 的 alert（第二条会被索引拒绝 / 被 upsert 合并）。
> **结论**：未读角标用专表 `announcement_reads` 精确计算（每条公告独立已读）；alerts 表只放**一条滚动提醒**（"本课程有新公告"，指向 feed），完美契合 `upsertOpenAlert` 的去重语义。二者职责分离。

## 决定的范围（Decided scope）

与需求方确认（2026-06-17）：

- **互动模型 —— 评论 + 表情回应。** 需要 `announcement_comments` 与 `announcement_reactions` 表，以及评论列表/输入与表情条 UI。
- **通知与已读 —— 站内 feed + 未读角标 + 邮件，并逐条追踪已读。** 角标走专表 `announcement_reads`；dashboard 提醒走一条滚动 alert；发布时发邮件。
- **发布/编排 —— 草稿→发布工作流、定时发布、置顶、附件、定向分组受众。**
- **受众 —— 默认全课；可定向到某 group set 下的指定分组。**

In：

- 新表（迁移 `0043`）：`announcements`、`announcement_targets`、`announcement_attachments`、`announcement_reads`、`announcement_comments`、`announcement_reactions`。
- `alertTypeEnum` 新增 `'announcement'` 成员（`ALTER TYPE`）。
- 路由 `apps/api/src/routes/announcements.ts`；fan-out 服务 `services/announcements/publish.ts`；定时发布 sweep `jobs/announcementPublishSweep.ts`（挂到现有 `*/15` cron）。
- 前端：老师列表页 + 新建/编辑表单页 + 学生 feed 页 + 角色感知详情（评论/表情/附件）；导航与路由接入；三语 i18n；`queries.ts` hooks。
- 共享类型 + zod validators。

Out：

- 评论的多级嵌套（V1 扁平一层，`parentId` 预留）。
- 邮件退订机制（V1 视为课程事务邮件；后续再做）。
- 编辑已发布公告时自动重发通知（默认不重发；可加显式"重新通知"按钮）。
- 跨课程的全站公告（仅课程级）。
- 富文本以外的内容类型（沿用 markdown）。

## 架构（Architecture）

发布是主干，其余（表、UI、通知）围绕它：

```
  发布（手动 / 定时 cron）
        │  publishAnnouncement(db, env, id)
        ▼
  ┌─────────────────────────────────────────────┐
  │ 1. 解析受众（全课 enrollments 或定向分组成员）  │
  │ 2. 标记 publishedAt，状态 → published          │
  │ 3. fan-out：                                    │
  │    • 邮件（Cloudflare，按 preferredLanguage）   │
  │    • 每个受众成员 upsert 一条滚动 alert         │
  │ 4. 写 audit（announcement.publish）             │
  └─────────────────────────────────────────────┘
        ▼
  学生 feed 读 published 且在受众内的公告
  未读 = 已发布公告 ∖ announcement_reads(student)
  打开详情 → 标记已读 → 角标递减；评论/表情独立表（轮询刷新）
```

### 数据模型 — `apps/api/src/db/schema.ts`（+ 迁移 `0043_announcements.sql`）

枚举：

```ts
export const announcementStatusEnum = pgEnum('announcement_status',
  ['draft', 'scheduled', 'published', 'archived']);
export const announcementAudienceEnum = pgEnum('announcement_audience',
  ['course', 'groups']); // groups = 定向到 announcement_targets 里的分组
```

六张表：

| 表 | 关键列 | 说明 |
|---|---|---|
| **`announcements`** | `id, courseId(fk cascade), authorId(fk users set null), title, body(md), status, pinned bool default false, audience, publishAt(定时), publishedAt, createdAt, updatedAt` | 主表 |
| **`announcement_targets`** | `id, announcementId(fk cascade), groupId(fk groups cascade)` | 仅 `audience='groups'` 有行；受众 = 这些分组成员并集 |
| **`announcement_attachments`** | `id, announcementId(fk cascade), fileAssetId(fk file_assets set null), position` | 多附件（复用 `file_assets`/R2）；单附件为更简备选 |
| **`announcement_reads`** | `id, announcementId(fk cascade), userId(fk cascade), readAt` · **unique(announcementId, userId)** | 驱动未读角标 + 老师"已读 X/N" |
| **`announcement_comments`** | `id, announcementId(fk cascade), authorId(fk users), body, createdAt, updatedAt, deletedAt` | 扁平评论；`parentId` 预留 |
| **`announcement_reactions`** | `id, announcementId(fk nullable), commentId(fk nullable), userId(fk cascade), emoji, createdAt` · **CHECK 恰好一个 target 非空** · **unique(announcementId, commentId, userId, emoji)** | 公告与评论都可表情；双可空 FK 保留级联删除 |

索引：`announcements (course_id, status, pinned, published_at DESC)`；`announcement_comments (announcement_id, created_at)`；`announcement_reads (user_id)`。迁移遵循现有规范（编号 SQL、`IF NOT EXISTS`、`DO $$ … $$` 加 FK，参考 `drizzle/0024_messaging.sql`）。`alertTypeEnum`（`schema.ts:98`）新增 `'announcement'`。

**状态机**：`draft → scheduled → published → archived`（`published`/`archived` 可互转）。
**可见性**：学生只见 `published` 且在受众内；老师/co-teacher 见本课全部状态。

### 共享类型与校验 — `packages/shared`

`src/types.ts` 新增：`AnnouncementStatus`、`AnnouncementAudience`、`AnnouncementSummary`（列表用：`pinned`、`commentCount`、`reactionSummary`、老师侧 `readCount`/`audienceCount`、学生侧 `isRead`）、`AnnouncementDetail`（`body`、`attachments[]`、`targets[]`、`comments[]`、`reactions[]`）、`AnnouncementComment`、`ReactionSummary`、`Create/UpdateAnnouncementInput`。
`src/validators` 新增 zod（对齐 quiz-sets 的 validators 做法）：标题 1–200、正文 1–20000（markdown）、`audience` + `targetGroupIds[]`、`publishAt`、`attachmentFileIds[]`、emoji 白名单。

### API — `apps/api/src/routes/announcements.ts`

栈：`requireAuth → requireScopeGroup → requireCourseTeacher`（写）/ `canAccessCourse`（读，老师或选课学生）。

```
# 老师（requireCourseTeacher）
POST   /api/courses/:cid/announcements         创建（draft / 立即发布 / 定时）
PATCH  /api/announcements/:id                    编辑
POST   /api/announcements/:id/publish            立即发布（触发 fan-out）
POST   /api/announcements/:id/schedule           设/改 publishAt → scheduled
POST   /api/announcements/:id/archive            归档
POST   /api/announcements/:id/pin                置顶/取消（body: {pinned}）
DELETE /api/announcements/:id                     删除
GET    /api/announcements/:id/reads               已读名单 + X/N（老师）

# 课程成员（老师或选课学生）
GET    /api/courses/:cid/announcements            列表（角色感知：学生只见 published&受众内，pinned 优先）
GET    /api/announcements/:id                      详情（含评论/表情/附件；学生侧顺带标记已读）
POST   /api/announcements/:id/read                 显式标记已读
POST   /api/announcements/:id/comments             发评论
DELETE /api/announcements/comments/:cid            删评论（作者或老师，软删）
PUT    /api/announcements/:id/reactions            切换公告表情（body: {emoji}）
PUT    /api/announcements/comments/:cid/reactions  切换评论表情

# 角标
GET    /api/me/announcements/unread-count          跨课未读总数（顶栏铃铛）
```

每次 create/publish/delete、删评论写 `recordAudit`（`announcement.*`）。在 `index.ts` 挂载、`lib/openapi.ts` 注册。

**Fan-out 服务** `services/announcements/publish.ts`：`publishAnnouncement(db, env, id)` —— 解析受众（全课 `enrollments` 或 `announcement_targets` 分组成员并集）→ 设 `publishedAt`/状态 → 每个成员 `upsertOpenAlert({type:'announcement', courseId, title, linkUrl: feed})` → `sendEmailViaCloudflare`（按 `preferredLanguage` 本地化、分批）→ 审计。

**定时发布 cron**：复用 `wrangler.toml [triggers]` 的 `*/15` sweep，新增 `jobs/announcementPublishSweep.ts`：查 `status='scheduled' AND publish_at <= now()` → 逐条 `publishAnnouncement`（幂等：已 published 跳过）。

### 前端 — `apps/web`

- **导航**（`components/SideNav.tsx`）：engagement 段（老师 `:202`、学生 `:308`）加 `{ to: \`${prefix}/announcements\`, labelKey: 'nav.announcements', icon: Megaphone, badge: extra.announcementsUnread ?? null }`；`CourseNavExtras` + `navExtras` memo 计算未读角标。可仿 `components/messaging/MessageBell.tsx` 加顶栏公告铃铛，拉 `/api/me/announcements/unread-count`。
- **路由**（`App.tsx`）：老师 `/teacher/courses/:courseId/announcements` 列表 + `/announcements/:id` 详情；学生同构两条。
- **页面**：
  - `pages/teacher/TeacherAnnouncementsPage.tsx` —— 列表（置顶优先、状态筛选、"已读 X/N"）、`+ 新建`。
  - 新建/编辑用**表单页**（正文长 + 受众/定时/附件）：markdown 正文、受众选择（全课 / 选 group set 下分组）、定时选择器、附件上传（复用 R2 上传 + `DownloadPresentationButton` 那套）、保存草稿/发布/定时。
  - `pages/student/StudentAnnouncementsPage.tsx` —— 已发布 feed（置顶优先、未读高亮），打开标记已读。
  - **共享详情** `AnnouncementDetail`（角色感知）：正文 + 附件下载 + 评论列表/输入 + 表情条（公告与每条评论）。打开阻塞态复用 `components/ui/loading-dialog.tsx`。
- **hooks**（`lib/queries.ts`，对齐 materials 模式）：`useAnnouncements(courseId)`、`useAnnouncement(id)`、`useCreate/Update/DeleteAnnouncement`、`useTransitionAnnouncement(publish/schedule/archive)`、`useToggleAnnouncementPin`、`useMarkAnnouncementRead`、`useAddComment/useDeleteComment`、`useToggleReaction`、`useAnnouncementUnreadCount`。query key：`['announcements', courseId]` / `['announcement', id]`。
- **i18n**（`locales/{en,zh-CN,fr}.ts`）：新增 `announcements.*`（标题、状态、受众、定时、置顶、评论、表情、空态、列名）与 `nav.announcements`。

## 里程碑（建议交付顺序）

每个里程碑都是可独立交付的 PR 序列。

1. **M1 基础**：`announcements` + `announcement_reads`；老师 CRUD（draft/publish/archive）；学生 feed；已读 + 未读角标。打通"发-收-已读"。
2. **M2 编排**：置顶 + 多附件（`announcement_attachments`）+ 定向分组受众（`announcement_targets`）。
3. **M3 互动**：`announcement_comments` + `announcement_reactions`（公告与评论表情）。
4. **M4 通知**：邮件 fan-out + 滚动 alert（新增 `alertTypeEnum 'announcement'`）+ 定时发布 cron sweep。

## 测试（Testing）

- `announcements.permissions.test.ts`（无 DB）：未登录 401；非老师写 403；非课程成员读 403；定向公告对非目标学生不可见。
- `announcements.integration.test.ts`（`skipIf(!DATABASE_URL)`）：草稿对学生不可见、发布后可见；`announcement_reads` 唯一约束 + 未读计数正确；定向受众只命中目标分组成员；评论增删 + reactions 唯一/切换；cron sweep 到点把 scheduled 翻 published 且只发一次。
- `publishAnnouncement` 单测：受众解析（全课 vs 定向）、alert upsert 去重、邮件调用计数。
- 手动冒烟：建草稿 → 发布 → 学生收到邮件+角标+feed → 评论+点赞 → 老师看到"已读 X/N" → 定时一条 → 到点自动发布。

## 风险与权衡（Risks and trade-offs）

| 风险 | 对策 |
|---|---|
| alerts 唯一索引导致"每公告一 alert"不可行 | 未读用 `announcement_reads` 专表；alerts 只放一条滚动提醒（契合 `upsertOpenAlert` 去重） |
| 大班邮件量级 / 退订 | 分批发送；V1 作为课程事务邮件不做退订，文档标注后续 |
| 定时发布漏发/重发 | cron 幂等（已 published 跳过）+ 单条事务标记 |
| reactions 多态 FK | 双可空 FK + CHECK 恰好一个，保留级联删除 |
| 编辑已发布公告是否重发通知 | 默认不重发；仅 publish/scheduled 到点触发（可加"重新通知"按钮） |
| 附件范围蔓延 | 多附件用 link 表；若想压缩工作量，M2 可先做单附件（仿 messages 的 `fileAssetId`） |
