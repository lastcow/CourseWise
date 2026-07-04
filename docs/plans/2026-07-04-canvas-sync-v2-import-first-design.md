> 本文档由 2026-07-04 的方案迭代产出（v2），取代 [2026-06-17-canvas-lms-sync-design.md](2026-06-17-canvas-lms-sync-design.md) 中手工粘贴 token 的认证描述与双向同步范围。双向同步的后续设计见 [2026-07-04-canvas-sync-v3-bidirectional-design.md](2026-07-04-canvas-sync-v3-bidirectional-design.md)。

# CourseWise 与 Canvas LMS 同步集成方案 v2（Canvas 存量课程导入 → CourseWise 为主平台）

> 状态：定稿（2026-07），取代 v1（`prev-plan-zh.md`）与 `docs/plans/2026-06-17-canvas-lms-sync-design.md`。v1 的骨架（`lms_*` 表、Cloudflare Workflow 任务模式、outbox、指纹 diff、熔断器、FERPA 审计、分阶段上线）全部保留；认证方式、同步方向与学生开通模型按产品负责人新约束**整体反转**。

## 一、背景与目标（含与 v1 的差异说明）

CourseWise 是单租户教学平台（一校一部署，公开站 fsuac.com / API api.fsuac.com）。目标院校的现实是：**Canvas 课程由 SIS 预建、学期初已存在；没有任何管理员愿意/能够创建 developer key、安装 LTI 或开通 Data Services**。教师唯一可得的凭证是自己手工生成的 personal access token。同时院校保留 Canvas 作为官方成绩簿的可能性。

v2 的产品形态因此收敛为"**一次性入驻坡道，而非持续镜像**"：

1. 学期初，教师把自己**已存在的 Canvas 课程**导入 CourseWise：课程壳元数据（标题、code、学期、起止日期、syllabus）+ 便宜可靠的既有结构（assignments / assignment groups / modules，一律以草稿导入）。
2. 导入之后，**CourseWise 即为 system of record**：教师在 CourseWise 出题、发布材料，学生在 CourseWise 提交，评分在 CourseWise 完成。不做持续镜像，不向 Canvas 推送任何课程结构。
3. **不从 Canvas 创建任何学生账号**。学生走既有自注册 + 邀请码流程进入 CourseWise 课程；集成提供**身份关联（identity linking）**机制，把每个 CourseWise 学生与已链接 Canvas 课程名册上的同一人对应起来（用于选课核验与后续可选的成绩回写）。
4. 导入后与 Canvas 的持续接触点刻意压到最少：(a) 增补退选期内的**名册引用刷新**（手动 + 可选夜间）；(b) **可选后期阶段**：向 Canvas 成绩簿回写已关联学生的成绩。

**与 v1 的差异对照**：

| 维度 | v1 | v2 |
|---|---|---|
| 认证 | OAuth2 developer key（管理员一次性创建）+ refresh token | 教师手工 personal access token（无管理员依赖）；v1 的 `oauth.ts`、refresh 管线、redirect callback **整体删除** |
| 名册 | 导入并**创建学生账号**（users + student_profiles + enrollments） | **绝不创建账号**。Canvas 名册仅为只读引用清单，学生自注册后经核对 UI 关联 |
| 结构 | 持续 C→CW 同步 + 指纹冲突管线（"Canvas 在其字段上获胜"） | **一次性导入为草稿**，此后字段全部归 CourseWise 所有；指纹仅用于名册 diff 与重复导入去重 |
| 退课 | 教师确认后置 `enrollments.status='dropped'` | 名册**永不驱动**报名变更，只打徽章 —— v1 的破坏性名册确认流**不再需要** |
| 成绩回写 | 核心 P3 | 可选、明确隔离的最后阶段 |

## 二、前提假设与约束

1. **单租户、机构内部工具**：一所院校、一套部署、教师用自己的 token 访问自己的课程。这是 token 政策论证（见 §三）成立的前提，多租户 SaaS 化即失效。
2. **院校允许教师自建 token**：Canvas 根账户存在 "Limit personal access token creation to Admins"（2024-09）与"禁止所有非管理员生成 token"（2025-09 部署）开关。P0 首个动作即在目标院校实测验证；若被禁用，本方案无路可走，需回退到"申请管理员开 developer key"（即 v1）。
3. **Token 无作用域**：手工 token 继承教师全部权限，`token[scopes][]` 在默认 key 下被忽略。按"教师密码"对待（见 §三、§九）。
4. **教师 token 的可见性缺口**：名册上的 `email` 受 `read_email_addresses`、`sis_user_id` 受 `read_sis`、`login_id` 受 `view_user_logins` 门控——三者对 TeacherEnrollment 默认开启但院校可关；且 `sis_user_id` 仅 SIS 导入用户才有。匹配阶梯（§六）必须在三者全缺时仍可工作（退化为姓名建议 + 人工/学生申领）。
5. **限流与协议卫生**：每 token 漏桶（hwm 600–700、漏出 10/s、在途预扣 50）——CanvasClient 严格串行即可事实免疫；限流响应 403 与 429 都处理；**`User-Agent` 自 2026-06-20 起强制**（缺失 → 403），固定发送 `CourseWise/<version> (+https://fsuac.com)`；分页只跟 `Link` header 的 `next`，`per_page=100`，`Authorization: Bearer` header 而非 query param。
6. **无 Live Events / CD2 / Webhook / LTI**：全部需要管理员，全部出局。轮询即全部。
7. **Canvas 课程为 SIS 预建**：教师 token 常被 `prevent_course_renaming_by_teachers` 等设置锁死课程名/日期——无所谓，v2 **不向 Canvas 写任何结构**，读取不受影响。
8. **导入后 CourseWise 为真源**：任何"Canvas 侧后来改了作业/模块怎么办"的问题，答案一律是"不关心"——除名册引用与可选成绩回写外，导入完成即断开结构层面的耦合。
9. 文档基线为 developerdocs.instructure.com（2026-07 核验）；订阅 "2026 API Change Log"。

