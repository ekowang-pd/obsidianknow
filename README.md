# 小鹿笔记

小鹿笔记（Deer Notes）是一个本地优先的 Obsidian 插件，用于快速记录、阅读 Markdown、保存选文摘录和查看近期笔记活动。

## 功能

- 在一个看板中浏览小鹿笔记、Vault 一级目录和近期活动。
- 快速创建 Markdown 笔记，并支持 Markdown 工具与图片附件。
- 在插件内阅读 Markdown，并从阅读正文中选取文字后创建摘录笔记。
- 按来源与日期归并摘录，同时保留原始文件不变。
- 展示最近 13 周的笔记修改活动。

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
4. 创建与 `package.json` 版本完全一致的语义化 Git 标签（例如 `0.1.0`）。
5. 标签工作流会重新执行安装、单线程测试、类型检查、构建和版本校验，然后创建 GitHub Release 并仅上传三项发布产物。

发布工作流不会发布 npm 包、创建远程仓库或提交 Obsidian Community Plugins PR。
