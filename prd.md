# PRD：本地文件夹项目看板 Demo

> 版本：v1.0  
> 日期：2026-06-29  
> 状态：Demo 阶段

---

## 1. 产品概述

### 1.1 产品名称

暂定：**Project Folder Kanban**

### 1.2 产品定位

一个面向小团队的本地项目管理 Demo。用户可以指定本地项目文件夹，系统定时扫描文件变化，将文件自动整理成看板卡片，并通过 AI 总结文件变化、文件内容和项目进度。

### 1.3 核心价值

解决小团队在项目推进中常见的问题：

- 文件散落在本地目录中，缺少统一视图
- 文件改了什么、项目推进到哪里，需要人工整理
- 历史版本容易丢失，难以回溯
- 团队成员很难快速理解当前项目状态

本产品通过「本地文件夹扫描 + 看板 + AI 总结 + 版本归档」把文件夹变成一个轻量项目管理系统。

---

## 2. 目标用户

### 2.1 主要用户

**小团队，2-10 人**

典型场景：

- 产品经理 + 设计师 + 开发组成的小项目组
- 需要频繁迭代方案文档、设计文件、代码文件的小团队
- Demo、原型、交付物较多，但暂时不想引入复杂项目管理系统的团队

### 2.2 用户特点

- 文件主要保存在本地或共享目录
- 不希望上传整个文件夹到云端
- 希望通过简单启动方式体验产品
- 希望 AI 帮忙总结项目进度，而不是手动写周报或状态说明

---

## 3. 产品目标

### 3.1 Demo 阶段目标

本阶段目标不是完整商业化交付，而是验证核心产品价值：

1. 能扫描本地指定文件夹
2. 能检测文件新增、修改、删除
3. 能将文件以看板卡片展示
4. 能保留文件历史版本
5. 能调用星河社区 API 生成 AI 总结
6. 能在设置页配置模型、API Key 和 API 地址

### 3.2 不做的事情

Demo 阶段暂不支持：

- 多用户登录
- 云端同步
- 权限管理
- 在线协作编辑
- 移动端
- Git 仓库集成
- 企业级部署
- 文件内容全文搜索

---

## 4. 推荐技术形态

### 4.1 推荐方案

```
Node.js 本地服务 + React Web UI + SQLite
```

### 4.2 为什么不用 Electron

Electron 虽然可以直接访问本地文件系统，但 Demo 阶段存在几个问题：

- 安装包体积较大
- 打包和启动链路复杂
- 跨平台兼容调试成本较高
- 用户体验 Demo 时可能卡在安装环节

### 4.3 为什么使用本地 Node 服务

浏览器 Web 页面本身不能稳定扫描本地文件夹，因此需要一个本地进程负责文件系统能力。本地 Node 服务优势：

- 启动简单：`npm run dev`
- 可以直接读取本地文件夹
- 可以定时扫描
- 可以写入归档文件
- 可以调用星河社区 API
- 前端仍然是普通 Web 页面，开发和展示方便

### 4.4 系统形态

用户启动本地服务后，在浏览器访问：

```
http://localhost:3000
```

整体结构：

```
Browser UI
└── React / Vite
    ├── 看板页
    ├── 文件详情页
    ├── 项目概览页
    └── 设置页

Local Backend
└── Node.js / Express 或 Fastify
    ├── FolderScanner
    ├── ArchiveManager
    ├── SnapshotStore
    ├── AIService
    ├── XingheProvider
    └── Scheduler

Local Storage
└── SQLite
```

---

## 5. 核心用户流程

### 5.1 首次使用流程

1. 用户启动本地服务
2. 浏览器打开应用首页
3. 用户进入设置页
4. 添加要扫描的本地文件夹路径
5. 配置扫描间隔
6. 配置星河社区 API 地址、API Key 和模型
7. 点击「测试连接」
8. 点击「开始扫描」
9. 系统扫描文件夹并生成看板卡片

### 5.2 文件扫描流程

