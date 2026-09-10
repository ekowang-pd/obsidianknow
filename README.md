# Deer Notes

Capture ideas, read your notes, and turn useful passages into knowledge—all within Obsidian.

Deer Notes is a local-first dashboard for quick notes, Markdown reading, and excerpts. Its minimal interface keeps content easy to browse, while your notes remain ordinary Markdown files in your vault.

## Features

- **Quick capture:** Write Markdown notes with formatting tools, tags, and image attachments.
- **Readable note cards:** Browse content previews, dates, and tags.
- **Search and folders:** Find notes by title, path, tags, or content, and explore top-level folders.
- **Built-in reader:** Read Markdown in a focused view or open the original file in Obsidian.
- **Selection excerpts:** Select a passage, add your thoughts, and save an excerpt with its source link.
- **Knowledge overview:** Explore document growth over 7, 30, or 90 days, folder distribution, recent updates, and recent articles in each category.
- **Activity heatmap:** View note modification activity over the past 13 weeks.

## Getting started

Enable Deer Notes, then click its ribbon icon or search the command palette for **打开小鹿笔记** (Open Deer Notes). The interface currently uses Chinese labels.

### Capture a note

Open **全部笔记** (All Notes), enter your thoughts, and click **保存笔记** (Save Note). You can also press **Ctrl+Enter** on Windows/Linux or **Cmd+Enter** on macOS.

The quick-note editor appears only in All Notes. Switching to a folder or the overview preserves your draft while the dashboard remains open.

### Browse and read

Select a folder in the sidebar and use search to narrow the list. Click a note card to read it. Choose **在 Obsidian 中打开** (Open in Obsidian) to work with the original file.

### Save an excerpt

Select text in the built-in reader, choose **做笔记** (Take a Note), add your thoughts, and save. Excerpts are grouped by source and date. The original document stays unchanged.

### Explore your knowledge

Open **知识概览** (Knowledge Overview) to see document counts, growth trends, folder distribution, and recent updates. Click an article to read it or expand the growth chart's daily data.

Growth is estimated from the creation times of files currently in your vault. Deleted files are not included, and importing or copying files may affect these dates.

## Storage and privacy

Notes are ordinary `.md` files with metadata and optional source links. The default notes folder is `小鹿笔记`, with images in its `附件` subfolder. Choose another notes folder in the plugin settings if needed. This affects future saves and does not move, rename, or delete existing files.

Deer Notes makes no network requests and includes no telemetry or advertising. It reads and writes through Obsidian's Vault API. Your notes and attachments remain under your control.

## Compatibility and support

The current interface and text-selection workflow primarily target desktop use. Mobile compatibility has not yet been verified.

