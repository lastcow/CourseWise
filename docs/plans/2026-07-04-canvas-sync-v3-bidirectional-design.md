> 本文档由 2026-07-04 的方案迭代产出（v3），在 [2026-07-04-canvas-sync-v2-import-first-design.md](2026-07-04-canvas-sync-v2-import-first-design.md) 之上扩展为全资料双向同步；实施以 v2 为前置。

# CourseWise ↔ Canvas 双向同步方案 v3（全资料双向同步）

> 状态：设计稿（2026-07）。在 v2（已定稿并按 P0–P2 实施：教师手工 token、一次性课程导入、名册引用与身份关联、可选成绩回写）之上扩展为**持续、全资料、双向**同步。v2 已裁决事项不再复议：token 录入/加密/失效 UX（v2 §3）、`lms_connections` / `lms_course_links` / `lms_roster_entries` / `lms_id_map` / `lms_sync_runs` 表、身份关联铁律（无确认不成链）、Workflow 任务模式、机构背书三件套。v1 的同步引擎骨架（三方指纹、outbox、按域权威、熔断、审查队列）在此复活，但**剥离其 OAuth 与 Live Events 假设**：v3 只有教师手工 personal access token，只有轮询。

---

## 一、目标与诚实的可行性边界

目标：把 v2 的"一次性入驻坡道"升级为"持续双向镜像"——教师在任一侧编辑课程资料，另一侧在一个同步周期内收敛，冲突走人工审查。**但 Canvas 教师 token + 纯轮询的物理边界决定了"全资料双向"是营销语，工程真相如下表。**

### 可行性矩阵

| 资料类型 | 方向裁决 | API 级理由 |
|---|---|---|
| 课程元数据（title/code/dates） | **仅 Canvas→CW**（引用） | `course[name]/start_at/end_at` 常被 `prevent_course_renaming_by_teachers` / `prevent_course_availability_editing_by_teachers` 锁死（SIS 预建课程的常态）；`sis_course_id`/`term_id` 为 admin-only。写回不可靠即不写 |
| Syllabus | **双向** | 读 `GET /courses/:id?include[]=syllabus_body`、写 `PUT /courses/:id` `course[syllabus_body]`（教师 ✅）。代价：Course 对象**无 `updated_at`**，变更检测只能靠 body 哈希 |
| 作业（assignments） | **双向** | 教师全 CRUD ✅；`updated_at` 存在但**噪声大**（reorder/发布切换/评分侧触碰均 bump），只能当"需复查"信号，内容判定靠哈希。overrides 不映射 |
| 作业组（assignment groups） | **双向** | CRUD ✅；`rules`（drop_lowest 等）CW 无对应字段——只读展示不合并；weight 小数↔整数取整问题沿 v2 处理 |
| 模块与 module items | **双向** | CRUD ✅；REST 序列化器**不输出任何 `updated_at`/`created_at`**；GraphQL `Module.updatedAt` 可作触发信号（沙箱验证其覆盖面），结构判定仍靠全量 re-list + diff——成本可控但 REST 无增量 |
| Pages | **双向** | CRUD ✅ 且是**变更检测最优等生**：list 支持 `sort=updated_at&order=desc`，可"翻到 cursor 即停"（仅限变更检测；删除检测靠全量枚举，§2.7）。陷阱：`url` slug 随标题改变——一律以 `page_id` 为键、按 `/pages/page_id:<id>` 寻址 |
| 文件 | **双向** | 3-step 上传 ✅、下载 ✅；`updated_at`（记录级）+ `modified_at`（内容级）双时间戳 + `sort=updated_at`。陷阱：`on_duplicate=overwrite` 后 file id **不可信**（两份实测报告矛盾——按"会换 id"防御性设计，覆盖上传后必重解析 id）；verifier URL 正在废止，**永不持久化下载 URL** |
| 公告 | **双向** | 经 Discussion Topics API `is_announcement=true` CRUD ✅。陷阱：`/api/v1/announcements` 默认只回 14 天窗口——全量必须 `start_date=1900-01-01&end_date=2100-01-01`（或 `discussion_topics?only_announcements=true`）；无可靠 `updated_at` → body 哈希 |
| 讨论——主题（teacher 主题） | **双向** | topics CRUD ✅；body 编辑不 bump 可信时间戳 → 哈希 `message` |
| 讨论——回帖（entries） | **仅 Canvas→CW（只读镜像）** | **铁律：所有写入都以 token 所有者（教师）身份落款；`as_user_id` masquerade 需 admin 权限，教师 token 401。学生署名的内容永远不可能写入 Canvas。** 读取 ✅（`GET .../view` 全树，且删除帖带真 tombstone `deleted:true`） |
| 日历事件 | **分权双向**（CW 派生事件仅 CW→Canvas；Canvas 原生事件仅 Canvas→CW） | CRUD ✅、`updated_at` 可靠、`all_events=true` 全量拉取。但 CW **没有日历表**——日历是从 meetingSlots/模块窗口/作业日期派生的投影，"双向合并同一事件"无本地落点，只能分权 |
| 测验——题目内容 | **部分双向（仅 QuestionItem，题型受限）** | `/api/quiz/v1` 对 QuestionItem 全 CRUD 且 GET 含 `scoring_data`（正确答案）✅；但 **StimulusItem / BankItem / BankEntry 只读**（题库与共享题干 API 不可建）、CW `case_analysis` 无对应载体（写入必有损）。壳与 items **无可用时间戳**且 GraphQL 不覆盖 New Quizzes——入站变更检测只能逐测验全量拉取 + 指纹（§3.10，请求成本已计入 §2.6）。Classic Quizzes 视为只读遗产，不写 |
| 测验——分数/作答 | CW 侧测验分：**仅 CW→Canvas**（承载列/镜像，v2 P3 管线）；Canvas 侧 New Quiz 结果：**仅 Canvas→CW** | New Quizzes 无逐生 session/results 端点；唯一作答级通路是 `POST .../reports`（`student_analysis`）→ Progress → CSV/JSON，单向拉取。推分沿 v2 P3（内容同步开启时镜像即推分目标，§3.7） |
| 学生提交物 | **仅 Canvas→CW** | 读取 ✅（`students/submissions` + `include[]=submission_history` 含附件 URL）；写回需以学生身份提交 = masquerade = 教师 token 不可能。**学生在 CW 的提交物永远进不了 Canvas**（只有分数能）。Canvas 侧分数/评语不自动采纳，走检出→审查（§3.9） |
| 成绩 | **仅 CW→Canvas**（CW 权威；Canvas 侧手改仅检出→审查，不自动采纳） | v2 P3 已定：承载列 + `update_grades` + outbox 记账防覆盖守卫。course final **无 REST 直写**；GraphQL 存在 override-score 类通路（setOverrideScore，`manage_grades` 门控）但依赖机构开启 Final Grade Override 特性——不可依赖，记为被否决备选，承载列仍是答案。内容同步开启的作业其镜像即推分目标（§3.7，防双列） |
| 名册 | **仅 Canvas→CW**（只读引用） | v2 §6 已定且不变：学生自注册 + 身份关联，Canvas 名册永不驱动 CW 账号/报名 |
| 考勤 | **不可行** | Canvas 无考勤 API（Roll Call LTI 无公开 API）。替代：经 `grading_policies.weightAttendance` 加权进 final grade，以成绩列间接抵达 Canvas |