1. 到达扫描时间，或用户点击「手动扫描」
2. 后端遍历指定文件夹
3. 排除 `.kanban-archive` 目录
4. 计算文件 checksum
5. 与上一次快照对比
6. 判断文件状态（新增 / 修改 / 删除 / 未变化）
7. 将变化写入 SQLite
8. 对新增或修改文件触发 AI 总结
9. 前端刷新看板和项目进度

### 5.3 文件修改与归档流程

1. 用户修改某个文件
2. 下一次扫描发现 checksum 变化
3. 系统将旧版本复制到归档目录
4. 新版本成为当前版本
5. 文件卡片版本数 +1
6. AI 总结本次变化

### 5.4 历史版本恢复流程

1. 用户打开文件卡片详情
2. 查看版本时间线
3. 选择某个历史版本
4. 点击「恢复此版本」
5. 系统将历史版本复制回原文件路径
6. 下一次扫描将该恢复动作记录为新版本

---

## 6. 功能需求

### 6.1 设置页

#### 6.1.1 文件夹配置

| 字段 | 说明 |
|---|---|
| 文件夹路径 | 本地绝对路径 |
| 扫描间隔 | 默认 5 分钟，可改为 30 秒、1 分钟、5 分钟、10 分钟 |
| 是否启用 | 可以暂停某个文件夹扫描 |
| 手动扫描 | 立即触发一次扫描 |

操作：添加文件夹 / 删除文件夹 / 修改扫描间隔 / 启用停用 / 手动扫描

#### 6.1.2 AI 模型配置

| 字段 | 说明 |
|---|---|
| AI 服务商 | 默认：星河社区 |
| API Base URL | 星河社区接口地址 |
| API Key | 用户填写自己的密钥 |
| 模型名称 | 用户选择或手动输入模型 ID |
| 温度参数 | 可选，默认 0.3 |
| 最大输出长度 | 可选，默认 1000 |
| 测试连接 | 发送测试 prompt 验证配置 |

服务商选项：

- 星河社区（Demo 阶段优先实现）
- Ollama 本地模型
- OpenAI Compatible
- 自定义 API

#### 6.1.3 AI 配置保存

保存字段：

```
provider / base_url / api_key / model / temperature / max_tokens / enabled
```

> ⚠️ Demo 阶段明文保存在本地，API Key 仅保存在本机。正式版应接入系统 Keychain 或加密存储。

---

### 6.2 看板页

#### 6.2.1 看板列

默认 4 列：`Backlog` / `In Progress` / `Review` / `Done`

#### 6.2.2 文件卡片

| 信息 | 说明 |
|---|---|
| 文件名 | 如 `prd.md` |
| 文件路径 | 相对路径 |
| 文件类型 | 如 `.md`、`.png`、`.docx` |
| 文件状态 | 当前看板列 |
| 最后更新时间 | 最近一次扫描检测到的变化时间 |
| 版本数 | 当前累计版本数量 |
| AI 摘要 | 一句话展示最近变化 |
| 文件事件 | 新增 / 修改 / 删除 |

#### 6.2.3 看板操作

- 拖拽卡片到不同列
- 点击卡片进入详情页
- 按文件类型筛选
- 按关键词搜索文件名
- 点击「手动扫描」
- 查看最近一次扫描时间

#### 6.2.4 项目进度横幅

看板顶部显示 AI 生成的项目整体进度，示例：

> 本轮扫描发现 3 个文件更新，主要集中在需求文档和接口说明上。项目已经从需求整理阶段推进到方案细化阶段，下一步建议补充交互细节和开发任务拆分。

---

### 6.3 文件详情页

#### 6.3.1 基本信息

展示：文件名、相对路径、绝对路径、文件类型、当前 checksum、版本号、文件大小、最近更新时间、看板状态

#### 6.3.2 AI 总结（三维度）

**变更总结：** 本次文件发生了什么变化（1-3 句）

**内容总结：** 当前文件主要内容是什么（1-3 句）

**项目进度影响：** 该文件变化对整体项目的影响（1-3 句）

#### 6.3.3 版本时间线

| 字段 | 说明 |
|---|---|
| 版本号 | v1、v2、v3 |
| 事件类型 | created / modified / deleted / restored |
| 创建时间 | 版本生成时间 |
| 文件大小 | 当时文件大小 |
| checksum | 版本 checksum |
| AI 总结 | 该版本对应的总结 |
| 操作 | 查看内容、恢复版本 |

