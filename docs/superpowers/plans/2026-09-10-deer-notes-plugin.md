# 小鹿笔记 Obsidian Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建可在 Obsidian 桌面端安装的小鹿笔记插件，提供动态根目录导航、快速笔记、Markdown 阅读、选文摘录和 13 周活动热图。

**Architecture:** 领域逻辑保持为无 Obsidian 依赖的纯 TypeScript；Vault 读写与索引封装在服务层；`ItemView` 只负责交互和渲染。插件首次加载不修改 Vault，首次保存时才创建用户配置的笔记目录。

**Tech Stack:** TypeScript 5、Obsidian API、esbuild、Vitest、jsdom、CSS

**Spec:** `docs/superpowers/specs/2026-09-10-deer-notes-plugin-design.md`

## Global Constraints

- 第一版以 Obsidian 桌面端为验收目标。
- 默认笔记目录必须是 `小鹿笔记`，默认附件子目录必须是 `附件`。
- 插件启用和打开视图不得创建或修改 Vault 文件。
- 所有用户文件读写必须使用 Obsidian Vault API；不得使用 Node `fs`、绝对路径或 File System Access API。
- 不得删除、移动、迁移或批量重命名用户文件。
- 插件不得包含网络请求、遥测、动态代码或广告。
- 新笔记以第一个非空段落命名，最长 60 字符；创建后文件名保持稳定。
- 同一来源同一自然日的摘录追加到同一篇笔记。
- 每项生产行为严格执行 RED → GREEN → REFACTOR，并在每个任务后提交。

---

### Task 1: 工程骨架与插件生命周期

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `esbuild.config.mjs`
- Create: `vitest.config.ts`
- Create: `manifest.json`
- Create: `versions.json`
- Create: `src/main.ts`
- Test: `tests/main.test.ts`

**Interfaces:**
- Produces: `DeerNotesPlugin extends Plugin`, `VIEW_TYPE_DEER_NOTES = "deer-notes-dashboard"`
- Produces npm scripts: `dev`, `build`, `test`, `typecheck`

- [ ] **Step 1: 建立最小测试工程并写生命周期失败测试**

```ts
// tests/main.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
  Plugin: class {},
  ItemView: class {},
}));

describe("plugin contract", () => {
  it("exports a stable dashboard view type", async () => {
    const module = await import("../src/main");
    expect(module.VIEW_TYPE_DEER_NOTES).toBe("deer-notes-dashboard");
  });
});
```

- [ ] **Step 2: 运行测试并确认因 `src/main.ts` 不存在而失败**

Run: `npm test -- tests/main.test.ts`
Expected: FAIL，错误包含 `Failed to load url ../src/main`。

- [ ] **Step 3: 创建插件入口、构建配置与清单**

```ts
// src/main.ts
import { Plugin } from "obsidian";

export const VIEW_TYPE_DEER_NOTES = "deer-notes-dashboard";

export default class DeerNotesPlugin extends Plugin {
  async onload(): Promise<void> {
    // 后续任务注册视图、命令和设置页。
  }
}
```

`manifest.json` 使用稳定且不含商标误导的 ID `deer-notes`，`isDesktopOnly` 为 `false`，版本从 `0.1.0` 开始。esbuild 将 `obsidian` 标记为 external，输出根目录 `main.js`。

- [ ] **Step 4: 验证测试、类型检查和生产构建**

Run: `npm test -- tests/main.test.ts && npm run typecheck && npm run build`
Expected: 全部通过，根目录生成 `main.js`，无警告。

- [ ] **Step 5: 提交工程骨架**

```bash
git add package.json package-lock.json tsconfig.json esbuild.config.mjs vitest.config.ts manifest.json versions.json src/main.ts tests/main.test.ts
git commit -m "build: scaffold deer notes plugin"
```

### Task 2: 设置、路径校验和动态导航领域模型

