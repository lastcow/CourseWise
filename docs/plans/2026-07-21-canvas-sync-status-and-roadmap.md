> 本文档由 2026-07-21 的代码考古 + Canvas API 联网核实产出。对照对象：[v2 import-first 设计](2026-07-04-canvas-sync-v2-import-first-design.md)（已定稿）与 [v3 双向同步设计](2026-07-04-canvas-sync-v3-bidirectional-design.md)（设计稿）。本文不重复 v2/v3 的设计内容，只记录：**代码实际进度、API 假设的核实结果、对 v3 的修订项、以及下一步路线图**。

# Canvas 同步：实现现状与路线图（2026-07-21）

> 状态：现状快照 + 路线提案。API 核实结论带来源链接；代码引用以本日 `main`（bfc17ae）为准。

---

## 一、结论速览

- 代码实际进度 = **v2 P0 + P1 + 一个越出 v2 边界的单向结构推送**（#353）。P2（身份关联）、P3（成绩回写）、v3 全部引擎（outbox/cursor/conflicts/normalize/diff/echo）均未实现。
- Canvas API 的物理边界经核实**没有松动**：教师 token + 纯轮询仍是唯一通路。v3 的架构选型（影子副本 + 规范化指纹 + 自建读-比-写守卫）依然正确。
- 但 v3 有**一处地基假设被推翻**（GraphQL `Module.updatedAt` 不存在）、两处外部时间线需要吸收（verifier 免认证下载已关闭、New Quizzes 原生化 2026-08-15 enforcement）。见 §四修订清单。
- 建议路径：**阶段 0 推送加固（~3–5 天）→ P2 身份关联（~2 周）→ P3 成绩回写（决策门）→ v3 P4–P8（大决策门 + 修订后执行）**。

---

## 二、代码实况盘点（2026-07-21）

### 2.1 已实现的三块

| 块 | 落位 | 要点 |
|---|---|---|
| **Token 连接（P0）** | `routes/canvas.ts`、`services/lms/canvas/tokens.ts` | 粘贴 token → `GET /users/self` 验证 → AES-GCM 存 `lms_connections`（secret `CANVAS_TOKEN_ENC_KEY`，只留末 4 位）；401 body 三分类（expired/revoked/invalid）精确落 status；`withCanvas` 包装器 401→409 引导重连（不登出用户）；断连 best-effort 远端吊销（token_hint 唯一匹配才删）、保留 link/id_map 供重连幂等 |
| **结构导入（P1）** | `services/lms/canvas/importCourse.ts` | 一次性、add-only、全部落 draft。范围：课程元数据（**只填空字段**，非空记 keptLocal 永不覆盖）、assignment_groups（weight 取整并披露）、module **壳**（items 有意不导）、assignments（quiz 判定→空壳 stub + 提示文案）。**零学生数据**：`snapshotRoster()`（importCourse.ts:349-418）实现完整但被 f6ef554 摘出流程，**当前为 dead code、无任何调用方**。幂等 = `lms_id_map` externalId 存在性 skip + `db.batch` 原子写 |
| **单向推送（#353，v3 先行子集）** | `services/lms/canvas/pushCourse.ts` | 显式按钮推 CW-native modules + module 内 assignments + module items（`submission_types: ['none']` 排期镜像 + "Submit in CourseWise" HTML 注记）。方向防回环 = `lms_id_map.origin`：'import' 行永不回推；'re-push 时 CourseWise wins 直接覆写（confirm 弹窗声明） |

Workflow（`workflows/lmsSync.ts`）：kind 只有 `initial_import | structure_push`；mark-running → 单 step 内完成全部 fetch+DB 写（payload 不跨 step）→ finalize；CanvasAuthError 短路防 retry 烧 token。**无任何 cron/后台调度**，所有 run 都是教师显式触发（202+runId，前端 4s 轮询）。