**三条不可谈判的诚实结论**（产品文案必须原样传达给教师）：

1. **学生产出永远单向**：学生的提交物、讨论回帖、测验作答，只能从 Canvas 读进 CourseWise，永远不能以学生名义写进 Canvas——教师 token 没有 masquerade，一切写入署名教师本人。
2. **测验内容往返最多做到"题目级、部分题型"**：题库、共享题干（case/stimulus）、随机抽题是 API 硬墙；CW 的 `case_analysis`、波次（quiz_schedules）、lockdown 推不出去。
3. **变更检测没有服务端快捷方式**：无 ETag/If-Unmodified-Since、无 audit log（教师 401）、无 Live Events（admin-only）、activity stream 覆盖面残缺——引擎必须自己养影子副本 + 内容哈希，靠轮询过日子。

---

## 二、总体架构

### 2.1 分层与代码落位（在 v2 结构上增量）

```
apps/api/src/services/lms/
  canvas/client.ts        # v2 已有：串行、UA、Link 分页、429/403 退避、401 三分类
  canvas/content.ts       # 新增：Pages/Files/Announcements/Calendar/Modules/Quiz 端点封装
  engine/normalize.ts     # 新增：HTML 规范化（去 verifier / data-api-* / host）、MD↔HTML、指纹
  engine/diff.ts          # 新增：三方 diff（base / local / remote），纯函数
  engine/outbox.ts        # 新增：v2 lms_grade_outbox 泛化为全写入 outbox
  engine/echo.ts          # 新增：回声记账与判定
  importCourse.ts / roster.ts / match.ts / gradeExport.ts   # v2 原样
workflows/lmsSync.ts      # kind 新增：content_pull | content_push | full_reconcile
routes/canvasSync.ts      # 审查队列、域开关、sync-now、健康面板
```

仍是单 Worker + Neon + Workflows，不引入 Queues/DO（v1 的 Queue 提案由 outbox 表 + Workflow 消费替代——单租户量级不需要独立队列基础设施；`r2_cleanup_jobs` 先例）。

### 2.2 表结构增量（一次迁移，全部挂在 v2 表系上）

- **`lms_id_map` 扩列**（同步状态的宿主，取代 v1 的 `external_object_links` 新表方案）：
  - 新 localType：`page`（↔ `reading_materials`）、`file`（↔ `file_assets`）、`announcement`、`discussion_topic`、`calendar_event`、`quiz_shell`、`quiz_item`、`syllabus`（每课一行的单例）。
  - 新列：`homeSystem ∈ cw|canvas`（**创建方即所有方**，见 §四）；`syncState ∈ in_sync|dirty_local|dirty_remote|conflict|remote_missing|local_deleted|frozen|error`；`baseSnapshot jsonb`（上次收敛时的规范化字段集——三方合并需要字段值，不只哈希）；`baseFingerprint`；`remoteFingerprint` / `remoteUpdatedAt`（最近观测）；`lastPushAt` / `lastPushRemoteUpdatedAt` / `lastPushFingerprint`（**回声记账**，见 2.3）；`errorDetail`。
- **`lms_outbox`**：v2 `lms_grade_outbox` 直接泛化改名（P3 已建则 ALTER）。`opType` 扩为 `push_grade | upsert_syllabus | upsert_page | upsert_file | upsert_announcement | upsert_topic | upsert_calendar_event | upsert_assignment | upsert_assignment_group | upsert_module | upsert_module_item | upsert_quiz_shell | upsert_quiz_item | delete_remote`。幂等键、`superseded`/`pending` 唯一约束、死信面板语义**逐字沿用 v2 §7.2**。
- **`lms_sync_cursors`**：`(courseLinkId, stream, cursor)`——v2 收缩成单列，v3 流多了，恢复 v1 的小表。stream 举例：`pages.updated_at`、`files.updated_at`、`submissions.graded_since`、`submissions.submitted_since`。
- **`lms_sync_conflicts`**：审查队列（v1 设计原样）：`entityType`、`idMapId`、`fieldDiffs jsonb [{field, base, local, remote}]`、`kind ∈ field_conflict|remote_deleted|local_deleted|lossy_convert|echo_freeze`、`decision ∈ pending|use_local|use_remote|merged|skip`、`resolvedById/At`。
- **`lms_remote_events`**：Canvas 原生日历事件的本地影子（CW 无日历表，见 §三.6）。
- **`lms_remote_posts`**：Canvas 讨论回帖的只读影子（不并入 `discussion_posts`，见 §三.8）。
- **`lms_course_links` 扩列**：`syncDomains jsonb`（逐域开关，全部默认 off）、`pollTier ∈ manual|nightly|active15m`、`dryRun bool`。

### 2.3 回声抑制（echo suppression）——引擎的第一公民

**事实前提**：同一教师的 UI 手改与我方 API 写入在 Canvas 侧**不可区分**（无请求归因字段，`grader_id`/`last_edited_by` 同为该教师；audit log 教师 401）。因此回声判定**只能靠我方记账**：

1. 每次出站写入成功后，Canvas 返回完整对象——把响应里的 `updated_at` 存入 `lastPushRemoteUpdatedAt`，把我方推送内容的规范化指纹存入 `lastPushFingerprint`。
2. 下次轮询遇到该实体：
   - `remote.updated_at == lastPushRemoteUpdatedAt` → 纯回声，跳过；
   - `updated_at` 更新**但** `normalize(remote)` 哈希 == `lastPushFingerprint` → Canvas 侧副作用触碰（reorder、override、评分触碰——已证实会 touch），刷新记账后跳过；
   - 哈希不同 → 真实远端变更，进入 diff。
3. 时间戳为秒级粒度——判等用严格相等 + 哈希双条件，绝不用 `>=` 单判。
4. 出站前的**读-比-写守卫**（Canvas 无乐观并发原语，写入一律 last-writer-wins）：PUT 前先 GET，比对 `updated_at`/哈希与我方 `remoteUpdatedAt`/`remoteFingerprint` 记录——不一致说明远端在我们上次观测后又动了 → 放弃写入、转冲突行。这是我们自己造的 If-Unmodified-Since。