**Files:**
- Create: `src/settings.ts`
- Create: `src/domain/navigation.ts`
- Test: `tests/settings.test.ts`
- Test: `tests/navigation.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Produces: `DeerNotesSettings { notesFolder; attachmentsFolder; hiddenRootFolders }`
- Produces: `DEFAULT_SETTINGS`, `normalizeSettings(input)`
- Produces: `validateVaultPath(path): string`, `buildRootNavigation(folders, settings): RootNavItem[]`
- Produces: `DeerNotesSettingTab extends PluginSettingTab`

- [ ] **Step 1: 写设置默认值与路径校验失败测试**

```ts
expect(normalizeSettings({})).toEqual({
  notesFolder: "小鹿笔记",
  attachmentsFolder: "附件",
  hiddenRootFolders: [],
});
expect(() => validateVaultPath("../秘密")).toThrow("Vault 内的相对路径");
expect(() => validateVaultPath("/绝对路径")).toThrow("Vault 内的相对路径");
expect(validateVaultPath("80 笔记")).toBe("80 笔记");
```

- [ ] **Step 2: 运行设置测试并确认导入失败**

Run: `npm test -- tests/settings.test.ts`
Expected: FAIL，原因是 `src/settings.ts` 不存在。

- [ ] **Step 3: 实现设置类型、默认值、路径标准化和设置页**

`normalizeSettings` 只接受字符串和字符串数组；路径统一 `/`，去除首尾空白和尾斜线。设置页保存前校验，错误使用 `Notice` 展示，不写入无效设置。

- [ ] **Step 4: 写动态根目录导航失败测试**

```ts
const result = buildRootNavigation(
  ["10 项目", ".obsidian", "小鹿笔记", "01 收件箱", "附件库"],
  { ...DEFAULT_SETTINGS, hiddenRootFolders: ["附件库"] },
);
expect(result.map((item) => item.path)).toEqual(["01 收件箱", "10 项目"]);
```

- [ ] **Step 5: 运行导航测试并确认导入失败**

Run: `npm test -- tests/navigation.test.ts`
Expected: FAIL，原因是 `src/domain/navigation.ts` 不存在。

- [ ] **Step 6: 实现导航过滤和中文自然排序**

```ts
export function buildRootNavigation(
  folders: string[],
  settings: DeerNotesSettings,
): RootNavItem[] {
  const hidden = new Set(settings.hiddenRootFolders);
  return folders
    .filter((path) => !path.startsWith(".") && path !== settings.notesFolder && !hidden.has(path))
    .sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }))
    .map((path) => ({ path, label: path }));
}
```

- [ ] **Step 7: 在插件入口加载、保存设置并注册设置页**

`onload` 调用 `loadData` 后通过 `normalizeSettings` 合并；公开 `saveSettings(next)`，成功后通知已打开视图刷新。

- [ ] **Step 8: 运行测试与类型检查并提交**

Run: `npm test -- tests/settings.test.ts tests/navigation.test.ts && npm run typecheck`
Expected: PASS。

```bash
git add src/settings.ts src/domain/navigation.ts src/main.ts tests/settings.test.ts tests/navigation.test.ts
git commit -m "feat: add vault settings and dynamic navigation"
```

### Task 3: 笔记领域格式、命名和活动计算

**Files:**
- Create: `src/domain/notes.ts`
- Create: `src/domain/contributions.ts`
- Test: `tests/notes.test.ts`
- Test: `tests/contributions.test.ts`

**Interfaces:**
- Produces: `noteTitle(body): string`, `uniqueNotePath(folder, title, existingPaths): string`
- Produces: `createNoteMarkdown(input): string`, `appendNoteMarkdown(existing, entry): string`
- Produces: `parseDeerNote(content): DeerNoteMeta | null`
- Produces: `buildContributions(timestamps, now): ContributionSummary`

- [ ] **Step 1: 写笔记标题和唯一路径失败测试**

```ts
expect(noteTitle("\n第一段 **重点**\n继续\n\n第二段")).toBe("第一段 重点 继续");
expect(noteTitle("# <>:\\/?*|")).toBe("未命名笔记");
expect(uniqueNotePath("小鹿笔记", "想法", new Set(["小鹿笔记/想法.md"])))
  .toBe("小鹿笔记/想法 (2).md");