## 三、教师 Token 认证（政策、生命周期、安全处置）

### 3.1 政策立场（诚实版）

Canvas OAuth2 文档原文：*"asking any other user to manually generate a token and enter it into your application is a violation of Canvas' API Policy. Applications in use by multiple users MUST use OAuth."* 我们不假装这句话不存在，处置如下：

- **定位声明**：CourseWise 是院校自有的机构内部单租户工具，教师在本校 Canvas 实例上使用本人 token 操作本人课程——这落在"个人/内部使用"惯例内，且 Instructure 2025 年的一系列变更（强制 purpose、管理员可见/可删任意用户 token、按账户禁止非管理员建 token）事实上把执法权**下放给了院校管理员**，无任何技术性封锁。
- **要求一纸机构背书**：上线前由院校（教务/IT 负责人）书面确认知悉并许可该 token 用法，存档于部署文档。这是合规姿态的核心，不是可选项。
- **红线**：本方案永不 SaaS 化多租户收集 token——那是政策条款的典型违例场景。设置页与文档中明示此边界。
- Token 创建时 **purpose 字段（2025-10 起强制）填写 "CourseWise integration"**，让管理员在审计视图中一眼可辨。

### 3.2 生命周期与失效 UX

手工 token **没有 refresh token**——v1 的自动续期管线整体不适用。生命周期事实：教师 token 的过期时间**可选**（留空=永不过期）；过期/吊销后 API 返回可区分的 401 body：`"Invalid access token."` / `"Expired access token."`（附 `expired_at`）/ `"Revoked access token."`；UI 里重新生成（regenerate）会产生**新 token 串**，必须在 CourseWise 重新粘贴。

设计：

1. **录入**：设置 → 集成 → Connect Canvas：教师粘贴 base URL（默认预填院校域名，单租户下是常量配置）+ token。后端立即 `GET /api/v1/users/self` 验证：200 → 存储并展示 Canvas 姓名/头像确认"连的是你自己"；401 按三种 body 给出精确错误文案。
2. **建议但不强制**：引导文案建议教师给 token 设一个**学期末的过期日**（最小化泄露窗口），并截图指引 purpose 填写。
3. **状态机**：`lms_connections.status ∈ active | expired | revoked | invalid | error`。任何 API 调用遇到 401 → 按 body 精确落状态 + 顶部横幅"重新连接 Canvas"+ **暂停一切夜间刷新**，绝不带病运行或静默提供陈旧名册。
4. **重录**：粘贴新 token 覆盖旧密文，旧密文即刻销毁；断开连接 = 删除密文并提示教师"请同时在 Canvas → Approved Integrations 中删除该 token"（手工 token 我们无法替教师吊销——`DELETE /api/v1/users/self/tokens/:id` 需要 token 本身仍有效，有效时顺手调用，失败则仅提示）。

### 3.3 安全处置（全权限爆炸半径）

- **静态加密**：AES-GCM，密钥为 Worker secret `CANVAS_TOKEN_ENC_KEY`（沿用 v1 决策与 `aiProviders.api_key_secret_ref` 先例）；每教师一行密文存 `lms_connections.tokenEnc`，另存 `tokenLast4` 供 UI 展示。明文只在验证/调用瞬间存在于内存，**永不落日志**（复用"prod 不打 PII 日志"纪律）。
- **爆炸半径告知**：该 token 能做教师本人能做的一切（读写其全部课程的成绩、提交、消息）。设置页原文警示，等同于"你正在把 Canvas 密码级凭证交给 CourseWise"。这也是加密 + 最小调用面（唯一的逐端点调用面清单见 §九.3，P0–P2 以读为主）+ 机构背书三件套的动机。
- **服务端最小暴露**：token 只在 Worker 内解密使用，任何 API 响应、`lms_sync_runs.summaryJson`、审计 metadata 中不出现明文或密文。
- **纵深**：借本次上线激活休眠的按课程 API token 作用域（`requireTokenCourseAccess` / `course:<id>`，FERPA 发现 M-8/H-4）——CourseWise 侧对外 token 与 Canvas token 双向都收紧。