### 2.4 三方合并（three-way merge）

每实体三份状态：`base`（`baseSnapshot`，上次收敛点）、`local`（CW 当前规范化）、`remote`（Canvas 当前规范化）。逐字段：

- 仅一侧偏离 base → 传播到另一侧（入 outbox 或本地 upsert）；
- 两侧同字段都偏离且值不同 → `lms_sync_conflicts` 行，冻结该实体传播直至裁决；
- 两侧偏离但值相同（各自改成一样）→ 直接收敛，刷新 base。

字段集按资源白名单定义（§三），白名单外字段（CW 的 lockdown/波次/迟交政策；Canvas 的 overrides/rules）**不参与指纹**——单侧独有编辑永不制造幻影冲突（v1 的教训原样保留）。

### 2.5 出站 outbox（全写入唯一通道）

CW 侧任何被同步域覆盖的**教师发起** mutation（发布 Page 对应的 reading_material、改作业、发公告……）在**同一事务**内 `outbox.enqueue()`；Workflow 消费者串行执行：读-比-写守卫 → 调 Canvas → 记回声账 → 刷新 base → `sent`。失败退避重试 → `dead` → 健康面板。**绝不允许任何绕过 outbox 的直写**——这是幂等、回声、审计三件事的共同锚点。

两条**防自激**规则与之配套：

1. **引擎写豁免**：pull 路径的入站 upsert 以 sync-actor 标记执行，**绕过 enqueue 钩子**——远端变更拉回本地绝不反向再推。若无此豁免，每次远端编辑拉回都会把 MD 再渲染的 HTML 推回 Canvas 覆盖其原文，正是 §三(a) 承诺永不发生的退化螺旋。
2. **消费者无差异跳过**（双保险）：发送前若 local 规范化指纹 == `baseFingerprint`（无可传播差异），置 `superseded` 直接跳过、不发出。

二者均为 P4 硬验收项（"远端编辑→拉取→下周期零出站"）。

### 2.6 轮询调度与请求预算（实测口径的数学）

限流事实：每 token 漏桶 hwm 600（硬顶 800）、漏出 10 units/s、每在途请求预扣 50——**严格串行的客户端事实上不可能被限流**（v2 CanvasClient 已串行）。且配额**按 token 分桶**：我方持有的 personal token 有自己的专属漏桶，教师浏览器里的 Canvas 会话与其其他工具各用各的桶、互不侵占。

单课程一次 **full_reconcile** 的请求账（`per_page=100`，典型 ≤200 人课程）。注意 GraphQL 探测**分页走到尽头**，兼作消失检测所需的全量 id 枚举（§2.7）：

| 步骤 | 请求数 |
|---|---|
| GraphQL 批量 delta 探测 + 全 id 枚举（assignments/pages/files/modules/discussions 的 id + `updatedAt`，**分页至尽头**——兼作 `remote_missing` 判定的 id 清单） | 1–N（N≈ceil(最大集合/100)；日常 1–3，500 文件课程 ~6） |
| calendar_events `all_events=true`（GraphQL 无日历） | 1–2 |
| announcements 全窗口列表（无可靠时间戳，必列） | 1 |
| discussion_topics 全列表（body 哈希检测，§3.4） | 1–2 |
| course + syllabus_body（无时间戳，必拉必哈希） | 1 |
| modules `include[]=items`（结构 diff 确认，§3.7） | 1–2 |
| 已同步测验逐个拉壳 + items（无时间戳资源，指纹比对，§3.10） | 2×N_quiz（典型 2–10） |
| 变更实体的定向 REST 拉取（日常 0–10 条） | 0–10 |
| **合计** | **≈8–35 / 课程 / 周期**（测验多的课程随 N_quiz 线性增长） |

- **夜间全量**：30 门活跃课程 × ~20 请求 ≈ 600 请求，串行 ~3–6 分钟墙钟，桶占用峰值 <10%。请求按 **token（教师）** 分桶——每教师 3–6 门课时单教师夜巡 <150 请求，毫无压力。
- **15 分钟档**（可选，仅教师显式开启的"活跃课程"）：轻探测 ~5–6 请求/课程 → 6 门课 × 96 周期 ≈ 3,500–5,000 请求/教师/天，占其 token **专属**漏桶个位数百分比。预算说明仍在开启入口披露（透明度考量），但不存在与教师本人 Canvas 使用共享配额的问题。
- Workers 侧约束：每 Workflow step 内完成整段分页游走（courseExport 教训），单 invocation subrequest 上限 1000 内绰绰有余。

### 2.7 删除传播策略（默认：tombstone + 人工确认，永不跨系统自动删除）

**前提：消失只能被全量枚举看见。**Canvas 的删除近乎全部是**软删且从列表里蒸发**（无 tombstone，讨论 entries 除外），且 UI undelete 可让"已删"实体复活。因此 `remote_missing` **只在 full_reconcile（manual / nightly）的全量 id 枚举中计算**——一切增量捷径（pages/files 的 cursor 截停、active15m 轻探测）结构性看不见删除；active15m 档的删除检测延迟 = 夜巡节奏（§五）。策略：

- **远端消失**：全量枚举中不见 → `syncState=remote_missing` + 审查队列（"Canvas 侧已删除或被隐藏"），教师三选一：归档本地 / 重新推送（复活远端）/ 解链。**绝不自动删 CW 行。**
- **本地删除**：CW 删除已同步实体 → `local_deleted` + 审查行，默认**保留远端** + 徽章；教师显式确认后才产生 `delete_remote` outbox 操作（对已有成绩的 assignment 额外警示：Canvas 删除会连带隐藏成绩，软删且无 API 恢复）。
- **复活检测**：`remote_missing` 实体在后续全量枚举中重现 → 撤销 tombstone、按普通远端变更走 diff。

---

## 三、逐资源同步设计

通用约定先立三条：