```

- [ ] **Step 2: 运行标题测试并确认失败**

Run: `npm test -- tests/notes.test.ts`
Expected: FAIL，原因是领域模块不存在。

- [ ] **Step 3: 实现标题清洗、Windows 保留名与重名序号**

标题取第一段，清除图片、链接语法、标题、引用、强调和非法字符，压缩空白，截断 60 字符。`CON`、`PRN`、`AUX`、`NUL`、`COM1..9`、`LPT1..9` 前加 `笔记-`。

- [ ] **Step 4: 写 Markdown 创建、解析和追加失败测试**

```ts
const created = createNoteMarkdown({
  title: "我的想法", body: "个人判断 #思考", source: "01 收件箱/原文.md",
  excerpt: "被选中的原文", date: new Date("2026-09-10T12:14:39+08:00"),
});
expect(created).toContain("type: deer-note");
expect(created).toContain("来源：[[01 收件箱/原文]]");
expect(created).toContain("> 被选中的原文\n\n个人判断 #思考");
expect(parseDeerNote(created)?.source).toBe("01 收件箱/原文.md");
expect(appendNoteMarkdown(created, { body: "第二条", excerpt: "第二段", date })).toContain("第二条");
```

- [ ] **Step 5: 实现安全的 frontmatter 与正文生成**

frontmatter 字符串使用 JSON 字符串形式；标签从正文 `#标签` 提取并去重。追加时只更新 `updated` 和 `tags`，保留首次 `created`、`source`、标题和文件名。

- [ ] **Step 6: 写 91 天贡献数据失败测试**

```ts
const result = buildContributions([], new Date("2026-09-10T12:00:00+08:00"));
expect(result.days).toHaveLength(91);
expect(result.activeDays).toBe(0);
expect(result.streak).toBe(0);
expect(result.days.at(-1)?.date).toBe("2026-09-10");
```

- [ ] **Step 7: 实现贡献活动计算并运行全部领域测试**

Run: `npm test -- tests/notes.test.ts tests/contributions.test.ts`
Expected: PASS，覆盖空数据、跨月、连续天和同日多条记录。

- [ ] **Step 8: 提交领域逻辑**

```bash
git add src/domain/notes.ts src/domain/contributions.ts tests/notes.test.ts tests/contributions.test.ts
git commit -m "feat: add note format and activity model"
```

### Task 4: Vault 笔记服务与增量索引

**Files:**
- Create: `src/services/note-service.ts`
- Create: `src/services/vault-index.ts`
- Test: `tests/note-service.test.ts`
- Test: `tests/vault-index.test.ts`

**Interfaces:**
- Produces: `NoteService.saveQuickNote(input): Promise<TFile>`
- Produces: `NoteService.saveExcerptNote(input): Promise<TFile>`
- Produces: `NoteService.saveAttachment(file): Promise<string>`
- Produces: `VaultIndex.initialize(): Promise<void>`, `dispose(): void`, `subscribe(listener): () => void`
- Emits immutable `VaultSnapshot { rootFolders; markdownFiles; deerNotes }`

- [ ] **Step 1: 写首次保存才创建目录的失败测试**

使用内存 Vault 适配器记录 `createFolder` 和 `create` 调用。构造 `NoteService` 后断言没有写操作；调用 `saveQuickNote` 后断言先创建 `小鹿笔记`，再创建 Markdown。

- [ ] **Step 2: 运行服务测试并确认失败**

Run: `npm test -- tests/note-service.test.ts`
Expected: FAIL，原因是 `NoteService` 不存在。

- [ ] **Step 3: 实现独立笔记保存、目录冲突和原子追加检查**

保存前通过 `vault.getAbstractFileByPath` 检查目录/文件冲突。追加时重新 `cachedRead` 最新内容并解析；只对相同 `source + created` 的 `deer-note` 调用 `vault.modify`，否则创建新文件。

- [ ] **Step 4: 写摘录同日合并和跨日分离测试**

```ts
await service.saveExcerptNote({ source: "Inbox/a.md", excerpt: "A", body: "想法一", date: day1 });
await service.saveExcerptNote({ source: "Inbox/a.md", excerpt: "B", body: "想法二", date: day1 });
expect(adapter.markdownFiles()).toHaveLength(1);
await service.saveExcerptNote({ source: "Inbox/a.md", excerpt: "C", body: "次日", date: day2 });
expect(adapter.markdownFiles()).toHaveLength(2);
```

- [ ] **Step 5: 实现附件校验和写入**

仅接受 PNG/JPEG/GIF/WebP 且不超过 20 MB；使用 `crypto.randomUUID()` 命名，通过 `vault.createBinary` 写入，返回相对于笔记文件的 `附件/<uuid>.<ext>`。

- [ ] **Step 6: 写增量索引失败测试**

断言 `initialize` 读取 Markdown 清单但不创建文件；模拟 `create`、`modify`、`rename`、`delete` 后，快照只改变对应记录并通知一次订阅者。