## 四、总体架构（沿用 v1 骨架，说明改动）

仍全部落在单 Worker `coursewise-api`（Hono + Neon/Drizzle），**不引入 Queues / Durable Objects**：

```
apps/api/src/
  services/lms/canvas/
    client.ts        # CanvasClient：手写 fetch（仿 services/gamma/client.ts）
                     #   串行、UA、Link 分页、403/429 退避、401 body 三分类
    tokens.ts        # AES-GCM 加解密（CANVAS_TOKEN_ENC_KEY）——沿用 v1
    importCourse.ts  # 一次性导入映射：Canvas payload → 草稿行（§五）
    roster.ts        # 名册引用抓取 + 快照 diff（§六/§七）
    match.ts         # 匹配阶梯 + 建议生成（§六）
    gradeExport.ts   # 可选 P3：成绩回写（§七）
  workflows/lmsSync.ts   # LmsSyncWorkflow，kind 分派（沿用 courseExport.ts 模式）
  routes/canvas.ts       # /api/teacher/canvas/* 与 /api/courses/:courseId/canvas/*
```

与 v1 的架构级增删：

- **删**：`oauth.ts`、refresh 重试环、`CANVAS_CLIENT_ID/SECRET` secrets、redirect callback 路由、结构层持续 diff 与"保留我的/采用 Canvas"冲突 UI、退课确认流。
- **增**：`roster.ts` 与新表 `lms_roster_entries`（Canvas 名册的本地引用快照——v1 直接写 `users`/`enrollments`，v2 需要一个不污染账号体系的落点）。
- **不变**：Workflow 任务模式（路由插 `lms_sync_runs` 行 → `env.LMS_SYNC_WORKFLOW.create()` → 202 + runId → TanStack Query 轮询）；`step.do` 指数退避、终态 4xx 抛不可重试；熔断器；`recordAudit` 全覆盖；路由守卫 `requireAuth` + `requireTeacher`/`requireCourseTeacher` + 新 `SCOPE_GROUPS` 条目 `canvasSync`（否则 `auth-coverage.test.ts` 挡 CI）；OpenAPI 注册。

**表结构**（一次 Drizzle 迁移，均带 `provider` 枚举，当前仅 `canvas`）：

- `lms_connections`：按教师唯一。`baseUrl`、`externalUserId`、`externalUserName`、`tokenEnc`、`tokenLast4`、`tokenExpiresAt`（可空：验证时调用 `GET /api/v1/users/self/user_generated_tokens`，按 purpose（"CourseWise integration"）/`token_hint`(last4) 启发式匹配本 token 行读取其 `expires_at`——该匹配为启发式、字段存在性需 P0 实测确认；匹配不到则退化为教师自报或留空）、`status`（§3.2 五态）、`lastValidatedAt`。较 v1 删去 `refreshTokenEnc` / `accessTokenExpiresAt` 语义。
- `lms_course_links`：`courseId` ↔ `externalCourseId`（text，容 `shard~id`）、`importedAt`、`importRunId`、`rosterRefreshEnabled`、`rosterRefreshUntil`（增补退选截止，过期自动停夜刷）、`lastRosterFetchAt`。
- `lms_roster_entries`：`(courseLinkId, canvasUserId)` 唯一；`name`、`sortableName`、`email?`、`loginId?`、`sisUserId?`（三者按 token 可见性可空）、`enrollmentState`、`sectionNames json`、`fingerprint sha256`、`firstSeenAt` / `lastSeenAt` / `disappearedAt`。这是"引用清单"的物化，**与 `users`/`enrollments` 零外键**。
- `lms_id_map`：沿用 v1 多态设计 `(courseLinkId, localType, localId, externalId, syncedAt)`。v2 的 localType：`student_link`（核心——`localId=users.id`，`externalId=canvasUserId`，附加列 `matchMethod sis|email|login_id|claim|name_suggestion|manual`、`confirmedByUserId`、`confirmedAt`）；`assignment` / `assignment_group` / `module`（导入溯源，只写一次）；P3 增 `pushed_assignment_column` / `final_grade_column`。
- `lms_sync_runs`：kind `initial_import | roster_refresh | grade_export`，状态机与 `summaryJson` 沿用 v1。
- `lms_grade_outbox`（**P3 才建**）：确定性 `idempotencyKey = sha256(runId|opType|localId|payloadFingerprint)`——**幂等域限定在单次推送 run 内**；入队新意图时将同 `(opType, localId)` 的历史 `sent` 行标记 `superseded`，唯一约束只作用于 `pending`（防同一意图重放，同时不吞掉成绩振荡 A→B→A 中后到的同值新意图）；状态 `pending|sent|superseded|cancelled|dead`、死信面板——v1 骨架保留，键域按振荡场景修正。
- v1 的 `lms_sync_cursors` 收缩为 `lms_course_links` 上的一列 `gradeExportGradedSinceCursor`（仅 P3 使用，含 5 分钟回退重叠窗口）。