**(a) HTML↔Markdown 规范格式裁决**：CW 内容的 canonical 是 **Markdown**（`syllabusMd`、description 等既有字段）；每个同步实体在 `baseSnapshot` 里同时保存**规范化 HTML 影子**（出站渲染结果或入站原文，经 `normalize.ts` 处理：剥 `verifier=`、剥 `data-api-endpoint`/`data-api-returntype`、host 绝对链接归一为相对、属性排序）。指纹一律打在规范化 HTML 上——因为 Canvas 出站会重写链接加 verifier、入站会剥 verifier 补 context 前缀，**GET-then-PUT 从不逐字节相等**，裸文本比对必然自激。判定"远端变了"看规范化哈希；判定"本地变了"看 MD 哈希。远端变更拉回时 HTML→MD 尽力转换，检测到高损耗构件（iframe、复杂表格、内联样式）→ 打 `lossy_convert` 审查行而非静默降级；且**远端 HTML 原文（规范化后）始终留存在影子里**——本地未动时绝不用"MD 再渲染"覆盖远端（引擎写豁免 + 消费者无差异跳过在 §2.5 从机制上封死此路径），避免有损转换的 degradation 螺旋。

**(b) 文件链接双向重写**：出站（MD→HTML）时把 CW 内链（file_assets、页面引用）经 `lms_id_map` 换成 Canvas 相对链接 `/courses/:cid/files/:fid/download`（无 verifier——Canvas 入站清洗本来也会剥）；入站（HTML→MD）时反查 id_map，把 Canvas file 链接换回 CW 资源引用；未映射的 Canvas 文件链接触发按需文件拉取（§三.5）或保留绝对 URL + 标注。

**(c) 所有权默认规则**：`homeSystem` = 创建方。origin 一侧对"结构性字段"（发布状态、归属模块/分组）有默认权威；内容字段走三方合并。这把 v1 的"按域权威"细化为"按实体溯源权威"。

### 3.1 Syllabus（每课单例）

- 方向：双向。端点：读 `GET /courses/:id?include[]=syllabus_body`；写 `PUT /courses/:id` `course[syllabus_body]`。
- 变更检测：**全靠哈希**（Course 无 `updated_at`）——每周期必拉 body、规范化、比指纹。
- 冲突：单字段实体，两侧同时改 → 审查行给全文 diff（MD 视图）。
- 往返：`syllabusMd` canonical；`syllabusFileAssetId`（PDF 版 syllabus）不参与——文件版走文件域。

### 3.2 Pages ↔ `reading_materials`（sourceType=`manual_text`）

- 方向：双向。CW 侧落点是 `reading_materials`（`content` 文本 + moduleId/position），仅 `manual_text` 类型参与双向；`upload`/`external_link` 类型经模块项与文件域表达。
- 端点：`GET /courses/:id/pages?sort=updated_at&order=desc&include[]=body`（**增量最优：翻页到 `updated_at ≤ cursor` 即停**——但此截停仅用于**变更**检测；删除检测依赖 full_reconcile 的全量 id 枚举，§2.7，cursor 路径对消失结构性失明）；`POST /pages`、`PUT /pages/page_id:<id>`、`DELETE`。
- 键：**只存 `page_id`**（`url` slug 随标题改名漂移）。
- 字段白名单：title、body、published、front_page（只读展示）。Canvas 每次保存生成 revision——不镜像 revision 历史，但审查 UI 提供 revisions 链接。
- 冲突：字段级三方合并；body 冲突给渲染并排 diff。

### 3.3 公告 ↔ `announcements`

- 方向：双向，但**audience=groups 的 CW 公告不出站**（Canvas 只有 section 定向，CW 无 sections——不映射，打"仅本地"徽章）。
- 端点：列表用 `GET /courses/:id/discussion_topics?only_announcements=true`（正常分页，避开 announcements 端点的 14 天窗口陷阱）；写 `POST/PUT /courses/:id/discussion_topics` + `is_announcement=true`、`delayed_post_at`（↔ CW `publishAt`）。
- 变更检测：**无可靠 `updated_at`**——`posted_at`/`last_reply_at` 只是弱信号，每周期全列 + body 哈希。公告量小（每课几十条），成本可接受。
- 评论/reactions：不同步（学生产出，单向都不做——公告评论读取价值低，砍掉保持面小）。

### 3.4 讨论主题（teacher 主题）↔ `discussion_topics`

- 方向：主题双向；**回帖单向只读**（§3.8）。
- 端点：`GET /courses/:id/discussion_topics`（`order_by=recent_activity` 辅助）、`POST/PUT/DELETE`。变更检测：每周期全列 + body 哈希（同公告——REST `updated_at` 对 body 编辑不可信；此全列请求已计入 §2.6 预算）。
- graded discussion：CW `isGraded/maxScore` ↔ Canvas topic 的 `assignment[…]`；分数走成绩域承载管线，不在此域重复。

### 3.5 文件 ↔ `file_assets`（R2 ↔ Canvas Files）

- 方向：双向（教师课程文件；学生提交附件属提交物域，仅拉取）。
- 变更检测：`GET /courses/:id/files?sort=updated_at&order=desc` 增量；**`modified_at` + `size` 决定是否重传字节**，`updated_at` 单独变化（改名/移动/发布切换）只同步元数据。增量同样只捕捉变更，删除靠全量枚举（§2.7）。文件夹结构经 `GET /courses/:id/folders`（平铺全量）diff。
- CW→Canvas 字节流：Workflow step 内 R2 binding 流式读 → ① `POST /courses/:id/files`（带 `size` 快速失败、`parent_folder_path` 自动建目录、`on_duplicate=overwrite`）→ ② multipart POST `upload_url`（`file` 字段最后、**不带 Authorization**）→ ③ 跟随 `Location` 带 token 收尾（漏掉即文件不可用）。**上传前查 `GET /courses/:id/files/quota`**，超配额转审查行而非硬失败。覆盖上传后**立刻重解析 file id 并更新 id_map**（id 稳定性不可信）。
- Canvas→CW 字节流：**下载时实时取** File JSON 的 `url`（或 `/files/:id/public_url`）——verifier 参数在废止期，任何持久化的下载 URL 都是定时炸弹；跟随 302 时**剥掉 Authorization header**（S3 对双重鉴权 400）；流入 R2 建 `file_assets` 行（尊重 CW 50MiB 上限与 MIME 白名单——超限文件转"外链引用"降级 + 审查行）。
- 冲突：内容冲突（两侧都换了字节）无法合并 → 审查行二选一；元数据（名称/目录）字段级合并。
- 删除：双向都走 §2.7 tombstone（Canvas 文件删除无 API 恢复，UI undelete 对文件还不可靠——文案警示更重）。

### 3.6 日历事件（分权双向）