#### 6.3.4 查看历史内容

文本文件支持预览（`.txt` / `.md` / `.json` / `.js` / `.ts` / `.tsx` / `.py` / `.html` / `.css`）。

二进制文件只展示文件大小、文件类型、修改时间、版本记录。

#### 6.3.5 恢复版本

1. 弹窗确认
2. 后端将归档文件复制回原路径
3. 当前文件被覆盖
4. 下一轮扫描记录为新版本
5. 历史版本不删除

---

### 6.4 文件扫描能力

#### 6.4.1 默认排除目录

```
.kanban-archive/
node_modules/
.git/
.DS_Store
```

#### 6.4.2 文件变化判断（SHA256 checksum）

| 类型 | 判断方式 |
|---|---|
| 新增 | 当前存在，数据库不存在 |
| 修改 | 当前存在，checksum 不同 |
| 删除 | 数据库存在，当前不存在 |
| 未变化 | 当前存在，checksum 相同 |

#### 6.4.3 扫描记录字段

```
scan_id / folder_id / started_at / completed_at
files_added / files_modified / files_deleted / status / error_message
```

---

### 6.5 文件归档能力

#### 6.5.1 归档目录结构

```
project/
├── docs/
│   └── prd.md
└── .kanban-archive/
    └── docs/
        ├── prd.md.v1.md
        ├── prd.md.v2.md
        └── prd.md.v3.md
```

#### 6.5.2 归档规则

- 新增文件：记录 v1
- 修改文件：旧版本进入归档，新版本成为当前版本
- 删除文件：保留最后一个可用版本，标记 deleted
- 恢复文件：恢复后的文件作为新版本记录

---

### 6.6 AI 总结能力

#### 6.6.1 Provider 设计

```
AIService
├── XingheProvider      ← Demo 阶段优先实现
├── OllamaProvider
├── OpenAICompatibleProvider
└── CustomProvider
```

#### 6.6.2 测试连接 Prompt

```
请回复：连接成功
```

成功提示「模型连接成功」，失败提示「连接失败，请检查 API 地址、API Key 和模型名称」。

#### 6.6.3 文件级总结 Prompt 输出（JSON）

```json
{
  "changeSummary": "本次变化说明",
  "contentSummary": "当前内容说明",
  "progressImpact": "对项目进度的影响"
}
```

#### 6.6.4 项目级总结 Prompt 输出（JSON）

```json
{
  "projectSummary": "项目整体进度总结",
  "suggestedNextStep": "建议下一步"
}
```

> AI 调用异步执行，不阻塞扫描写库。卡片显示「总结中…」状态。

---

## 7. 数据模型

### folders

```sql
id, absolute_path, scan_interval_seconds, enabled, created_at, updated_at
```

### files

```sql
id, folder_id, relative_path, filename, extension,
current_checksum, status, is_deleted, version_count,
last_event_type, created_at, updated_at
```

### versions

```sql
id, file_id, version_number, checksum, archive_path,
event_type, size_bytes,
ai_change_summary, ai_content_summary, ai_progress_impact,
created_at
```

### scans

```sql
id, folder_id, started_at, completed_at,
files_added, files_modified, files_deleted,
status, error_message
```

### project_summaries

```sql
id, scan_id, summary_text, suggested_next_step, files_changed_count, generated_at
```

### ai_settings

```sql
id, provider, base_url, api_key, model, temperature, max_tokens, enabled, created_at, updated_at
```

---

## 8. 页面结构

| 页面 | 核心模块 |
|---|---|
| 看板页（首页） | 项目进度横幅、手动扫描、4 列看板、文件卡片、筛选搜索 |
| 文件详情页 | 基础信息、AI 三维总结、版本时间线、内容预览、恢复按钮 |
| 设置页 | 文件夹配置、扫描间隔、AI 服务商配置、API Key、模型选择、测试连接 |
| 项目概览页 | 历史扫描记录、每轮项目总结、文件变化数量、建议下一步 |

---