Cron：`0 4 * * *` 分支增加"对 `rosterRefreshEnabled` 且未过 `rosterRefreshUntil` 的课程跑 roster_refresh"。无其他轮询。

## 五、初始课程导入（Canvas → CourseWise 课程壳与结构）

**流程**：连接 token 后 `GET /api/v1/courses?enrollment_type=teacher&enrollment_state=active&include[]=term,total_students&per_page=100` 出课程选择器 → 教师选一门 Canvas 课程，链接到既有 CourseWise 课程（`requireCourseTeacher`）或据元数据新建 → 触发 `initial_import` Workflow → **导入预览**（计数 + 逐项清单）→ 教师确认提交。全程 200 人规模课程约 5–8 个串行请求，远低于限流桶。

**映射表**（方向全部 C→CW，一次性；每行写 `lms_id_map` 溯源）：

| Canvas 对象（端点，教师 token 可行性） | CourseWise 目标 | 备注 |
|---|---|---|
| Course（`GET /api/v1/courses/:id?include[]=term,syllabus_body` ✅） | `courses`：`name`→title、`course_code`→code、`term.name`→termLabel（自由文本）、`start_at/end_at`→startDate/endDate、`syllabus_body` HTML→Markdown 尽力转换→syllabusMd | 新建课程时用；链接既有课程时仅提示差异，不覆盖教师已填字段。按 `courses.code == course_code` 给链接建议 |
| Assignment Group（`GET /courses/:id/assignment_groups` ✅） | `assignment_groups`（name、`group_weight`→weight、position） | CW 侧 `weight` 为 integer 而 `group_weight` 可带小数（如三等分 33.33）：非整数值**四舍五入并在导入预览/摘要中明示**（避免静默截断致权重合计不为 100）；`rules`（drop_lowest 等）无干净目标，写入导入摘要备注 |
| Assignment（`GET /courses/:id/assignments?per_page=100` ✅） | `assignments`：title、description(HTML→MD)、`due_at/unlock_at/lock_at`→dueDate/startDate/untilDate、`points_possible`→maxScore、归入对应 group，**status='draft'** | 仅 `grading_type ∈ points|percent` 映射数值分；`workflow_state=deleted/unpublished` 跳过或标记；overrides 不映射 |
| Classic Quiz（`online_quiz`）与 New Quiz（`external_tool` + quiz LTI 标记） | `assignments` **草稿桩**（标题/日期/分值 + "imported quiz stub" 标记） | 题目内容不导入：New Quizzes 题面 API 可读但与 CW 题型（含 `case_analysis`）阻抗失配大、`interaction_data` 逐题型 finicky，导入价值/成本比不过关。教师在 CW quizzes 中重建题目 |
| Module（`GET /courses/:id/modules` ✅） | `modules`（title、position、**status='draft'**） | 草稿态避免与 `moduleCadence` 派生窗口打架；**module items 不导入**（指向的 Pages/Files 本身不导入，空指针无意义） |
| Section（`GET /courses/:id/sections` ✅） | 不建表；名称存入 `lms_roster_entries.sectionNames` | 仅供核对 UI 徽章 |
| **学生名册** | **绝不写 `users`/`enrollments`** | 首次名册引用抓取在导入尾步顺带执行，落 `lms_roster_entries`，供 §六 |

**导入语义**：

- 一切结构行以 **draft** 落库，教师在 CourseWise 内审阅、修改、发布——导入是脚手架，不是权威复制。
- 导入完成即写 `lms_course_links.importedAt`；此后这些行是**普通 CourseWise 行**，不参与任何后续同步，教师可随意改删。
- **重复导入**：允许显式"重新导入结构"（例如首次导入太早、Canvas 侧后来补了作业），走同一预览流程；用 `lms_id_map` + 映射字段 sha256 指纹去重——已导入且未变的跳过、已导入且教师在 CW 改过的**永不覆盖**（列入摘要）、Canvas 新增的作为新草稿列入预览。这是 v1 指纹管线的唯一结构级残留用途。**枚举阶段必须排除 CourseWise 自己推到 Canvas 的成绩载体**（防 P3 之后的回声导入）：`lms_id_map` 中任何 localType ∈ {`pushed_assignment_column`, `final_grade_column`} 的 externalId、专建 "CourseWise" assignment group 内的全部作业、以及 description 含 `data-coursewise-id` 标记的作业（漂移恢复兜底）——三重排除，缺一即可能把我方承载列导回为 CW 草稿。
- 审计：`canvas.course.link`、`canvas.import.run`（metadata 含计数）。**导入含尾步名册摄取**（学生 PII 流入）：`canvas.import.run` 的 metadata 记录本次摄取实际拿到的字段集（email/sis_user_id/login_id 可见性）与行数；入向摄取属 school-official 内部使用、不构成 §99.32 对外披露，故不写逐学生披露行——口径论证见 §九.1。

## 六、学生自注册与 Canvas 身份关联机制（匹配阶梯、核对 UI、id-map）

### 6.1 前提与原则