- CW 无日历表，日历是派生投影 → **不存在"同一事件双向合并"**，按来源分权：
  - **CW 派生事件 → Canvas**：从 meetingSlots/模块窗口/考勤场次物化一组受管事件推送（`POST /calendar_events`，`calendar_event[context_code]=course_<id>`；每周例会用 `rrule` 系列）。这些事件由 CW 全量重算-对账（我方 id_map 记录其 event id，diff 后 PUT/DELETE `which=all`）——**Canvas 侧对受管事件的手改会在下个周期被覆盖**，事件描述内注明"由 CourseWise 管理"。作业/测验的日期不重复推事件（Canvas 会从 assignment 自动上日历，推了即双影）。
  - **Canvas 原生事件 → CW**：`GET /calendar_events?type=event&context_codes[]=course_<id>&all_events=true`（≤10 context/请求），`updated_at` 可靠、软删会从列表蒸发→tombstone。落 `lms_remote_events` 影子表，渲染进 CW 日历（只读，标 Canvas 徽章）。

### 3.7 作业 / 作业组 / 模块与 items（双向，v2 导入的延续）

- **作业**：字段白名单 title、description(MD↔HTML)、due_at/unlock_at/lock_at ↔ dueDate/startDate/untilDate、points_possible ↔ maxScore、published ↔ status(draft|published)、assignment_group 归属。CW-homed 作业出站时 `submission_types[]=none` + description 尾注"请在 CourseWise 提交"（**学生提交动线留在 CW**，v2 立场不变；Canvas 镜像是通知与日历载体）；Canvas-homed 作业入站为可评分作业，其提交物走 §3.9 拉取。白名单外：CW 迟交政策/sets/rubric jsonb、Canvas overrides/`grading_type` 非 points——不参与指纹。变更检测：GraphQL `updatedAt` 触发 + 规范化哈希确认（`updated_at` 噪声大，哈希是唯一真话）。
- **镜像即推分目标（防双列铁则）**：CW-homed 作业开启内容同步后，其 Canvas 镜像 assignment **直接注册为成绩域的 `pushed_assignment_column`**（id_map 同一行承双职），**不再另建独立承载列**——一个 CW 作业在 Canvas 成绩册**恰好一行**可评分行，日历/通知也只有一份；未开启内容同步的作业沿用 v2 独立承载列。测验壳同理（壳背后的 assignment 即该测验的推分目标）。**v2 P3 的回声导入三重排除相应微调**：纯承载列（未参与内容同步的 `pushed_assignment_column`）、`final_grade_column`、"CourseWise" group、`data-coursewise-id` 标记的作业照旧永不作为内容域实体入站；内容同步镜像以内容实体身份正常参与同步，但其 score 字段由成绩域管线独占（内容域指纹不含分数）。
- **作业组**：name/weight/position 三方合并；`rules` 只读展示。`apply_assignment_group_weights` 开关教师可写，首次推组时置 true（预览确认）。
- **模块**：name/position/published/unlock_at 双向。REST 序列化器无时间戳，但 **GraphQL `Module.updatedAt` 可用**——轻探测以其为触发信号（P4 起在 beta 沙箱验证其对 item 级变更是否 bump；若不 bump，item 变更仅被 full_reconcile 捕捉）；full_reconcile 一律 `GET /courses/:id/modules?include[]=items`（大模块 fallback `items_url`）全量结构 diff（position 序列指纹）。module items 映射：CW reading_material→`Page`/`File` item、assignment→`Assignment`、quiz→`Assignment`（New Quiz 以 assignment id 挂载）、外链→`ExternalUrl`。`completion_requirement` 不映射。结构 diff 的移动/重排噪声大 → 重排只在**单侧**发生时传播，双侧都动过顺序 → 一条聚合冲突行（"两侧都调整了模块顺序"）而非逐项轰炸。

### 3.8 讨论回帖（Canvas→CW 只读镜像）

- `GET .../discussion_topics/:tid/view` 一次拿全树（教师视角无 require_initial_post 阻挡）；entries 带 `created_at/updated_at`，删除帖留真 tombstone（`deleted:true`）——是 Canvas 全域唯一有 tombstone 的资源，镜像可做到精确。
- 落 `lms_remote_posts` 影子表，作者经 `lms_roster_entries`（已链接学生显示 CW 身份，未链接显示 Canvas 姓名）。CW 前端在讨论页并列渲染"Canvas 讨论区（只读）"标签页——**不并入 `discussion_posts`**，两个平台的回帖流不假装是一条河（署名与身份的诚实性 > 界面统一性）。
- CW 侧学生讨论不出站（矩阵铁律）；教师如需在 Canvas 回帖，去 Canvas 回（我们能以教师身份 `POST .../entries`，但产品上砍掉——避免"CW 里代发到 Canvas"与镜像流的回声复杂度，收益不值）。

### 3.9 学生提交物（Canvas→CW 拉取）

- 范围：**Canvas-homed 且已链接进 CW 的作业** + 承载列防覆盖守卫所需读取。端点：`GET /courses/:id/students/submissions?student_ids[]=all&assignment_ids[]=…&submitted_since=<cursor>`，`include[]=submission_history,submission_comments`；游标存 `lms_sync_cursors`，带 5 分钟回退重叠。
- 落点：已确认 `student_link` 的学生 → upsert `assignment_submissions` 的 **status/submittedAt/附件**（首附件流入 R2；CW 单文件模型，多附件取最新版首个、其余以链接清单存 content 尾部——**有损，文档明示**）。**score/feedback 绝不盲写**：`assignment_submissions` 同一行承载 CW 侧评分，盲 upsert 会静默覆盖教师在 CW 打的分（提交物不在三方合并实体集内，无守卫可依）——Canvas 侧分数/评语与 CW 行不一致时，走与成绩防覆盖守卫**同一条检出→审查通路**（矩阵与 §八 已裁决：Canvas 手改成绩不自动采纳，CW 是评分权威），由教师裁决采纳与否。未链接学生的提交**不落 CW 行**，在核对 UI 计数提示（催办身份关联）。
- 方向铁律重申：CW 侧提交物永不写回 Canvas（无学生身份可用）。

### 3.10 测验（部分双向）

