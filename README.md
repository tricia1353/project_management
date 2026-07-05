# Project Folder Kanban

本地文件夹项目看板 Demo：扫描本地目录，识别文件新增、修改、删除，并支持将扫描到的文件拖拽整理到目标项目目录，生成看板、版本记录和日报/周报 Markdown 报告。

## 启动

```bash
npm install
npm install --prefix server
npm run dev
```

前端地址：http://localhost:5173  
后端地址：http://localhost:3001

## 新工作流

1. 在「设置」页添加两个目录：
   - 来源文件夹：需要扫描的新文件目录
   - 目标文件夹：整理后的项目目录
2. 扫描来源文件夹，进入「工作台」。
3. 左侧是扫描池文件列表，右侧是目标目录下的项目卡。
4. 在右侧新建项目（会在目标目录中创建同名子目录）。
5. 将左侧文件拖拽到项目卡，后台会复制文件到对应项目目录。
6. 如果目标目录已有同名文件，自动生成 `_v1`、`_v2` 后缀。
7. 项目卡支持：
   - 保留最终版：同名多版本只保留最新，旧版本移入 `其他/`
   - 归档：将项目标记为 archived，页面中折叠/沉底显示
8. 在「报告」页选择时间范围，生成并复制 Markdown 日报/周报。

## 保留功能

- 看板页：Backlog / In Progress / Review / Done 四列、文件卡片、搜索筛选、手动扫描
- 文件详情页：基础信息、AI 三维总结、版本时间线、历史内容预览、恢复版本
- 项目概览页：历史扫描记录、AI 项目级总结和下一步建议
- 设置页：文件夹配置、AI Provider/API Key/模型配置、测试连接

## AI Provider

Demo 默认按 OpenAI Compatible 格式调用：

- `base_url` 可填服务根地址（自动补 `/v1/chat/completions`）
- 也可直接填完整 `/chat/completions` 地址
- Ollama 使用 `/api/chat` 和 `/api/tags`

API Key 当前明文保存在本地 SQLite，仅适合 Demo 使用。