学生经**既有自注册 + `invitation_codes`** 进入 CourseWise 课程——集成对账号开通零介入（v1 的"导入生成无密码账号 + 认领"管线**整体删除**）。集成负责的是把 CourseWise 报名者与 Canvas 名册对上号。两条铁律：

1. **无确认不成链**：一切自动匹配只产生"建议"，必须教师（或学生申领 + 教师复核）确认后才写 `lms_id_map`。模糊自动匹配（尤其姓名）直接落链**被禁止**。
2. **两侧未匹配者必须可见**：不许静默吞掉任何一边的孤儿。

### 6.2 名册引用抓取

`GET /api/v1/courses/:course_id/users?enrollment_type[]=student&enrollment_state[]=active&per_page=100`（教师 token ✅；controller 会强制附带 `sis_user_id`/`email`——**当且仅当**角色权限允许）。逐条 upsert 进 `lms_roster_entries`，跳过 Test Student。抓取时记录本次运行实际拿到了哪些字段（`email` / `sis_user_id` / `login_id` 各自的可见率），直接决定阶梯可用层级并展示在核对 UI 顶部（"你的 Canvas 权限可见：email ✅ / sis_user_id ❌"）。

### 6.3 匹配阶梯（自动建议层，按置信度降序）

| 层级 | 匹配键 | 置信度与处置 |
|---|---|---|
| ① `sisUserId` ↔ `student_profiles.studentNumber` | 学号精确等值 | 最高置信建议（仍需一键确认）。教师 token 常看不到 sis_user_id——缺则整层跳过 |
| ② `email` ↔ `users.email`（lower 精确） | 邮箱等值 | 高置信建议。Canvas email 可为空/私人邮箱与校邮不一致——命中即建议，不命中不降级猜测 |
| ③ `loginId` ↔ `users.email` 或 `student_profiles.studentNumber` | login_id 常即校邮/学号 | 中置信建议，UI 注明匹配依据是 login_id |
| ④ 学生申领信号：学生在个人资料页自填 `studentNumber`（既有 `PATCH /api/students/:userId/profile` 端点，本人可改；现有注册/选课流**不**收集该字段——若要在注册/选课时收集，列为 P2 的一项前端 + schema 增量工作） | 与 ①③ 交叉验证 | 若 sis/login 可见且等值 → 升为高置信；不可见 → 作为教师人工核对时的辅助列展示 |
| ⑤ `sortableName` 姓名近似 | 仅排序辅助 | **只用于在核对 UI 中把疑似同名者排到相邻位置**，永不生成"建议"卡片，更永不自动落链 |

同一 Canvas 行命中多个 CW 学生（或反之）→ 该行标记 `ambiguous`，只走人工。

### 6.4 核对 UI（teacher-facing reconciliation view）

课程 → 设置 → Canvas → "名册核对"。左列 Canvas 名册（`lms_roster_entries`），右列 CourseWise 报名者（`enrollments` join `users`/`student_profiles`），四个桶：

1. **已建议**：并排卡片展示双方姓名/邮箱/学号 + 匹配依据徽章（"email 一致"/"学号一致"），**一键确认**（可全选批量确认——批量确认仍是确认，不违反铁律）。
2. **已确认**：已落 `lms_id_map` 的链接，可解除（unlink 需二次确认 + 审计；**解除事务内同时将该生全部 `pending` 的 `lms_grade_outbox` 行置 `cancelled` 并审计留痕**——已烧录 canvas_user_id 的待发操作不得在错链纠正后仍被重试发出）。
3. **仅在 CourseWise**：已报名但 Canvas 名册上找不到——徽章 "not on Canvas roster"（可能是旁听/晚注册/退课后仍在 CW），教师可**手动指定**任一未链接 Canvas 行完成人工链接，或保持未链接（未链接学生在 CW 内一切功能正常，只是不参与回写）。
4. **仅在 Canvas**：名册上有但尚未注册 CourseWise——这是教师的催办清单，提供"复制邀请码/邀请链接"快捷动作。**绝不据此创建账号**。

每次确认/解除写 `recordAudit`（`canvas.roster.link` / `canvas.roster.unlink`，`disclosedStudentId` = 该 CW 学生——把 Canvas 侧身份信息与 CW 记录关联本身即纳入披露口径），并落/删 `lms_id_map` `student_link` 行（含 `matchMethod`、`confirmedByUserId`、`confirmedAt`）。

## 七、后续同步机制（名册核对刷新、可选成绩回写、幂等与冲突）

### 7.1 名册引用刷新（增补退选期）

- 触发：核对页 "Refresh Canvas roster" 按钮（主路径）+ 夜间 cron（`rosterRefreshEnabled && now < rosterRefreshUntil`）。跑 `roster_refresh` Workflow：重抓 §6.2 → 指纹 diff `lms_roster_entries` → 新面孔进"仅在 Canvas"桶、消失者置 `disappearedAt`。
- **消失 ≠ 退课**：已链接学生从 Canvas 名册消失 → 该生在 CW 名册与核对页打 "dropped in Canvas" 徽章，**仅此而已**——CourseWise 报名状态由教师在 CourseWise 内管理，名册是引用不是指令。v1 的"确认后置 dropped"流程删除。
- **熔断器**（沿用 v1，重新定标）：单次刷新若 >20% 已链接学生消失、或名册总数骤降 >30%，中止写入、run 置 `failed`、摘要注明"疑似 Canvas 侧异常（结课/权限变化），请人工检查"。
- Token 失效（§3.2）自动暂停夜刷。

