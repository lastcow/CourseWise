# 课程数据导出内容（Course Export Contents）— 设计方案

> 本文用中文撰写。记录**已交付**的变更：PR [#342](https://github.com/lastcow/CourseWise/pull/342)（squash 合入 `ae59d8e`，2026-07-02）。导出功能本身（后台 Workflow + 流式 ZIP + R2 + 邮件链接）此前已存在，本次只重塑**导出内容**。2026-07-03 的二轮修订见文末。

## 目标（Goal）

把课程设置页的"导出课程数据"ZIP 从"逐项成绩流水"重塑为**课程档案**：

- 成绩只含每位学生的 **final grade**（分数 + 等级），**不含**逐个 assignment/quiz 的分数；
- 学生 submission 连同**附件**一并导出（如有）；
- 新增**教学大纲**（syllabus）、**教学日历**（calendar）与**考勤 CSV**。

## 背景（Why）

原导出的 `scores.csv` 是 long format：每个 assignment 提交、quiz attempt、discussion grade 各一行，末尾附 Final 行（旧 `services/courseExport.ts` 的 scores.csv 段）；`submission.json` / `attempt.json` / `answers.json` 也各自携带 score/maxScore/pointsAwarded。需求方（2026-07-02）明确：导出物是给存档/交接用的课程记录，逐项分数属于 gradebook 的职责，不应散落在档案里；而大纲、日历、考勤是课程记录的组成部分，此前缺失。

数据在库中均已存在，无需新表：

- 大纲：`courses.syllabusMd` + `courses.syllabusFileAssetId`（`apps/api/src/db/schema.ts:312`）；
- 日历：`courses.startDate/endDate/meetingSlotsJson/moduleCadence`（`schema.ts:284` 起）+ `modules` 表（`schema.ts:389`）；
- 考勤：`attendance_sessions`（`schema.ts:1140`）+ `attendance_records`（`schema.ts:1163`）;
- final grade：`final_grades` 缓存表（`schema.ts:1210`，含 `teacherOverrideScore`、`letterGrade`、`isOutdated`）。

## 决定的范围（Decided scope）

In：

- `scores.csv` → **`final_grades.csv`**：每条 enrollment 一行（按学生姓名排序），列 `Student, Email, Enrollment Status, Final Score, Letter Grade, Outdated`；分数取 `teacherOverrideScore ?? score`。
- **逐项分数全面移除**：`submission.json` / `attempt.json` 去掉 score/maxScore；`answers.json` 去掉 `pointsAwarded`；discussion 的 `grades/` 目录改为 `feedback/`（仅有文字评语时输出）。
- 新增 `syllabus.md`（`syllabusMd` 非空时）与 `syllabus/<上传文件>`（`syllabusFileAssetId` 存在时）。
- 新增 `calendar.json`：课程起止日期、每周上课时段（`meetingSlots`）、`moduleCadence`、全部 modules（标题/描述/状态/顺序/时间窗口）。
- 新增 `attendance.csv`：每条考勤记录一行，列 `Session, Session Date, Student, Email, Status, Notes, Recorded At`，按 session 日期 + 学生姓名排序。
- `README.txt` 内容清单同步；三语（en / zh-CN / fr）导出卡片文案同步。

Out：

- **不在导出时重算 final grade**（见"风险与权衡"——副作用问题）。
- 不导出 `attendance_records.ipAddress`（无存档价值，纯审计字段）。
- quiz 无文件上传题型（`quizQuestionTypeEnum`，`schema.ts:45`），无需处理 quiz 附件。
- 考勤不做学生 × session 的宽表矩阵（long format 便于透视，且与 `final_grades.csv` 风格一致）。
- 无 schema / 迁移 / API 路由 / 权限变更——内容层变更全部落在 gather 阶段。

## 架构（Architecture)

导出仍是两阶段（`apps/api/src/services/courseExport.ts` 顶部注释）：`gatherCourseExport`（纯 DB → 可序列化 manifest）+ `buildAndStoreZip`（流式 ZIP → R2 multipart）。本次全部变更都在 `gatherCourseExport` 内，manifest 结构（`ExportTextEntry` / `ExportFileEntry`）不变，Workflow（`workflows/courseExport.ts`）与路由（`routes/courseExports.ts`）零改动。

ZIP 结构（变更后）：

```
README.txt
syllabus.md                  ← courses.syllabusMd（可选）
syllabus/<上传文件>           ← courses.syllabusFileAssetId（可选）
calendar.json                ← courses 日程字段 + modules
final_grades.csv             ← enrollments ⟕ final_grades
attendance.csv               ← attendance_sessions × attendance_records
materials/NN-<title>/        （不变）
assignments/NN-<title>/
  requirement.md, metadata.json, attachment/
  submissions/<student>/
    submission.json          ← 去掉 score/maxScore（保留 status/feedback/时间戳）
    answer.txt
    files/                   ← fileAssetId + relatedType='submission' + group 共享文件（原有）
quizzes/NN-<title>/
  metadata.json, questions.json
  attempts/<student>[-attemptN]/
    attempt.json             ← 去掉 score/maxScore
    answers.json             ← 去掉 pointsAwarded（保留 answer/isCorrect）
discussions/NN-<title>/
  metadata.json, posts.json
  feedback/<student>.json    ← 原 grades/，仅含文字评语（去掉 score/maxScore）
```

关键决策：

- **final grade 读缓存、不重算。** `recalculateFinalGrades`（`services/finalGrade.ts:944`）会给整个 roster 覆写 `finalizedAt`/`finalizedById`——"点一次导出 = 成绩被定稿"是导出不应有的副作用。因此 gather 直接读 `final_grades` 表，并输出 `Outdated` 列（`isOutdated=true` 标 `yes`），README 里注明"成绩以 gradebook 最近一次重算为准"。
- **保留非分数的评价信息。** feedback（文字评语）、`isCorrect`（对错）、`gradedAt` 不属于"分数"，是学生记录的一部分，保留；`pointsAwarded`、score/maxScore 一律移除。
- **CSV 覆盖全部 enrollment**（含 dropped/completed，`Enrollment Status` 列注明），没有 final_grades 行的学生留空——比"只列有成绩的学生"更忠实于花名册。
- **附件本就完整**：submission 附件三个来源（`assignment_submissions.fileAssetId`、`relatedType='submission'` 的多附件、group 提交共享文件）原实现已覆盖，本次仅补测试断言。

### 前端 — `apps/web`

仅文案：`locales/{en,zh-CN,fr}.ts` 的 `course.export.description` 改为"教学大纲、教学日历、阅读材料、作业、测验与讨论（含每位学生的提交及附件）……并附最终成绩与考勤的 CSV（不含逐项分数）"。`CourseExportSection`（`pages/teacher/TeacherCourseSettings.tsx`）无改动。

## 里程碑

一次性交付（PR #342）：改动面集中在单文件的 gather 阶段 + 文案 + 测试，无迁移、无 API 面变化，不值得拆分。

## 测试（Testing）

- `routes/courseExports.integration.test.ts`（`skipIf(!DATABASE_URL)`）：seed 扩为大纲文本、课程起止日期、一个 module、submission 附件（`file_assets` ready 行）、`final_grades` 行（91.50 / A-）、考勤 session + present 记录。断言：
  - `final_grades.csv` 含 91.5 / A- / 学生邮箱，**不含**逐项的 88 分；
  - `submission.json` 无 `"score"` 字段但保留 feedback；
  - 附件出现在 `submissions/<student>/files/lab1-report.pdf`；
  - `syllabus.md` / `calendar.json`（含课程日期与 module 标题）/ `attendance.csv`（session、学生、present）齐全。
- 远程 Neon 往返变多：`beforeEach` 超时提到 30s、gather 用例超时 30s（默认 10s/5s 已不够）。
- 全量：API 368 通过；`api` + `web` typecheck 干净。

## 风险与权衡（Risks and trade-offs）

| 风险 | 对策 |
|---|---|
| 缓存的 final grade 可能过期（教师改分后未重算） | 不静默：CSV 加 `Outdated` 列 + README 注明以 gradebook 最近一次重算为准；坚决不在导出中重算（副作用见上） |
| 逐项分数彻底移出档案，事后无法从 ZIP 重建 gradebook | 有意为之：gradebook（及其 API）仍是逐项分数的唯一来源；导出定位是课程档案而非数据备份 |
| `attendance.csv` 在无考勤课程中是只有表头的空文件 | 接受：产物结构可预期（消费方无需判断文件是否存在），README 已描述 |
| 旧导出（scores.csv 版本）与新导出并存于 72h TTL 窗口内 | 无需处理：导出为一次性产物，TTL（`COURSE_EXPORT_TTL_HOURS = 72`）自然淘汰 |
| 考勤 `notes` 可能含敏感备注（如病假原因） | 保留：属教师可见的教育记录，与导出的 FERPA 定位一致；`ipAddress` 则排除 |

## 修订（2026-07-03）

需求方反馈后的二轮调整（同在 `services/courseExport.ts` 的 gather 阶段，无 schema/API 变更）：

- **`attendance.csv` 改为宽表矩阵**：每位在册学生一行，列 `Student, Student ID, <Session 标题 (日期)> × N`（session 按日期排序），单元格为出勤状态，未记录留空。原 long format（每条记录一行）废弃。
- **`final_grades.csv` 增加 `Student ID` 列**：学号取自 `student_profiles.studentNumber`（1:1 关联 users，left join 解析）。
- **修复：submission 文件夹中文名**。`sanitize()` 原先把非 ASCII 全部替换为 `_`，中文学生名在路径中变成下划线；改为保留任意 Unicode 字母/数字（`/[^\p{L}\p{N}._ -]+/gu`）。fflate 对非 ASCII 条目名自动置 zip UTF-8/EFS 标志位，无需额外处理。
- **修复：组作业文件缺失**。应用内组提交的附件"单元"是**全组成员行的并集**（`routes/assignments.ts` 的 `attachmentsForUnit`），文件上传时挂在上传者自己的行上；导出原先只收本人行的文件，队友上传的共享文件在其他成员文件夹中缺失。现按 `groupSubmissionId` 并集所有兄弟行的关联文件（同文件夹内按 objectKey 去重）。
- **`assignments/.../submission.md`**（替代 answer.txt）：题目要求 + 学生答案（组作业取共享内容）+ 老师批阅，一份人类可读的记录。
- **`quizzes/.../answers.md`**（json 保留）：逐题渲染题干、选项、学生答案（选择题按下标映射回选项文本，见 `services/quizGrading.ts` 的答案格式）、对错/待批、每题的老师批阅（`quiz_answers.feedback`）。
- **`materials/presentations/`**：导出每个 presentation（PPT deck）的 metadata（含所属 module）+ 文件。deck 由 Gamma 轮询器镜像进 R2（`services/gamma/poll.ts`），`originalFilename` 是不透明的 `<jobId>.pptx`，故 zip 条目按 presentation 标题命名（保留原扩展名）；仅有 `externalUrl` 的写 `external_url.txt`。
- **按需下载缺失的 deck（mirror-decks 步骤）**：存量 deck 很多 `fileAssetId` 为空（生成时 R2 镜像失败，或早于镜像逻辑上线），R2 里没有文件、只剩会过期的 Gamma 链接，导出里就没有 PPT。新增 `services/gamma/mirrorDecks.ts` 的 `mirrorMissingDeckFiles`：对课程内所有无文件的 presentation，先用 `gamma_generation_jobs.exportUrl` 下载，链接失效则凭 `gammaGenerationId` 向 Gamma API 换新链接再下载，流式写入 R2 并补 `file_assets` 行、回填 `presentations.fileAssetId`——与 poll 完成时的镜像同构，属**永久修复**（应用内 modules 页的下载按钮同时恢复）。`CourseExportWorkflow` 在 build 之前加 `mirror-decks` 步骤调用它，逐个 deck best-effort（下载失败记日志跳过，绝不阻塞导出）。

测试：集成测试 seed 扩为双学生、学号 profile、组作业（共享文件挂单个成员行）、quiz 全链（题目/attempt/批阅答案）、presentation deck；断言矩阵表头/学号列/两个成员文件夹都有共享文件/answers.md 渲染/deck 路径。seed 往返增多，hook 超时提至 60s。