CanvasClient（`services/lms/canvas/client.ts`）：约定式严格串行、`per_page=100` 只跟 Link rel="next"、429/403-RateLimit 退避 3 次、强制 UA `CourseWise/1.0 (+https://fsuac.com)`、错误 redact query string。当前调用的端点面仅 11 个（users/self、tokens、courses 列表/详情、assignment_groups、assignments、modules、sections、users?student、modules/assignments/module_items 的 POST/PUT）——**pages/files/discussions/announcements/quizzes 连端点封装都没有**。

### 2.2 表结构现状

存在 5 张（迁移 0050–0053）：`lms_connections`、`lms_course_links`、`lms_roster_entries`（0051 已清空数据，休眠待 P2）、`lms_id_map`、`lms_sync_runs`。

不存在（grep 全仓零命中）：`lms_grade_outbox`、`lms_outbox`、`lms_sync_cursors`、`lms_sync_conflicts`、`lms_remote_events`、`lms_remote_posts`。`lms_course_links` 无 syncDomains/pollTier/dryRun 列。

Schema-only 预留（零代码使用）：`lms_sync_run_kind` 的 `roster_refresh`/`grade_export`、`lms_id_map` 的 `student_link`/`pushed_assignment_column`/`final_grade_column` localType、`match_method` 枚举、`confirmedBy*`、`rosterRefreshEnabled/Until`。**`lastSyncedFingerprint` 只写不读**（import 写、push 不写、全仓无比较逻辑）——schema 注释宣称的"跳过未变行"未实现。

### 2.3 前端现状

- Settings → Integrations（`SettingsIntegrationsPage.tsx`）：token 录入/断连/重连 + "导入为新课程"。
- 每课 `/teacher/courses/:id/canvas`（`TeacherCanvasSyncPage.tsx`）：链接（含课程代码自动匹配建议）→ 导入 → 推送 → run 历史（状态/汇总/失败文本）。
- **不存在**：冲突审查 UI、dry-run/变更预览、域开关、选择性推送、run 重试按钮、成绩回写 UI、名册/身份关联 UI（文案已承诺 "matched to the roster later"，属未兑现暗示）。

### 2.4 现有推送的已知隐患（阶段 0 的靶子）

1. **无读-比-写守卫、无回声记账**：不记录 Canvas 响应的 `updated_at`/指纹，无法事后判断 Canvas 侧是否被人改过；重推盲覆写。单向语义下勉强成立，双向前必须补。
2. **Canvas 侧删除 → run 炸掉**：已推对象被删后 PUT 404 → ApiException → step retry 1 次后 run failed，`lms_id_map` 残留悬空映射，无恢复代码。
3. **create 非幂等**：create 调用与 id_map 写入不在同一原子批次，step retry 理论上可在 Canvas 双建对象（import 侧有 `db.batch` 兜底，push 侧没有）。
4. **module item create-once**：assignment 换模块/改位置后 re-push 不更新 Canvas 侧 item。
5. 并发守卫 `assertNoRunInProgress` 是 check-then-insert，理论可双启 run（低风险，记录在案）。

---

## 三、Canvas API 核实（2026-07-21，联网调研）

### 3.1 证实不变（v2/v3 假设成立）