- [ ] **Step 7: 实现 VaultIndex 和事件释放**

索引只在视图首次需要时初始化。监听器通过 Obsidian `registerEvent` 的等价释放函数统一保存，`dispose` 后事件不再更新快照。

- [ ] **Step 8: 运行服务测试与类型检查并提交**

Run: `npm test -- tests/note-service.test.ts tests/vault-index.test.ts && npm run typecheck`
Expected: PASS。

```bash
git add src/services/note-service.ts src/services/vault-index.ts tests/note-service.test.ts tests/vault-index.test.ts
git commit -m "feat: add vault note persistence and index"
```

### Task 5: 看板视图、动态导航和快速笔记

**Files:**
- Create: `src/views/dashboard-view.ts`
- Create: `src/views/dashboard-state.ts`
- Test: `tests/dashboard-state.test.ts`
- Modify: `src/main.ts`
- Create: `styles.css`

**Interfaces:**
- Produces: `DashboardState.selectNotes()`, `selectFolder(path)`, `selectOverview()`
- Produces: `DeerNotesView extends ItemView`
- Consumes: `VaultIndex`, `NoteService`, `buildRootNavigation`, `buildContributions`

- [ ] **Step 1: 写视图状态失败测试**

```ts
const state = new DashboardState(snapshot, settings);
expect(state.navigation.map((x) => x.id)).toEqual(["all-notes", "01 收件箱", "10 项目", "overview"]);
state.selectFolder("01 收件箱");
expect(state.visibleFiles.every((f) => f.path.startsWith("01 收件箱/"))).toBe(true);
```

- [ ] **Step 2: 运行状态测试并确认失败**

Run: `npm test -- tests/dashboard-state.test.ts`
Expected: FAIL，原因是状态模块不存在。

- [ ] **Step 3: 实现可测试的视图状态和过滤**

“全部笔记”只包含 `type: deer-note`；目录视图递归包含子目录 Markdown；搜索匹配标题、路径、正文和来源；知识概览固定在动态目录之后。

- [ ] **Step 4: 实现 ItemView 外壳、贡献热图和导航**

`onOpen` 初始化索引并订阅快照，创建左侧固定区、91 格热图、导航和右侧内容区。每次渲染前清理当前区域，按钮使用 `setIcon` 和 `aria-current`。

- [ ] **Step 5: 实现快速笔记编辑器**

输入框不显示聚焦边框，只保留 caret；工具栏支持文本插入、图片选择和预览。保存成功清空草稿，失败保留输入并显示内联错误和 `Notice`。

- [ ] **Step 6: 注册图标、命令和视图激活**

`main.ts` 注册 ribbon 图标“打开小鹿笔记”、命令 `deer-notes:open-dashboard` 和唯一视图。激活时复用已有 leaf，不重复打开多个实例。

- [ ] **Step 7: 运行状态测试、类型检查与构建**

Run: `npm test -- tests/dashboard-state.test.ts && npm run typecheck && npm run build`
Expected: PASS，生产构建成功。

- [ ] **Step 8: 提交看板视图**

```bash
git add src/views/dashboard-view.ts src/views/dashboard-state.ts src/main.ts styles.css tests/dashboard-state.test.ts
git commit -m "feat: build dashboard and quick notes"
```

### Task 6: Markdown 阅读器与选文摘录

**Files:**
- Create: `src/views/reader.ts`
- Create: `src/views/selection-note.ts`
- Create: `src/views/selection-model.ts`
- Test: `tests/selection-model.test.ts`
- Modify: `src/views/dashboard-view.ts`
- Modify: `styles.css`

**Interfaces:**
- Produces: `selectionFromRange(range, container): SelectionAnchor | null`
- Produces: `ReaderController.open(file)`, `close()`, `dispose()`
- Produces: `SelectionNoteController.open(anchor, file)`, `close()`, `dispose()`

- [ ] **Step 1: 写选区边界与定位失败测试**

在 jsdom 中创建正文和外部节点。正文内非空选区返回摘录与矩形；折叠选区、跨越正文边界和纯空白选区返回 `null`。

- [ ] **Step 2: 运行选区测试并确认失败**

Run: `npm test -- tests/selection-model.test.ts`
Expected: FAIL，原因是选区模型不存在。

- [ ] **Step 3: 实现无 UI 依赖的选区模型**