### 7.2 可选阶段：成绩回写（CW → Canvas，仅已链接学生）

> 明确标注**可选**：仅当院校保留 Canvas 为官方成绩簿时才实施；核心产品闭环（P0–P2）不依赖它，其表（outbox）与游标列也推迟到该阶段迁移。

- **列从哪来**：CourseWise 是出题方，Canvas 里没有对应作业。推送时按需在 Canvas 创建承载列：`POST /api/v1/courses/:cid/assignments`（教师 token ✅）——`assignment[name]` = CW 作业名、`points_possible` = maxScore、`submission_types[]=none`、**`assignment[published]=true`（教师 token 可写；Canvas 经 API 新建的 assignment 默认 unpublished，而批量 `update_grades` 要求目标列已发布，否则 401——漏掉即首个推送批次必然失败）**、归入专建的 "CourseWise" assignment group（`POST /courses/:cid/assignment_groups`，教师 ✅）以便隔离与识别。若启用"暂缓公布"（见下"可见性"），顺序为：创建（不发布）→ GraphQL `setAssignmentPostPolicy(postManually: true)` → `PUT .../assignments/:aid` 发布 → 推分。**注意**：列一旦经推分产生 submission 行即**不可再 unpublish**，只能删除（软删）——文档与 UI 均需注明。也支持单列模式："CourseWise Final Grade" 承载 `final_grades`（REST 写不了课程 final/override 分，专列仍是诚实答案，v1 结论不变）。
- **幂等键存储**：`assignment[integration_data]/integration_id` **对教师 token 不可写**（无 `manage_sis` 时被静默剥除）——外部 ID 映射**只能存我方**：Canvas 返回的 `assignment.id` 落 `lms_id_map`（`pushed_assignment_column`），辅以 `description` 内 `<span data-coursewise-id="…">` 标记作漂移恢复启发（教师可能删列——恢复顺序：id-map 直查 → 404 则按 group + name + marker 再认领 → 都失败则重建列）。
- **推送**：永远是教师显式动作（按作业或整课）。批量 `POST /courses/:cid/assignments/:aid/submissions/update_grades`，`grade_data[<canvas_user_id>][posted_grade]` 一律绝对分值（如 `"13.5"`）；返回 Progress，复用 Gamma poll-with-lease（4 秒租约）轮询至终态。**无已确认 `student_link` 的学生直接拒绝进入批次**；**`disappearedAt` 非空（Canvas 侧已退课）的已链接学生同样剔除**（对 concluded/deleted enrollment 推分会逐生报错或静默无效）——两份被剔名单与未链接名单同级、随推送摘要展示。
- **outbox 幂等**：每条操作入 `lms_grade_outbox`，`idempotencyKey = sha256(runId|opType|localId|payloadFingerprint)`——幂等域限定在单次推送 run 内，防的是**同一意图的重放**；入队新意图时将同 `(opType, localId)` 的历史 `sent` 行标记 `superseded`、唯一约束只作用于 `pending`，故成绩振荡 A→B→A 中回改到 A 的第三次推送**不会**被第一次的历史 key 吞掉；Workflow 步级重试 + posted_grade 绝对值 ⇒ run 内重放天然幂等；死信入健康面板可重试（沿用 v1 与 `r2_cleanup_jobs` 先例）。
- **防覆盖守卫**：推送前 `GET /courses/:cid/students/submissions?student_ids[]=all&assignment_ids[]=<列>&graded_since=<游标-5min>` 检出 Canvas 侧人工改分。**比对基准是我方 outbox 记账，而非 `grader_id`**：将拉回的 submission `score` 与 `graded_at` 对照 `lms_grade_outbox` 中该 `(学生, 列)` 最近一次 `sent` 记录（我方推送值 + 推送时间戳）——分值不等于我方最后推送值、或 `graded_at` 晚于我方最后推送时间 ⇒ 判为 Canvas 侧手改，涉事学生剔出批次、交教师裁决。`grader_id` 在教师 personal token 下**对"同一教师手改 vs CourseWise 推送"无鉴别力**（两者的 grader_id 同为该教师的 Canvas user id），仅作为识别 TA/co-teacher 第三方改分的附加信号。
- **可见性**：默认 post policy 为 automatic ⇒ 分数落地即学生可见。提供课程级开关"暂缓公布"：创建列后、**发布列之前**经 GraphQL `setAssignmentPostPolicy(postManually: true)`（教师 token ✅，权限门为 `manage_grades`），教师在 Canvas 内自行 post。
- **审计**：每次推送按 `disclosedStudentIds` 逐学生写 `audit_logs`（`action: canvas.grade_export`），与 outbox 状态更新同一 Drizzle 事务（针对已知缺口 M-4）。