| 事实 | 来源 |
|---|---|
| 限流 = per-token 漏桶，源码默认 hwm 600 / max 800 / 漏出 10/s / 在途预扣 50；`X-Rate-Limit-Remaining`/`X-Request-Cost` 头在；**按 access token 分桶**（官方原文确认）。串行客户端事实免疫 | [throttling 文档](https://developerdocs.instructure.com/services/canvas/basics/file.throttling)、[request_throttle.rb](https://github.com/instructure/canvas-lms/blob/master/app/middleware/request_throttle.rb) |
| Live Events / Canvas Data 2 仍 **admin-only**，教师无入口；REST 无 ETag/条件请求（源码 `fresh_when` 零命中）——**轮询是教师侧唯一变更检测手段** | [Live Events 订阅](https://community.instructure.com/en/kb/articles/661441)、[CD2 key 生成](https://community.instructure.com/en/kb/articles/661445) |
| masquerade（`as_user_id`）仍需账户级 "Become other users" 权限——**学生署名写入永不可能**，v3 方向铁律不变 | [masquerading 文档](https://developerdocs.instructure.com/services/canvas/basics/file.masquerading) |
| New Quizzes：QuestionItem 全 CRUD；Bank/BankEntry/Stimulus **仍只读**（"must be created and updated via the UI"） | [new_quiz_items 文档](https://developerdocs.instructure.com/services/canvas/resources/new_quiz_items) |
| Pages `sort=updated_at` 增量列表可用；Files 双时间戳（`updated_at`+`modified_at`）在——但 `modified_at`=内容变更的语义**仅社区共识、官方未成文，使用前实测** | [pages](https://developerdocs.instructure.com/services/canvas/resources/pages)、[files](https://developerdocs.instructure.com/services/canvas/resources/files) |

### 3.2 三处变化（需吸收进设计）

1. **GraphQL `Module.updatedAt` 不存在**。查 canvas-lms master [`module_type.rb`](https://github.com/instructure/canvas-lms/blob/master/app/graphql/types/module_type.rb)：字段只有 name/unlock_at/position/published/module_items 等，无任何 updated 字段。v3 §2.6/§3.7/§五把它当作模块 delta 探测的触发信号（原文已注明"沙箱验证其覆盖面"）——**核实结果：此路不通**。
2. **文件 verifier 免认证下载已关闭**。"Removal of Unauthenticated File Access" 经多次推迟后于 **2026-06-17** 前后强制执行；Files API 的 "Reset link verifier" 端点标注 **[DEPRECATED] effective 2026-07-07**（"The UUID-based verification method for file access is being deprecated"）。背景是 2026 年 Canvas 数据泄露事件推动的安全收紧。**文件域必须按"带 Authorization 下载 + 302 跟随时剥 Authorization"设计，任何持久化下载 URL 都已失效。**（来源：[Files API](https://developerdocs.instructure.com/services/canvas/resources/files)、[2026-05-16 release notes](https://community.instructure.com/en/discussion/665887)；enforcement 具体日期来自搜索摘要，中等置信度，建议人工复核 release notes 原文）
3. **New Quizzes Native Integration enforcement 2026-08-15**。性质澄清：不是 Classic→New 强制迁移，而是把 New Quizzes 从独立 LTI 原生化进 Canvas 主应用（2026-03-26 GA → 07-01 默认开启 → **08-15 enforcement**）。无 `/api/quiz/v1` 路径变更的官方声明，但数据层合并是中期风险——**测验域动工前后必须在 beta 沙箱回归**。（来源：[Native Integration 公告](https://community.instructure.com/en/discussion/665555)）

### 3.3 生存性风险（接入模式层面）

Personal access token 政策 2025-09/10 起大幅收紧：purpose 必填；纯学生角色 token ≤120 天；**机构 admin 可一键禁止全部非管理员创建 token**。（来源：[产品博客](https://community.instructure.com/t5/The-Product-Blog/Strengthening-Security-in-Canvas-Updates-to-User-Access-Token/ba-p/660299)）目标院校目前实测可用（v2 P0 验收已过），但这是整个"教师手工 token"模式头顶的开关——若翻转，唯一出路是 OAuth2 developer key（同样需 admin 审批，v2 §九.2 已论证表结构兼容）。持续订阅 release notes 跟踪。

---

## 四、对 v3 设计的修订清单

1. **§2.6 / §3.7 / §五：删除对 GraphQL `Module.updatedAt` 的依赖**。模块变更检测一律全量 `GET /courses/:id/modules?include[]=items` + 结构 diff（v3 已有此 fallback 语义，现升级为唯一路径）；GraphQL 批量 delta 探测中移除 modules 流，重算请求预算（影响 ~1 请求/课程/周期，可忽略）；active15m 轻探测的覆盖边界说明加一条"模块结构变更要等夜巡/手动对账"。
2. **§3.5 / P6 文件域**：按 verifier 已关闭的现实执行——下载实时取 File JSON `url` 并带 Authorization、302 跟随剥 auth 的既有设计保持；删去所有"verifier 正在废止期"的过渡措辞，`normalize.ts` 剥 `verifier=` 的规则保留（存量 HTML 中仍有残迹）。
3. **§3.10 / P8 测验域**：排期避开 2026-08-15 前后两周；enforcement 落地后先跑一轮 `/api/quiz/v1` 全端点沙箱回归再动工。
4. **§六工作量**：P4 起点比 v3 假设略好——阶段 0（见 §五）会预先埋好 push 侧指纹/回声记账地基。

---

## 五、路线图

### 阶段 0 — 推送加固（~3–5 天，立即可做，不依赖任何决策）

对准 §2.4 的隐患：
1. push create 幂等：create 前按 name+`data-coursewise-id` 标记探测 / create 后立即同批落 id_map；
2. PUT 404 容错：不炸 run，映射标记 remote_missing、进 summary，教师选"重建/解链"；
3. module item 支持归属/位置更新（废除 create-once）；
4. **push 路径开始记账**：写 `lastSyncedFingerprint` + Canvas 响应 `updated_at`——这就是 v3 §2.3 回声记账的地基；顺手实现重推前"Canvas 侧被改过"的检出警告（读-比-写守卫最小版）。

### 阶段 1 — v2 P2：名册引用与身份关联（~2 周，建议下一个做）

v2 §6 已定稿，照做：激活 `snapshotRoster()` 为显式动作 + 夜间 cron 分支；`match.ts` 匹配阶梯（学号/email/login 精确等值只出建议、姓名只排序、**无确认不成链**）；四桶核对 UI；unlink 事务；>30% 骤降熔断；逐学生披露审计。这是"学生相关一切同步"（成绩回写、提交物拉取）的前置，也是前端文案已向用户承诺的未兑现项。

### 阶段 2 — v2 P3：成绩回写（~2 周）

**决策门：院校是否保留 Canvas 为官方成绩簿。** 是 → 按 v2 §7.2 执行（`lms_grade_outbox`、承载列 `published=true` 显式设置、`update_grades`+Progress、防覆盖守卫比对我方 outbox 记账、回声导入三重排除）。否 → 跳过或后置。

### 阶段 3 — v3 P4–P8：双向引擎（~15 周）

**三道决策门，全过才动工**：
1. **教师真实需求**：他们是否真的在两侧都编辑？若 CW 已是唯一编辑场，v3 的复杂度（回声/三方合并/审查队列）不值得，v2 语义 + 单向推送已够。
2. **机构背书重签**：写入面从"以读为主"扩到全内容域 POST/PUT/DELETE（v3 §七.1 定为硬前提）。
3. **token 政策风险评估**：院校 admin 禁 token 开关的翻转概率；必要时先备 OAuth developer key 路径。

过门后按 v3 §六顺序执行（P4 引擎地基 → P5 低风险内容域 → P6 文件 → P7 结构域 → P8 测验与提交物），叠加 §四修订。P4 验收硬门槛不变：零回声、pull 零出站、副作用触碰不触发拉取。

---

## 六、风险重排（相对 v3 §七的增量）

- **最大工程风险仍是回声风暴**（同一教师身份写入不可归因 + HTML 往返永不逐字节相等 + 轮询窗口）——阶段 0 提前埋记账正是为此。
- **最大产品风险是"双向"语义落差**（学生产出永远单向、题库推不出去、考勤无 API）——可行性矩阵用户版常驻同步设置页，v3 §七.5 不变。
- **新增：外部时间线风险**——2026-08-15 New Quizzes enforcement、verifier 关闭余波、token 政策继续收紧。应对：beta 沙箱周回归（P4 起挂 CI 定时）、订阅 release notes / API Change Log。
- **本文核实的置信度边界**：Instructure 社区页面为 JS 渲染，release notes/change log 无法逐条抓取原文；verifier enforcement 具体日期、File `modified_at` 语义、限流数值（源码默认值 ≠ 云端实际配置）均建议在真实实例实测确认。

---

**一句话总纲**：代码停在"入驻坡道 + 排期镜像"，闭环缺口是身份关联（P2）；双向同步的物理边界经核实未变、v3 架构依然成立，但先修三处假设、过三道决策门，再谈 15 周的引擎。