Report bugs and request features through [GitHub Issues](https://github.com/ekowang-pd/obsidianknow/issues). Deer Notes is open source under the MIT License.

## Vault access

The dashboard indexes Markdown file paths and timestamps across the vault for folder browsing, search, and statistics. It reads note content when needed. Hidden folders are excluded from the overview display, but hiding a folder is not an access restriction. No vault data is transmitted.

Minimum supported version: Obsidian 1.7.2.

---

# 小鹿笔记

[English usage guide](docs/README.en.md)

小鹿笔记（Deer Notes）是一个本地优先的 Obsidian 插件，用于快速记录、阅读 Markdown、保存选文摘录和查看近期笔记活动。

## 功能

- 在一个看板中浏览小鹿笔记、Vault 一级目录和近期活动。
- 快速创建 Markdown 笔记，并支持 Markdown 工具与图片附件。
- 在插件内阅读 Markdown，并从阅读正文中选取文字后创建摘录笔记。
- 按来源与日期归并摘录，同时保留原始文件不变。
- 展示最近 13 周的笔记修改活动。

## 预览验收

当前正式版本为 `0.1.1`，包含简约笔记卡片、知识概览和小鹿标志。历史预览标签为 `0.1.0-preview.2`。发布文件见 [GitHub Releases](https://github.com/ekowang-pd/obsidianknow/releases)。移动端验收尚未完成。

安装与验收步骤见 [预览验收清单](docs/preview-acceptance.md)。摘录保存期间显示“正在保存”，暂时禁用取消，并阻止 Escape、关闭阅读器和切换文档丢弃当前编辑器；保存失败后保留原文和草稿，可重试。

## 安装发布产物

1. 从对应版本的 GitHub Release 下载且仅下载 `main.js`、`manifest.json` 和 `styles.css`。
2. 在目标 Vault 创建 `.obsidian/plugins/deer-notes/`。
3. 将这三个文件复制到该目录，重启 Obsidian 或重新加载插件。
4. 在 Obsidian 的第三方插件设置中启用“Deer Notes”；插件界面显示为“小鹿笔记”。

插件启用和打开看板不会创建笔记文件；首次保存才会创建默认目录。

## 笔记目录和数据

默认笔记目录为 `小鹿笔记`，默认附件子目录为 `附件`。可在插件设置中选择已有目录，例如 `80 笔记`；此操作只改变后续写入位置，不迁移、重命名或删除既有文件。

小鹿笔记以普通 Markdown 文件保存，包含 `deer-note` frontmatter、正文和可选来源链接。笔记及附件始终归 Vault 所有者控制。摘录会写入小鹿笔记的 Markdown 文件，不修改原文。

## 隐私和兼容性

插件不发起网络请求，不包含遥测、广告、自动更新或动态代码加载。所有读写均通过 Obsidian Vault API 完成。

当前版本以 Obsidian 桌面端为首要验收目标。移动端兼容性已在实现中预留，但尚未经过验证；不要将其视为已验证的移动端支持。移动端缺少右键和精确鼠标选区，摘录入口需要后续按原生文本选择流程验证。

## 已知限制

- 看板和阅读器当前处理 Vault 中的 Markdown 文件。
- 选文摘录的鼠标交互以桌面端为目标。
- 主题与完整安装流程仍应在目标 Obsidian 版本和 Vault 中手工验收。

## 本地开发

### 在 Codex 中预览与反馈

运行 `npm run preview`，在 Codex 右侧浏览器打开 `http://127.0.0.1:5173`。

该入口直接复用 `src/views` 界面、笔记服务和索引代码，支持写笔记、搜索、阅读、选文摘录、主题和宽度切换，以及延迟保存与失败重试。修改源代码或 CSS 后页面自动刷新。也可以在 Codex 浏览器中开启标注，点击需要修改的区域并提交反馈。

外观、预览宽度、保存模拟、导出和重置收在右下角“设置”中。快速笔记仅在“全部笔记”显示；切换目录或知识概览会保留未保存的草稿。

知识概览支持 7／30／90 天统计、累计文档增长曲线、一级目录分类占比、最近更新 5 篇和每类最近 3 篇文章。文章可直接打开，曲线下方可展开每日数据。概览排除隐藏目录与点目录；增长根据现存文档创建时间估算，不包含已删除文档，导入或复制可能改变时间记录。

预览采用独立的浏览器示例数据，保存到当前浏览器的本地存储；“重置示例”只清除预览数据，“导出笔记”导出合并的 Markdown 文本（不包含图片附件）。浏览器 Markdown 使用通用渲染器，Obsidian 专有语法、主题和真实 Vault 行为仍需在 Obsidian 验收。自动刷新会清除尚未保存的输入，请在反馈前先保存。

服务仅监听本机地址，只提供预览静态资源；没有访问真实知识库的文件接口。

预览检查：`npm run preview:typecheck`、`npm run preview:build`。

### 插件构建与验证

```bash
npm ci
npm run test:single-thread
npm run typecheck
npm run build
npm run release:check
```

开发监视模式：

```bash
npm run dev
```

## 发布流程

### 开发依赖审计

2026-09-10 的 `npm audit` 报告 3 个中等严重度开发依赖项：`@vitest/mocker` 与 `vitest` 涉及 [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9)，`esbuild` 涉及 [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)。它们不属于插件运行时依赖。本次保留现有工具版本；审计建议的升级涉及破坏性版本，应另行完成兼容性验证后再升级。

`yaml` 仅作为测试依赖，用真实 YAML 解析器验证 frontmatter 行为；发布插件使用 Obsidian 提供的 YAML API。

### 发布步骤

1. 同步 `package.json`、`manifest.json` 和 `versions.json` 中的版本与最低 Obsidian 版本。
2. 执行完整本地开发验证和 `npm run release:check`。
3. 在一次性测试 Vault 安装三项发布产物并完成桌面端手工验收。
4. 正式发布创建与 `package.json` 版本一致的 Git 标签（例如 `0.1.0`）；预览版添加后缀（例如 `0.1.0-preview.1`），插件元数据仍保持数字版本 `0.1.0`。
5. 标签工作流会重新执行安装、单线程测试、类型检查、构建和版本校验，然后创建 GitHub Release 并仅上传三项发布产物。

发布工作流不会发布 npm 包、创建远程仓库或提交 Obsidian Community Plugins PR。

带后缀的标签将发布为 GitHub Pre-release，不设为 Latest。