- **测验壳**：双向。`GET/POST/PATCH /api/quiz/v1/courses/:cid/quizzes(/:assignment_id)`（**键是 assignment_id**）；映射 title/instructions(MD↔HTML)/points/due/unlock/lock、`quiz_settings.has_time_limit+session_time_limit_in_seconds` ↔ timeLimitMinutes、`multiple_attempts` ↔ maxAttempts、shuffle。发布经背后 assignment 的 `assignment[published]`；壳背后的 assignment 即该测验分数的推分目标（§3.7 防双列规则，不另建承载列）。CW 的 lockdown/波次/passingScore 不出站（白名单外）。
- **变更检测（入站）**：New Quiz 壳与 items **不暴露可用时间戳**，GraphQL quizzesConnection 仅覆盖 Classic，编辑题目也不可假设会 bump 背后 assignment 的 `updated_at`（quiz LTI 服务独立）——Canvas 侧题目编辑对 delta 探测**完全不可见**。因此按"无时间戳资源"处理：每个已同步测验在每次 full_reconcile 中 `GET` 壳 + `GET` items 全量、对规范化题目集打指纹（+2×N_quiz 请求，已计入 §2.6 预算，测验多的课程预算随之线性增长）；active15m 轻探测不覆盖此流，Canvas 侧题目编辑在该档要等夜巡/手动对账（§五，同步设置页明示）。
- **题目**：QuestionItem CRUD 双向，题型映射：`single_choice/multiple_choice→choice`、`multi_choice→multi-answer`（AllOrNothing/PartialScore 按 CW 评分语义选）、`true_false→true-false`、`short_answer→rich-fill-blank`（exact/contains 多答案）。**CW 无 essay 题型**（`quiz_questions` 枚举仅 single_choice|multi_choice|multiple_choice|true_false|short_answer|case_analysis）——不设 essay 往返；Canvas 侧 essay 题入站无落点 → 该题跳过 + 审查行说明。**`case_analysis` 出站降级**为"案例文本内嵌题干的 essay"（此处 essay 指 Canvas 交互类型；一次性有损渲染，出站后该题标 `lossy_convert`、远端编辑不回拉合并，只提示）。复杂类型客户端生成 v4 UUID。入站：仅 QuestionItem 可读全量（含 `scoring_data` 正确答案）→ 可完整导入；遇 Stimulus/Bank 引用 → 该测验降级为"仅壳同步"+ 审查行说明。**歧义防御**：实测题库背书的测验 items 可能直接返回 `[]`——空数组在"空测验"与"题库测验"间不可区分，故 `items==[]` 且 `points_possible>0`（或已有提交）一律按疑似题库处理、降级仅壳 + 审查行；entry_type 检测的真实行为 P8 期间先在 beta 沙箱验证，不单独依赖。
- **结果**：Canvas 侧作答经 `POST .../reports`（`student_analysis`，json）→ Progress（复用 Gamma poll-with-lease）→ 拉取逐生逐题 → 已链接学生落 `quiz_attempts`/`quiz_answers`（标 imported 来源）；未链接学生的行解析后即弃、不落库（§七.7）。409（报告生成中）退避重试；注意最少提交量门槛可能导致小班报告不可得——降级为 submissions 分数级拉取。
- **默认产品姿态仍是 §八**：CW 为出题主场；整题推送是教师逐测验显式勾选的能力，不是默认镜像。

### 3.11 成绩与名册（沿 v2，不重设计）

- 成绩：v2 P3 管线原样（承载列、`update_grades`+Progress、outbox 记账防覆盖、post policy GraphQL、逐生披露审计）。v3 的两处衔接：其 outbox 并入泛化 `lms_outbox`；内容同步开启的作业/测验以镜像为推分目标（§3.7 防双列）。
- 名册：v2 §6–7 原样（引用快照、匹配阶梯、四桶核对、熔断）。

---

## 四、冲突处理与人工审查

### 4.1 审查队列 UX

课程 → Canvas → "同步审查"。队列按实体聚合（一个实体一张卡，不按字段轰炸），卡片结构：

- 头部：实体类型 + 标题 + `homeSystem` 徽章 + 冲突类型（字段冲突 / 远端已删 / 本地已删 / 有损转换 / 回声冻结）。
- 主体：**逐字段三列 diff**（base / CourseWise / Canvas），文本字段渲染 MD 并排视图 + 原文折叠；日期/数值高亮差异。
- 动作：**本地优先**（以 CW 值出站覆盖）/ **远端优先**（以 Canvas 值入站覆盖）/ **合并**（逐字段各选一侧，提交合成结果双向写）/ 跳过（保持分叉，实体停留 `conflict` 不再传播）。
- 裁决执行前**重验指纹**（v1 的 stale-plan 守卫）：裁决期间任一侧又动了 → 卡片作废重开，绝不按旧数据覆盖。
- 每次裁决 `recordAudit`（`canvas.sync.resolve`，metadata 含字段与选择）。

### 4.2 熔断阈值（按 run、按实体、按课程三层）

| 层 | 条件 | 动作 |
|---|---|---|
| run 级 | 远端全量列表较上次骤降 >30%；或单次 diff 产出删除类 tombstone >20% 已链接实体 | 中止本 run 写入，`failed` + 摘要"疑似 Canvas 侧异常（结课/权限/API 变更）" |
| run 级 | 单课程单 run 冲突行 >25 | 停止继续入队冲突，聚合为一条"批量分叉"卡，提示教师可能是误操作或时钟问题 |
| 实体级（**回声风暴闸**） | 同一实体 24h 内我方出站写入 >3 次且期间无教师本地编辑 | `syncState=frozen` + 审查行 `echo_freeze`；冻结实体双向都不动，人工解冻 |
| 课程级 | outbox `dead` 操作 >10 或 token 进入非 active 态 | 暂停该课程全部同步域，横幅告警（沿 v2 §3.2） |

---

## 五、同步调度

**为什么没有推送**：Live Events / Canvas Data 2 / webhook 全部需要管理员开通（Data Services LTI / dev key），本方案前提是零管理员；Course Audit Log 教师 token 401；activity stream 覆盖面残缺且丢项。**轮询是全部**，这不是偷懒是边界。

三档（`lms_course_links.pollTier`，教师逐课程设置）：

1. **manual（默认）**：只有"立即同步"按钮——触发 `full_reconcile` Workflow（全资源全量枚举 + diff + 出站冲刷；`remote_missing` 在此计算，增量 cursor 全部无视），202 + runId，UI 轮询进度（既有模式）。典型 12–35 请求，<1 分钟。
2. **nightly**：`0 4 * * *` cron 分支对该档课程逐教师**串行**跑 full_reconcile（与 v2 roster 夜刷同分支，共享 token 串行队列）。预算见 §2.6：每教师夜间 <150 请求。含消失检测。
3. **active15m（可选，教学高峰周用；隐含 nightly——选择此档自动叠加夜间全量对账）**：`*/15` cron 分支跑**轻探测**——1–N 次分页 GraphQL delta（assignments/pages/files/modules/discussions 的 `updatedAt`；模块经 GraphQL `Module.updatedAt`）+ 1–2 次 calendar/announcements 轻列 + 1 次 syllabus body 拉取哈希（无时间戳，探测覆盖不了）——发现脏才升级定向拉取；无脏周期 ≈5–6 请求/课程。**覆盖边界明示**：轻探测只捕捉编辑——Canvas 侧删除（§2.7）与已同步测验的题目编辑（§3.10）都要等夜巡/手动 full_reconcile 才被捕捉，同步设置页写明。成本文案：约 3,500–5,000 请求/教师/天，占其 token **专属**漏桶个位数百分比（限流按 token 分桶，与教师自己的浏览器会话及其他工具互不侵占——预算说明是透明度而非风险警示）；写入面事件（outbox 冲刷）随周期缩短而更频繁。开启入口放置明确的 token 预算说明。