## 八、分阶段实施计划（工作量 + 验收标准）

| 阶段 | 范围 | 关键交付物 | 工作量 | 验收标准 |
|---|---|---|---|---|
| **P0 — Token 连接** | 粘贴、验证、加密、失效 UX | 迁移（`lms_connections`/`lms_course_links`/`lms_roster_entries`/`lms_id_map`/`lms_sync_runs`）、secret `CANVAS_TOKEN_ENC_KEY`、`tokens.ts`、`client.ts`（UA、串行、Link 分页、403/429 退避、401 body 三分类）、连接/断开路由与设置 UI、机构背书文档模板、审计动作、scope group + OpenAPI + auth-coverage 通过 | **1 周** | 在目标院校真实实例实测：教师自建 token 未被账户设置禁止；粘贴→`/users/self` 验证→展示 Canvas 身份；`user_generated_tokens` 的 `expires_at` 启发式匹配实测确认（不通则回退教师自报）；过期/吊销/无效三种 401 文案精确；断开后密文销毁；无未守卫路由 |
| **P1 — 初始课程导入** | 课程选择、预览、结构落草稿 | `importCourse.ts` 映射 + HTML→MD、`LmsSyncWorkflow(initial_import)`、导入预览确认 UI、id-map 溯源、重复导入去重（指纹 + 我方对象排除） | **1.5 周** | 真实 SIS 预建课程（含 modules/groups/assignments/quizzes）导入 <2 分钟；全部落为 draft；**零 `users`/`enrollments` 行产生**；非整数 group_weight 四舍五入且预览明示；二次导入对未变项写入数为 0、对 CW 已改项零覆盖 |
| **P2 — 名册引用与身份关联**（核心闭环完成） | 名册抓取、匹配阶梯、核对 UI、刷新 | `roster.ts`、`match.ts` 阶梯（①–④ 建议 + ⑤ 仅排序）、四桶核对 UI、link/unlink + 逐学生披露审计、"Refresh roster" + 夜间 cron 分支、熔断器、字段可见率提示、（可选）注册/选课流收集 `studentNumber` 的 schema + 前端增量 | **2 周** | 在 email 可见与不可见两种权限配置下各过一遍：所有建议带匹配依据徽章；无任何链接绕过确认落库；两侧孤儿全部可见；消失学生只打徽章不改报名；熔断器在构造场景触发 |
| **P3 —（可选）成绩回写** | 承载列、批量推分、防覆盖 | `lms_grade_outbox` 迁移、`gradeExport.ts`、列创建（含 `published=true` / post-policy 顺序）/再认领、update_grades + Progress 租约轮询、`graded_since` + outbox 记账守卫、post-policy 开关、死信面板、事务化披露审计、推送摘要 UI | **2 周** | 新建承载列即为 published，首次推分不因未发布 401（未发布列推分被拒/自动发布用例通过）；重复推送 Canvas 侧零重复变更；成绩振荡 A→B→A 三次推送后 Canvas 终值为 A；未链接学生与 Canvas 侧已退课学生被拒并列出；Canvas 手改分（含同一教师手改）被检出剔除；unlink 后该生 pending outbox 行全部 cancelled；教师删列后能再认领或重建；**推分后重新导入结构，预览零回声条目**；每个受推学生有披露行 |

合计核心 **P0–P2 约 4.5 工程师周**（第 2.5 周末即有"导入课程壳"的可发布价值），P3 视院校需求另加 2 周。每阶段经现有 CI（ci → migrate → deploy）独立上线，藏于连接入口之后；邀请码等既有流程全程不受影响（Canvas 未连接时 CourseWise 一切照旧）。

## 九、风险与合规（FERPA + token 风险）