```ts
export interface SelectionAnchor {
  excerpt: string;
  rect: { left: number; bottom: number };
}
```

验证 `container.contains(commonAncestorContainer)`，标准化摘录换行并保留段落。

- [ ] **Step 4: 实现全屏阅读状态**

Reader 使用 `MarkdownRenderer.render`，顶部左侧关闭按钮，右侧“在 Obsidian 中打开”。内部链接通过 workspace 打开；阅读器关闭后恢复触发元素焦点。

- [ ] **Step 5: 实现选文浮层和摘录编辑器**

监听阅读正文的 `pointerup`、`keyup` 和局部 `contextmenu`。有效选区下方显示唯一“做笔记”；仅阅读正文内阻止默认菜单。摘录编辑器显示只读引用和 Markdown 输入，Escape 关闭，保存失败保留内容。

- [ ] **Step 6: 接入 NoteService 并刷新关联笔记**

保存调用 `saveExcerptNote({ source: file.path, excerpt, body, date: new Date() })`。成功后关闭编辑器并依赖索引事件刷新；不得修改来源文件。

- [ ] **Step 7: 运行选区测试、类型检查与构建并提交**

Run: `npm test -- tests/selection-model.test.ts && npm run typecheck && npm run build`
Expected: PASS。

```bash
git add src/views/reader.ts src/views/selection-note.ts src/views/selection-model.ts src/views/dashboard-view.ts styles.css tests/selection-model.test.ts
git commit -m "feat: add reader and excerpt notes"
```

### Task 7: 发布质量、文档和安装验收

**Files:**
- Create: `README.md`
- Create: `LICENSE`
- Create: `.gitignore`
- Create: `.github/workflows/release.yml`
- Create: `tests/manifest.test.ts`
- Modify: `package.json`
- Modify: `manifest.json`
- Modify: `versions.json`

**Interfaces:**
- Produces release assets: `main.js`, `manifest.json`, `styles.css`

- [ ] **Step 1: 写发布清单失败测试**

```ts
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
expect(manifest.id).toBe("deer-notes");
expect(manifest.isDesktopOnly).toBe(false);
expect(manifest.description.length).toBeLessThanOrEqual(250);
expect(manifest.description.endsWith(".")).toBe(true);
expect(JSON.parse(readFileSync("versions.json", "utf8"))[manifest.version]).toBe(manifest.minAppVersion);
```

- [ ] **Step 2: 运行发布测试并确认现有清单不完整时失败**

Run: `npm test -- tests/manifest.test.ts`
Expected: 至少一项断言 FAIL，证明测试能约束发布清单。

- [ ] **Step 3: 完善清单、MIT 许可证和 README**

README 说明功能、安装、默认目录、设置、隐私、桌面端第一版范围、移动端兼容状态和开发命令。不得使用“官方”等误导性描述。

- [ ] **Step 4: 添加发布工作流**

Tag `0.1.0` 触发：`npm ci`、`npm test`、`npm run typecheck`、`npm run build`，然后创建 GitHub Release 并上传三项产物。版本必须与 manifest 一致。

- [ ] **Step 5: 运行完整自动验证**

Run: `npm ci && npm test && npm run typecheck && npm run build`
Expected: 所有测试通过；根目录存在 `main.js`、`manifest.json`、`styles.css`。

- [ ] **Step 6: 执行本地安装冒烟测试**

将三项产物复制到一个空白测试 Vault 的 `.obsidian/plugins/deer-notes/`，启动 Obsidian 后验证：

1. 启用插件不创建文件。
2. ribbon 和命令均可打开同一看板。
3. 首次保存创建 `小鹿笔记`。
4. 动态一级目录新增、重命名、删除可刷新。
5. 选文摘录保存引用、笔记和来源，原文未修改。
6. 明暗主题下可读，键盘能关闭阅读器和编辑器。

- [ ] **Step 7: 提交发布准备**

```bash
git add README.md LICENSE .gitignore .github/workflows/release.yml tests/manifest.test.ts package.json manifest.json versions.json
git commit -m "docs: prepare community plugin release"
```

- [ ] **Step 8: 最终分支审查**

Run: `git status --short && git log --oneline --decorate -8`
Expected: 工作树干净，任务提交按顺序存在。此步骤不创建远程仓库、不推送，也不提交 Community Plugins PR。