出站 outbox 冲刷：随任一档的 run 执行 + 教师保存后 60 秒内的短延时冲刷（防抖聚合连续编辑，避免一次改十下推十次）。

---

## 六、分阶段实施计划

前提：v2 P0–P2 已上线（token、导入、名册/身份关联），P3（成绩回写）已上线或与 P4 并行。以下为 v3 增量：

| 阶段 | 范围 | 关键交付物 | 工作量 | 验收标准 |
|---|---|---|---|---|
| **P4 — 同步引擎地基** | 状态机、outbox 泛化、回声、审查队列、调度 | `lms_id_map` 扩列迁移 + `lms_outbox`/`lms_sync_cursors`/`lms_sync_conflicts`；`normalize.ts`（HTML 规范化 + MD↔HTML + 指纹）单测覆盖 verifier/data-api-*/host 剥离；`diff.ts` 三方合并纯函数；回声记账；读-比-写守卫；引擎写豁免 + 消费者无差异跳过（§2.5）；审查队列 API+UI；域开关与三档调度；dryRun 模式 | **4.5 周**（规范化往返稳定性与审查 UI 各占 ~1 周；如需压缩，审查队列 UI 可后移 P5） | 空转测试：无变更课程夜巡 100 次零写入零冲突零审计噪声；**回声测试：出站写→下周期轮询→零回拉零再推**；**pull 路径豁免测试：Canvas 侧编辑→拉取落库→下周期零出站**；副作用触碰（Canvas 侧 reorder）不触发内容拉取；dryRun 下 outbox 全部落 `pending` 不发出 |
| **P5 — 低风险内容域** | Syllabus、Pages、公告、日历 | 四域映射 + 各自变更检测（哈希 / sort=updated_at / 全列哈希 / all_events）；`lms_remote_events` 影子与日历渲染；受管日历事件重算-对账 | **2.5 周** | **双边往返测试**：两侧改不同字段→一周期收敛无损；两侧改同字段→恰好一条冲突行、裁决后收敛；MD→HTML→MD 二次循环指纹稳定（无退化螺旋）；公告 14 天窗口陷阱有回归测试；page 改标题后 id 寻址不断链；**删除时延回归：Canvas 删 page → `remote_missing` 出现在下一次 full_reconcile（而非 active15m 轻探测周期）** |
| **P6 — 文件域** | R2↔Canvas 字节 + 链接重写 | 3-step 上传（quota 预检、overwrite 后重解析 id）、下载（实时取 url、redirect 剥 auth）、文件夹 diff、body 内文件链接双向重写 | **2 周** | 500 文件课程全量双向 <10 分钟且零限流；覆盖上传后 id_map 正确指向新 id；下载路径零持久化 verifier URL；超 50MiB 文件降级为外链 + 审查行；配额耗尽转审查不炸 run |
| **P7 — 结构域** | 作业/作业组/模块/items/讨论主题双向 + 回帖镜像 | 白名单三方合并、镜像即推分目标（§3.7）、模块结构 diff（GraphQL `Module.updatedAt` 触发行为沙箱验证）、module items 映射、`lms_remote_posts` + 只读讨论视图、承载列排除回归 | **2.5 周** | 作业双边编辑收敛且 overrides/rules/迟交政策零幻影冲突；模块双侧重排→单条聚合冲突；**一个开启内容同步的 CW 作业 → Canvas 成绩册恰好一行可评分行（镜像即推分目标，零重复承载列）**；纯承载列在内容域枚举中零出现；回帖镜像含 tombstone 精确性测试 |
| **P8 — 测验与提交物** | 测验壳+QuestionItem 双向、student_analysis 拉取、Canvas 作业提交物拉取 | 题型映射矩阵 + UUID 生成（逐题型 interaction_data/scoring_data 载荷按"试错预期"留缓冲）、case_analysis 降级渲染、Stimulus/Bank 检测降级（含 `items==[]` 歧义处理）、逐测验壳+items 指纹流、reports Progress 轮询、submissions 游标拉取 + 附件入 R2 + score/feedback 检出→审查通路 | **3.5 周** | 5 种可映射题型出站→Canvas 作答→student_analysis 回拉逐题落库；含 Bank 的测验被正确降级为仅壳，**`items==[]`（空测验 vs 题库测验）歧义在沙箱验证并有降级回归**；Canvas 侧改题→下次 full_reconcile 检出；case_analysis 出站有损标记可见；提交物游标重叠窗口无重复无遗漏；**Canvas 侧改分→CW 行分数不被覆盖、出现审查行**；未链接学生提交与作答零落库 |

合计 v3 增量 **≈15 工程师周**（P4/P8 按往返稳定性与题型试错留了缓冲；对照 v2 更小读主导范围耗 4.5 周的先例，不再按 12.5 周乐观口径承诺）。每阶段独立可上线（域开关默认 off，未开启课程零行为变化）；每阶段验收在 `<school>.beta.instructure.com` 周刷沙箱全量过一遍后再上生产。

---

## 七、风险与降级路径

