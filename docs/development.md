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
