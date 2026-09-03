<div align="center">

# Project Folder Kanban

**本地项目记忆体** — 让散落的文件夹自己变成带 AI 记忆的项目库

![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-5-000000?logo=fastify&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-local-003b57?logo=sqlite&logoColor=white)

[在线演示](#在线演示) · [快速开始](#快速开始) · [核心功能](#核心功能) · [配置](#配置) · [架构与参考](#架构与参考)

</div>

---

## 这是什么

你在本地文件夹里正常干活，它在后台盯着文件变化：自动归档版本、生成 AI 总结、算出每个项目是活跃还是停滞，把项目的「前世今生」留在本机。

**数据不出本机 · 无需部署 · 单机单用户。** 这不是多人协作 SaaS。需要给别人看时有两条零运维路径：生成本地**分享链接**，或**导出 Markdown**（含快照，可离线传阅）。

---

## 在线演示

不想装环境、也暂时没有使用场景？直接双击打开 [demo.html](demo.html) —— 单文件、零依赖、纯前端，用一套虚拟数据完整复刻了真实界面。

首次打开会自动进入**功能导览**（11 步，可自动播放、也可用 ← → 翻页）。导览之外的操作都是真的能点的：拖文件归档（同名自动 `_v1`）、AI 智能分类、看板里结束/恢复项目、消息中心转成项目动态、生成周报并推送、AI 对话流式回答。改动存在浏览器 localStorage 里，右上角「重置演示」可一键还原。

> 演示不读写任何本地文件，也不发出任何网络请求，页面里的密钥全是假的占位符。


---

## 快速开始

```bash
npm install                      # 前端依赖
npm install --prefix server      # 后端依赖
npm run dev                      # 前端 :5173 + 后端 :3001
```

打开 http://localhost:5173 即可。后端健康检查在 `/api/health`。

> 只跑一端：`npm run dev:client` / `npm run dev:server`

**首次上手四步**

1. **设置** → 添加一个「来源文件夹」（待扫描）和一个「目标文件夹」（归档落地）
2. **工作台** → 点来源文件夹的「扫描」，文件进入左侧扫描池
3. 右侧「整理区」新建项目，拖文件过去完成归档 — 同名文件自动生成 `_v1` / `_v2`
4. **设置 → AI** → 填 Provider 地址 / Key / 模型，「测试连接」通过后，扫描会自动产出 AI 总结

第 4 步是可选的，不配 AI 时扫描、归档、看板、版本时间线都照常工作。

---

## 核心功能

**扫描与归档**
定时或手动扫描来源文件夹，用 SHA256 checksum 比对出新增 / 修改 / 删除 / 恢复。单个文件读取失败会被隔离，不影响整轮扫描。除纯文本外，`.docx` 经 mammoth、`.xlsx` 经 SheetJS 提取文本，同样能参与 AI 总结。

**版本时间线**
每次变更和恢复都留痕，可预览任意历史版本内容并一键恢复。同名文件默认归入同一版本组（checksum 精确匹配优先，文件名兜底），组关系也支持手动**合并 / 拆分**——重命名或另存导致的断链可以人工修回来。

**AI 三维度总结**
每个新版本产出三段总结：**变更了什么 / 内容讲了什么 / 对项目进度的影响**。经 `p-queue` 异步排队执行，不阻塞扫描。

**项目看板**
多级项目树，每个项目自动算出健康度 —— `active` / `needs_review` / `stalled` / `completed`，阈值可在设置里调。支持搜索、按健康度筛选、手写动态、结束项目（含子项目）与恢复。

**智能分类**
一键让 AI 判断扫描池里每个文件该归入哪个项目，流式返回建议，逐条确认。每个文件保留建议历史。

**AI 对话**
基于当前项目与文件上下文的多轮对话，流式输出，回答附带来源 `file_id` 可溯源。会话按 session 持久化。

**消息中心**
系统自动生成项目提醒（如长期无活动），可标记已读、稍后提醒、一键转成项目动态或直接归档项目。

**报告与推送**
按时间范围 + 来源文件夹聚合扫描与整理数据，生成 Markdown 周报 / 日报（可选 AI 撰写整体总结）。在线预览、复制、导出，或[一键写入飞书云文档](#飞书云文档推送可选)。报告模版可自定义，也支持上传本地文件当模版。

**对外分享**
为项目生成带 token 的公开链接，勾选要展示的文件、设置过期时间、随时重置 token。访客免登录查看项目概览与文件列表。

---

## 配置

### AI Provider

设置页支持两类实现：

| Provider | 说明 |
|---|---|
| `ollama` | 本地模型，走 Ollama 原生接口 |
| `openai` / `xinghe` / `custom` | 统一按 OpenAI 兼容协议处理，`base_url` 会自动补全 `/v1/chat/completions` |

发给模型的文件内容默认截断在 **50KB**（`MAX_CONTENT_BYTES`）。

### 飞书云文档推送（可选）

把生成的报告一键写入你的飞书云文档（DocX），靠飞书自身的共享权限同步给协作者。文档可**固定复用、覆盖更新**，不用反复发新链接。

<details>
<summary><b>展开配置步骤</b></summary>

**1. 在飞书开放平台创建自建应用**

登录 [飞书开放平台](https://open.feishu.cn) → 开发者后台 → 创建**企业自建应用**，在「凭证与基础信息」拿到 App ID 与 App Secret，然后在「权限管理」开通：

- `auth:tenant.access.token` — 获取应用访问令牌
- `docx:document` — 文档内容读写
- `drive:drive` — 新建文档时授权 owner

发布版本并申请审批（企业内自建应用通常管理员一键通过）。

**2. 在「设置 → 飞书云文档推送」填写**

| 字段 | 说明 |
|---|---|
| App ID / App Secret | 必填，否则无法换取令牌 |
| 目标文档 ID | 留空 → 首次推送自动新建「项目进展报告」并记住 ID；填写 → 始终覆盖该文档。ID 即 URL `https://www.feishu.cn/docx/<document_id>` 中的那段 |
| Owner Open ID | 可选。新建文档时把编辑权限授予这位用户，便于协作 |
| Base URL | 默认 `https://open.feishu.cn`，私有化部署可改 |
| 启用 | 关闭时报告页会提示先配置 |

点「测试连接」会真实请求飞书换取 `tenant_access_token`，成功即凭证有效。

**3. 推送**

报告页选好日期范围与文件夹 → 生成 → 点「⬆ 推送到飞书」。后端会换取令牌、必要时新建文档并持久化 ID、把 Markdown 转成 DocX 块（标题 / 段落 / 列表 / 代码 / 表格 / 粗斜体）、清空原文档后分批写入（每批 50 块），最后返回可点击的文档 URL。

</details>

---

## 架构与参考

```
Browser (React 19 + Vite)
└── /api 反向代理 → localhost:3001
                      │
Local Backend (Fastify 5 + TypeScript)
├── routes/     folders files versions projects templates messages
│               chat share reports ai ai-settings app-settings feishu
├── services/   scanner · archiver · aiSummary · versionGroups
│               scheduler · projectActivity · feishu
├── ai/         factory · openaiCompat · ollama
├── db/         client (better-sqlite3 单例, WAL) · migrations
└── utils/      checksum · fileReader · logger (pino)
                      │
                SQLite (server/data/kanban.db)
```

<details>
<summary><b>技术选型</b></summary>

| 层 | 选型 |
|---|---|
| 前端 | React 19 · Vite 6 · TypeScript；`@tanstack/react-query`（服务端状态）、`zustand`（纯 UI 态）、`@dnd-kit`（拖拽）、`axios` |
| 后端 | Fastify 5 · TypeScript（`tsx watch` 热重载）；`better-sqlite3`、`p-queue`、`pino`、`node-schedule`、`@fastify/multipart` |
| 文档解析 | `mammoth`（.docx）、`xlsx`（.xlsx） |

</details>

<details>
<summary><b>目录结构</b></summary>

```
project_management-main/
├── index.html · vite.config.ts · tsconfig.json   # 前端配置 + /api 代理
├── server/                                       # Fastify 后端
│   ├── src/index.ts                              # 启动：迁移 → 注册路由 → 调度
│   ├── config.ts                                 # 端口 / 排除目录 / 文本扩展名 / 上限
│   ├── db/         client.ts · migrations.ts     # SQLite 单例 + 幂等迁移
│   ├── services/   scanner · archiver · aiSummary · versionGroups
│   │                scheduler · projectActivity · feishu
│   ├── ai/         factory · ollama · openaiCompat · types
│   ├── routes/     13 个模块
│   └── utils/      checksum · fileReader · logger
├── src/                                          # React 前端
│   ├── App.tsx                                   # 路由
│   ├── store/kanbanStore.ts                      # zustand：仅 UI 态
│   ├── hooks/                                    # react-query 封装
│   ├── api/                                      # axios + 各资源 client
│   ├── pages/      Workspace Kanban FileDetail ProjectDetail
│   │                Chat Messages Reports Settings Share
│   ├── components/  Layout · MarkdownView · SuggestionDrawer · TemplateManager
│   └── types/index.ts
└── ui-concepts/                                  # 视觉方案原型（独立 HTML）
```

</details>

<details>
<summary><b>数据模型</b></summary>

`folders` 来源/目标目录 · `files` 扫描到的文件（含看板状态、版本数、`mtime`/`size` 快筛）· `versions` 版本归档与 AI 总结 · `scans` 扫描记录 · `projects` 项目树（层级路径）· `file_assignments` 文件→项目归档 · `project_events` 项目动态与活动度量 · `project_summaries` 扫描级总结 · `report_templates` · `messages` · `chat_sessions` / `chat_messages` · `project_shares` / `project_share_files` · `app_settings` / `ai_settings` / `feishu_settings`

完整结构与全部 22 版迁移见 [server/src/db/migrations.ts](server/src/db/migrations.ts)。

</details>

<details>
<summary><b>API 概览</b></summary>

统一前缀 `/api`，全部查询使用参数化 SQL。完整定义见 [server/src/routes/](server/src/routes/)。

**文件夹** `GET|POST /folders` · `PATCH|DELETE /folders/:id` · `POST /folders/:id/scan`

**文件** `GET /files` · `GET /files/:id` · `PATCH /files/:id/status` · `PATCH /files/:id/remark` · `POST /files/:id/ignore` · `POST /files/:id/restore` · `GET /files/:id/suggestion-history` · `GET /scans`

**版本** `GET /files/:id/versions` · `GET /files/:id/version-group/candidates` · `POST /files/:id/version-group/merge` · `POST /files/:id/version-group/split` · `GET /versions/:id/content` · `POST /versions/:id/restore`

**项目** `GET /projects` · `GET|POST /projects/:id` · `PATCH|DELETE /projects/:id` · `…/assignments` · `…/assign` · `…/finalize` · `…/archive` · `…/unarchive` · `…/complete` · `…/restore` · `…/events` · `…/export.md`

**AI** `GET|POST /ai-settings` · `POST /ai-settings/test` · `POST /ai/suggest-assignments`（流式）· `POST /ai/analyze-health`

**对话** `GET|POST /chat/sessions` · `DELETE /chat/sessions/:id` · `GET /chat/sessions/:id/messages` · `POST /chat/sessions/:id/stream`（SSE）

**消息** `GET /messages` · `GET /messages/unread-count` · `GET /messages/snoozed-count` · `POST /messages/:id/{read,dismiss,archive-project,add-event,remind}`

**模版** `GET|POST /templates` · `POST /templates/import`（multipart，≤20MB）· `PATCH|DELETE /templates/:id` · `POST /templates/:id/set-default`

**分享** `GET|PUT /projects/:id/share` · `POST /projects/:id/share/reset-token` · `GET /share/:token`（公开）

**报告** `POST /reports/generate`

**飞书** `GET|POST /feishu-settings` · `POST /feishu-settings/test` · `POST /feishu/push-report`

</details>

---

## 安全说明

设计前提是**本地运行、本地数据**。只有你主动生成分享链接时，项目概览与选定文件才会通过本地服务对外暴露；AI 调用只把文件文本片段（≤50KB）发给你自己配置的 Provider。

需要注意的两点：

- **密钥明文存储。** AI 的 API Key 与飞书 App Secret 明文存在本地 SQLite（`ai_settings` / `feishu_settings` 表）。`server/data/*.db` 已在 `.gitignore` 中忽略，但**不要**把这个库提交到任何公开仓库。正式使用应接入系统 Keychain 或加密存储。
- **CORS 全开。** 开发态是 `origin: true`，任何页面都能调你的本地接口。若要在非本机环境跑，先收紧到具体来源，并考虑加一层认证。

---

## 已知限制

| 项 | 现状 |
|---|---|
| 多用户 / 协作 | 单机单用户，无登录、权限与云端同步（与 PRD 范围一致） |
| AI Provider | `xinghe` / `custom` 按 OpenAI 兼容协议处理；若星河社区改用专属协议，需补独立 Provider |
| 调度粒度 | 基于 `node-schedule`，最小 1 分钟 —— UI 上的「30 秒」选项会被向下取整 |
| 飞书推送 | 依赖你自建的应用，且推送账号需有目标文档的编辑权限 |