1. **Token 权限面扩大——写入面激增的政策与安全影响**。v2 的机构背书建立在"P0–P2 以读为主"的调用面清单上；v3 的出站面覆盖 pages/files/announcements/discussions/calendar/assignments/modules/quizzes 的 POST/PUT/DELETE——**背书文件必须重签**，附录更新为逐端点写入清单。安全语义变化：一个被攻破的 CourseWise 现在能改写教师全部课程的可见内容（钓鱼公告、恶意文件），不只是读。缓解：域开关默认全 off（教师逐域 opt-in 即知情同意的技术形态）；`delete_remote` 永远人工确认；dryRun 模式供首次开启观察一周期；出站操作全量审计；AES-GCM/零日志/最小暴露纪律沿 v2 §3.3 不变。**红线重申：永不 SaaS 化收集 token。**
2. **回声风暴**。同一教师身份写入不可归因 + 无 ETag + 轮询延迟窗口，是回声循环的完美温床（尤其 HTML 往返永不逐字节相等）。缓解已内建：规范化指纹（非原文比对）、`lastPushRemoteUpdatedAt` 记账、副作用触碰识别、引擎写豁免与无差异跳过（§2.5）、实体级 24h/3 次冻结闸、P4 验收把"零回声、pull 零出站"设为硬门槛。残余风险：Canvas 端渲染管线升级改变 HTML 重写规则 → 全量实体指纹齐变 → run 级熔断（骤变 >30% 兜底）+ 更新 `normalize.ts` 后重建 base。
3. **HTML 往返损耗**。MD↔HTML 双向转换对复杂构件必然有损；错误的设计是假装无损。本方案的立场：canonical 单侧化（CW=MD、影子保存远端 HTML 原文）、本地未动不重渲染、高损耗构件显式打 `lossy_convert` 审查行、`case_analysis` 一次性降级不回拉。产品文案对教师明说："在 Canvas 里用了复杂排版的页面，拉回 CourseWise 编辑可能丢样式——审查卡会告诉你。"
4. **限流与配额**。串行客户端 + §2.6 预算下漏桶事实免疫——且限流**按 token 分桶**，我方 personal token 有专属漏桶，教师本人的 Canvas 使用与其他工具不侵占它；真正的约束是 Workers 侧（step 载荷、subrequest 上限、CPU 时间）与双侧存储/文件配额。缓解：15 分钟档 opt-in + 预算文案（透明度而非风险警示）；`X-Rate-Limit-Remaining` 低水位（<150）时 run 内主动降速；大课程文件域分批跨 step。R2 与 Canvas quota 双侧预检。
5. **部分资源永远单向——产品沟通风险**。教师会默认"双向同步=什么都双向"，然后在"学生在 Canvas 交的作业为什么不能从 CW 退回 Canvas 批注"这类问题上感到被欺骗。缓解：可行性矩阵的用户版（图标化：⇄ / → / ← / ✕）常驻同步设置页顶部；每个单向域在 UI 上带方向徽章；§八清单进 FAQ。
6. **Canvas API 漂移**。verifier 废止（2026-06/07 执行中）、New Quizzes 原生化（2026-08 enforced，路径号称不变）、文档门户迁移、429/403 双态——全部已按最新研究内建；订阅 2026 API Change Log、beta 沙箱周回归（P4 起把往返测试挂 CI 定时任务）。**降级总路径**：任何域的检测/写入通路被 Canvas 收紧 → 该域退回 v2 语义（一次性导入 + CW 为真源），引擎按域关闸不影响其余域——v3 在架构上是 v2 的可拆卸外挂,这是刻意的。
7. **FERPA——v3 新增的学生记录入站面**。v2 刻意把学生教育记录的摄入压到最小；v3 新开三条入站流全是学生记录：① 讨论回帖镜像（`lms_remote_posts`：内容 + 姓名，含未链接学生）；② 提交物正文与附件（流入 R2，§3.9）；③ 逐生逐题测验作答（student_analysis 报告，§3.10）。处置沿 v2 §九.1 框架逐条落实：**定位**——school-official 内部使用，摄入的都是该教师在 Canvas 本就可见的本课程数据，CW 不扩大暴露面、不对外披露；**最小化**——student_analysis 载荷中未链接学生的行解析后即弃、不落库（与 §3.9 提交物规则一致）；回帖镜像因署名诚实性需保留 Canvas 姓名，是唯一涉及未链接学生的持久化，在背书文件中单列说明；**保留期**——`lms_remote_posts` 与拉取附件挂钩课程归档清理（复用 `r2_cleanup_jobs` 语义），解链/断开连接时随 v2 断开语义清除；**记账**——每次入站 run 写 `recordAudit`（`canvas.sync.ingest`：流、行数、courseLinkId），与 `canvas.import.run` 对齐。本清单并入风险 1 的背书重签附录。

---

## 八、明确不做与替代

| 不做 | 原因（API 级） | 诚实替代 |
|---|---|---|
| 以学生身份向 Canvas 写任何内容（提交物、回帖、作答） | masquerade 需 admin"Become other users"，教师 token 401；一切写入署名教师 | 学生产出单向 Canvas→CW 拉取；CW 侧学生工作流的对外出口只有分数（镜像/承载列） |
| 测验题库 / Stimulus / 随机抽题同步 | BankItem/BankEntry/StimulusItem API 只读，题库服务无公开管理 API | **CW 是出题主场**；可映射题型按教师勾选整题推送，其余测验推"壳 + 说明桩"（标题/日期/分值 + 指回 CW 的链接）；含题库（或疑似题库，`items==[]` 且有分值/提交）的 Canvas 测验降级仅壳同步 |
| `case_analysis` 的保真往返 | New Quizzes 无 API 可建共享题干 | 出站降级为内嵌案例文本的 essay（Canvas 交互类型），一次性、标记有损、不回拉合并 |
| 考勤同步 | Canvas 无考勤 API（Roll Call 无公开 API） | 考勤经 `weightAttendance` 加权进 final grade 承载列间接抵达；CSV 导出留给需要原始记录的场景 |
| 课程名/起止日期/term 写回 | 账户级设置常锁死教师写入，SIS-managed 课程尤甚 | 只读引用 + 差异提示 |
| Canvas 手改成绩自动采纳进 CW | CW 是评分权威（v2 已定）；自动采纳会让两个成绩真源互咬 | 防覆盖守卫检出 → 审查队列人工裁决（保留 CW 值重推 / 手工在 CW 录入 Canvas 值）；提交物拉取的 score/feedback 同走此通路（§3.9） |
| 名册驱动 CW 账号/报名变更 | v2 铁律 | 引用 + 徽章 + 邀请码催办，原样 |
| 公告评论、Conversations/私信、sections/terms 建模、assignment overrides、Classic Quiz 写入、Live Events/CD2/LTI | 分别为：低价值高 PII、同上、CW 无对应模型、无映射目标、事实弃用、需管理员 | 各自维持单侧原生；LTI 1.3 仍是"院校哪天愿意点安装"时的整体升级路径（NRPS+AGS 可整层替换名册与推分），表结构兼容性在 v2 §九.2 已论证 |
| 跨系统自动删除 | 远端软删不可见、UI undelete 可复活、误删爆炸半径不可逆 | tombstone + 人工确认，永远（§2.7） |

---

**一句话总纲**：v3 把"双向同步所有资料"落成一个诚实的分级承诺——教师创作的内容（syllabus、页面、公告、日历、文件、作业、模块、可映射的测验题）真双向，靠影子副本 + 规范化指纹 + 自建读-比-写守卫在无 ETag、无事件、无归因的 API 上硬做出收敛；学生产出的一切只进不出；考勤与题库根本不上桌。引擎的每一分复杂度（回声记账、引擎写豁免、三方合并、tombstone、熔断）都源自 Canvas 教师 token + 纯轮询这对约束的物理现实，而非架构洁癖。