1. **FERPA 口径变化**：v2 的首要 PII 流动方向是**流入**（Canvas 名册 → `lms_roster_entries`）而非流出。处置：数据最小化——只取 name/sortable_name/email/login_id/sis_user_id/enrollment_state/section，**不取** avatar、`last_activity_at`、grades；首次名册摄取发生在 initial_import 尾步（§五），`canvas.import.run` metadata 记录摄取字段集与行数——入向摄取属 school-official 内部使用（含从未注册 CW 的学生行），不构成 §99.32 对外披露，故不产生逐学生披露行，但数据流全程入账；`rosterRefreshUntil` 过期后快照冻结，课程归档时随课清理。**流出**仅 P3 成绩回写，构成 §99.32 披露：逐学生 `disclosedStudentId` 审计行与业务写入同事务（M-4）、学生可经 `GET /me/records/disclosures` 自查。身份链接动作本身也按披露记账（§6.4）。school-official 定位（§99.31(a)(1)(i)(B)）由机构背书文件支撑。
2. **Token 政策与生存性**：政策条款风险由 §3.1 三件套（单租户定位声明、机构书面背书、红线不 SaaS 化）覆盖；生存性风险是 Instructure 持续收紧（purpose 强制、管理员删除权、账户级禁止开关）——缓解：失效检测与重录 UX 是 P0 一等公民，不假设 token 永生；若院校日后关闭自建 token，迁移路径是 v1 的 OAuth 方案（表结构兼容：`tokenEnc` 列语义通用，加回 `refreshTokenEnc` 即可）。
3. **全权限爆炸半径**：泄露一枚 token = 泄露该教师的整个 Canvas 权限面。缓解：AES-GCM 静态加密、明文零日志、last4 展示、建议学期末过期、**最小调用面清单化**（唯一清单，§3.3 同引，机构背书文档附录同源）——P0–P2 只读面：`GET /users/self`、`GET /users/self/user_generated_tokens`（可选，读 `expires_at`）、`GET /courses`（列表与 `:id` 详情）、`GET /courses/:id/assignment_groups`、`GET /courses/:id/assignments`、`GET /courses/:id/modules`、`GET /courses/:id/sections`、`GET /courses/:id/users`，另有断开时尽力调用的 `DELETE /users/self/tokens/:id`；P3 写入面：`POST /courses/:id/assignment_groups`、`POST/PUT /courses/:id/assignments`（创建/发布/再认领）、`POST .../submissions/update_grades`、`GET /courses/:id/students/submissions`（防覆盖守卫）、`GET /progress/:id`、GraphQL `setAssignmentPostPolicy`；DB 泄露场景下密钥在 Worker secret 中独立存放。
4. **学生错链（最坏情形：P3 把 A 的分推到 B 的 Canvas 行）**：v2 的结构性优势是链接全部经人手确认。叠加：阶梯永不姓名自动落链；ambiguous 强制人工；`matchMethod` + 确认人全程审计；无确认链接拒绝推分；解除链接在同一事务内取消该生全部 pending outbox 行（置 `cancelled`）并使其退出未来批次——纠错后旧待发分数不会再被重试推到错误的 Canvas 行。
5. **可见性塌方**：院校角色覆写可能同时关掉 email/sis/login 可见性，阶梯退化为纯人工 + 学生申领。这是产品性降级不是故障——核对 UI 的字段可见率横幅让教师知情，人工链接路径始终可用。
6. **Canvas API 漂移**：文档门户迁移（2026-07）、限流 403→429 双态、User-Agent 强制（2026-06-20）、`/students` 与字符串 `role` 弃用均已内建；GammaClient 式防御性解析；`GET /users/self` 自检区分"token 死了"与"API 变了"；集成测试钉在 `<school>.beta.instructure.com` 周刷沙箱；订阅 2026 API Change Log。

## 十、暂不做的事项与理由

- **OAuth2 / developer key 流程（v1 的核心）**：无管理员即无 key，客观不可得。代码与表结构保持可回补（见 §九.2），作为院校政策收紧时的升级路径而非现在的负担。
- **从 Canvas 创建学生账号（v1 P1 的核心）**：被自注册 + 身份链接取代。少一条"平台替学生开户"的 PII 管线，FERPA 面更小，也消灭了 v1 最重的错配风险源（静默建号）。
- **持续结构同步与冲突管线（v1 P2 的核心）**：导入后 CourseWise 是唯一真源，"Canvas 在其字段上获胜"规则及其逐字段冲突 UI 无对象可裁决。指纹机制降级保留于重复导入去重与名册 diff。
- **向 Canvas 推送课程结构**：明确排除（P3 的承载列是成绩载体，不是结构镜像，且在重复导入枚举中被显式排除以防回声）。教师 token 虽然写得动 assignments/modules/pages（研究已证实），但双写两个真源是本方案立场上的自我否定。
- **破坏性名册动作（v1 的退课确认流）**：名册降格为引用清单后，"确认退课"这类流程整体失去存在理由——只剩徽章（P3 推送批次对 Canvas 侧已退课者只做剔除 + 摘要展示，仍不动 CW 报名）。
- **测验内容导入/同步**：New Quizzes 无作答/逐题结果公开 API，题面结构与 CW 题型（`case_analysis`、波次、锁定模式）阻抗失配大；Classic 事实弃用。测验以草稿桩进入 CW，成绩在 P3 作为普通列流出。
- **考勤、Pages、Files、公告、讨论内容、module items**：内容搬家是迁移功能不是集成功能；文件字节还会拖入 R2 配额与 MIME 白名单问题。考勤经 `grading_policies.weightAttendance` 加权进 `final_grades`，随最终成绩列间接到达 Canvas。
- **Live Events / Canvas Data 2 / Webhook / LTI 1.3**：全部需要管理员开通或安装，违背本方案的存在前提。LTI 1.3（NRPS 名册 + AGS 回分 + 免 token）仍是客观更优的长期架构——`lms_id_map` 的键在 NRPS 的 `canvas_user_id` 扩展下原样可用，届时身份链接可整层自动化；准入条件是院校出现愿意点安装按钮的人。
- **15 分钟轮询 / 自动定时推分**：名册变动节奏配不上，成绩推送保持教师显式动作——烧教师 token 配额换不来产品价值。