## 9. 本地 API 设计

```
# 文件夹
GET    /api/folders
POST   /api/folders
PATCH  /api/folders/:id
DELETE /api/folders/:id
POST   /api/folders/:id/scan

# 看板
GET    /api/files
GET    /api/files/:id
PATCH  /api/files/:id/status

# 版本
GET    /api/files/:id/versions
GET    /api/versions/:id/content
POST   /api/versions/:id/restore

# AI 设置
GET    /api/ai-settings
POST   /api/ai-settings
POST   /api/ai-settings/test

# 项目总结
GET    /api/project-summaries
```

---

## 10. 验收标准

### 文件扫描

- [ ] 添加本地文件夹后可以成功扫描
- [ ] 新增文件后，手动扫描可以生成新卡片
- [ ] 修改文件后，卡片更新时间和版本数更新
- [ ] 删除文件后，卡片显示 deleted 状态

### 版本归档

- [ ] 修改文件后，旧版本保存到 `.kanban-archive`
- [ ] 文件详情页能看到多个历史版本
- [ ] 文本版本可以预览内容
- [ ] 点击恢复后，原文件内容被恢复
- [ ] 恢复不会删除已有历史版本

### AI 配置

- [ ] 设置页可以选择「星河社区」
- [ ] 可以填写 API Base URL / API Key / 模型名称
- [ ] 测试连接能显示成功或失败
- [ ] 配置保存后刷新页面仍存在

### AI 总结

- [ ] 文本文件新增或修改后，可以生成变更总结
- [ ] 文件详情页展示内容总结
- [ ] 看板顶部展示项目整体进度总结
- [ ] API 调用失败时，页面不崩溃，显示失败状态

### Demo 完整流程

1. 启动本地服务，打开浏览器
2. 添加本地文件夹
3. 配置星河社区 API，点击测试连接
4. 手动扫描，看板出现文件卡片
5. 修改一个 Markdown 文件后再次扫描
6. 查看 AI 总结与版本历史
7. 恢复旧版本
8. 查看项目进度总结

---

## 11. 非功能需求

| 项目 | 要求 |
|---|---|
| 启动方式 | `npm install && npm run dev` |
| 性能 | 1000 个文件以内扫描时间 < 10 秒 |
| AI 调用 | 异步执行，不阻塞扫描完成 |
| 隐私 | 只有参与 AI 总结的文本片段发送到外部 API |
| 稳定性 | 单个文件读取失败不影响整个扫描；API 失败不影响归档 |

---

## 12. 风险与应对

| 风险 | 应对 |
|---|---|
| 星河社区 API 格式不确定 | AIService 做 Provider 抽象，支持配置化请求 |
| 文件夹太大 | Demo 阶段提示建议选择小型项目文件夹 |
| 二进制文件无法总结内容 | 二进制只生成元数据摘要 |
| API Key 泄露 | Demo 本地保存并提示风险，正式版改加密存储 |
| 用户误恢复旧版本 | 恢复前弹窗确认，恢复动作本身也记录为新版本 |

---

## 13. 里程碑计划

| 阶段 | 目标 | 关键产出 |
|---|---|---|
| Phase 1 | 基础骨架 | Node 服务可启动，React 页面可访问，SQLite 初始化，设置页基础 UI |
| Phase 2 | 文件扫描与看板 | 扫描本地文件夹，生成文件卡片，手动扫描可用 |
| Phase 3 | 版本归档 | 修改保存旧版本，详情页展示版本历史，恢复功能可用 |
| Phase 4 | AI 接入 | 星河社区 API 可配置，文件级和项目级 AI 总结可展示 |
| Phase 5 | Demo 打磨 | UI 优化，loading/error 状态，筛选搜索，Demo 流程验收 |

---

## 14. 技术选型汇总

```
前端：React + Vite + TypeScript
后端：Node.js + Fastify（或 Express）+ TypeScript
数据库：SQLite（better-sqlite3）
AI：星河社区 API，Provider 模式支持扩展
文件监控：SHA256 checksum 轮询（不依赖 chokidar，降低依赖复杂度）
启动：npm run dev（前后端并行启动）
```
