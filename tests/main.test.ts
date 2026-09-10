import { describe, expect, it, vi } from "vitest";

import { VIEW_TYPE_DEER_NOTES } from "../src/main";
import DeerNotesPlugin from "../src/main";
import type { DeerNotesSettings } from "../src/settings";
import type { DeerNotesView } from "../src/views/dashboard-view";
import { TestElement } from "./dom.mock";

function appFixture() {
  const workspace = {
    onLayoutReady: (callback: () => unknown) => callback(),
    getLeavesOfType: vi.fn(() => [] as any[]),
    getLeaf: vi.fn(() => ({ setViewState: vi.fn(async () => {}) })),
    revealLeaf: vi.fn(async (_leaf: unknown) => {}),
    openLinkText: vi.fn(async () => {})
  };
  const vault = {
    getRoot: () => ({ children: [] }), getMarkdownFiles: vi.fn(() => [] as any[]),
    on: vi.fn(() => ({})), offref: vi.fn(),
    createFolder: vi.fn(), create: vi.fn(), createBinary: vi.fn(),
    getAbstractFileByPath: vi.fn(), cachedRead: vi.fn()
  };
  return { workspace, vault };
}

describe("Deer Notes plugin", () => {
  it("does not scan on plugin load or when changing settings before the first dashboard opens", async () => {
    const app = appFixture();
    const plugin = new DeerNotesPlugin(app as never, {} as never);
    await plugin.onload();
    for (let i = 0; i < 12; i++) await Promise.resolve();
    expect(app.vault.getMarkdownFiles).not.toHaveBeenCalled();
    expect(app.vault.cachedRead).not.toHaveBeenCalled();
    await plugin.saveSettings({ notesFolder: "新笔记", attachmentsFolder: "附件", hiddenRootFolders: [] });
    expect(app.vault.getMarkdownFiles).not.toHaveBeenCalled();
    expect(app.vault.on).not.toHaveBeenCalled();
    plugin.unload();
  });

  it("initializes a restored dashboard on its first open, including files added after plugin load", async () => {
    const app = appFixture();
    const plugin = new DeerNotesPlugin(app as never, {} as never);
    const registerView = vi.spyOn(plugin, "registerView");
    await plugin.onload();
    for (let i = 0; i < 12; i++) await Promise.resolve();
    const file = { path: "小鹿笔记/later.md", extension: "md", stat: { ctime: 1000, mtime: 2000, size: 100 } };
    app.vault.getMarkdownFiles.mockReturnValue([file]);
    app.vault.getAbstractFileByPath.mockReturnValue(file);
    app.vault.cachedRead.mockResolvedValue('---\ntype: deer-note\ncreated: "2026-09-10"\nupdated: "2026-09-10"\ntags: []\n---\n\n# Later\n');
    const view = registerView.mock.calls[0][1]({ app } as never) as DeerNotesView;
    await view.onOpen();
    expect((view.contentEl as unknown as TestElement).find(node => node.dataset.path === "小鹿笔记/later.md")).toHaveLength(1);
    expect(app.vault.getMarkdownFiles).toHaveBeenCalledTimes(1);
    await view.onClose();
    plugin.unload();
  });

  it("exports the dashboard view type", () => {
    expect(VIEW_TYPE_DEER_NOTES).toBe("deer-notes-dashboard");
  });

  it("loads normalized settings and registers the settings tab", async () => {
    const plugin = new DeerNotesPlugin(appFixture() as never, {} as never);
    const underTest = plugin as typeof plugin & { settings: DeerNotesSettings };
    vi.spyOn(plugin, "loadData").mockResolvedValue({ notesFolder: " 80 笔记/ " });
    const addSettingTab = vi.spyOn(plugin, "addSettingTab");

    await underTest.onload();

    expect(underTest.settings).toEqual({
      language: "zh-CN",
      notesFolder: "80 笔记",
      attachmentsFolder: "附件",
      hiddenRootFolders: []
    });
    expect(addSettingTab).toHaveBeenCalledTimes(1);
  });

  it("persists normalized settings", async () => {
    const plugin = new DeerNotesPlugin({} as never, {} as never);
    const underTest = plugin as typeof plugin & {
      settings: DeerNotesSettings;
      saveSettings(next: DeerNotesSettings): Promise<void>;
    };
    const saveData = vi.spyOn(plugin, "saveData");

    await underTest.saveSettings({
      notesFolder: "../秘密",
      attachmentsFolder: " 附件/ ",
      hiddenRootFolders: ["收件箱", "收件箱"]
    });

    expect(saveData).toHaveBeenCalledWith({
      language: "zh-CN",
      notesFolder: "小鹿笔记",
      attachmentsFolder: "附件",
      hiddenRootFolders: ["收件箱"]
    });
  });

  it("registers the dashboard entry points without writing to the Vault", async () => {
    const app = appFixture();
    const plugin = new DeerNotesPlugin(app as never, {} as never);
    const registerView = vi.spyOn(plugin, "registerView");
    const ribbon = vi.spyOn(plugin, "addRibbonIcon");
    const command = vi.spyOn(plugin, "addCommand");
    await plugin.onload();
    expect(registerView).toHaveBeenCalledWith("deer-notes-dashboard", expect.any(Function));
    expect(ribbon).toHaveBeenCalledWith("notebook-pen", "打开小鹿笔记", expect.any(Function));
    expect(command).toHaveBeenCalledWith(expect.objectContaining({ id: "open-dashboard", callback: expect.any(Function) }));
    expect(app.vault.createFolder).not.toHaveBeenCalled();
    expect(app.vault.create).not.toHaveBeenCalled();
    plugin.unload();
  });

  it("reuses the existing leaf and creates the requested view only when no leaf exists", async () => {
    const app = appFixture();
    const plugin = new DeerNotesPlugin(app as never, {} as never);
    await plugin.onload();
    const existing = {};
    app.workspace.getLeavesOfType.mockReturnValueOnce([existing]);
    await plugin.activateView();
    expect(app.workspace.getLeaf).not.toHaveBeenCalled();
    expect(app.workspace.revealLeaf).toHaveBeenCalledWith(existing);
    await plugin.activateView();
    expect(app.workspace.getLeaf.mock.results[0].value.setViewState).toHaveBeenCalledWith({ type: "deer-notes-dashboard", active: true });
    plugin.unload();
  });

  it("retains the settings refresh callback and unregisters all index listeners on unload", async () => {
    const app = appFixture();
    const plugin = new DeerNotesPlugin(app as never, {} as never);
    await plugin.onload();
    await plugin.activateView();
    const refresh = vi.fn();
    plugin.setDashboardSettingsRefresh(refresh);
    await plugin.saveSettings({ notesFolder: "小鹿笔记", attachmentsFolder: "附件", hiddenRootFolders: ["10 项目"] });
    expect(refresh).toHaveBeenCalledOnce();
    expect(app.vault.createFolder).not.toHaveBeenCalled();
    plugin.unload();
    expect(app.vault.offref).toHaveBeenCalledTimes(4);
  });

  it("rebinds an open view when the notes folder changes, preserving its draft and resolving body reads by path", async () => {
    const app = appFixture();
    const file = { path: "新笔记/hello.md", extension: "md", stat: { ctime: 1000, mtime: 2000, size: 100 } };
    vi.spyOn(app.vault, "getMarkdownFiles").mockReturnValue([file] as never);
    app.vault.getAbstractFileByPath.mockReturnValue(file);
    app.vault.cachedRead.mockResolvedValue('---\ntype: deer-note\ncreated: "2026-09-10"\nupdated: "2026-09-10"\ntags: []\n---\n\n# Hello\n\nHidden body');
    const plugin = new DeerNotesPlugin(app as never, {} as never);
    const registerView = vi.spyOn(plugin, "registerView");
    await plugin.onload();
    const view = registerView.mock.calls[0][1]({ app } as never) as DeerNotesView;
    await view.onOpen();
    const root = view.contentEl as unknown as TestElement;
    const textarea = root.find(node => node.tagName === "textarea")[0];
    textarea.value = "keep this draft";
    textarea.dispatch("input");
    app.workspace.getLeavesOfType.mockReturnValue([{ view }]);
    await plugin.saveSettings({ notesFolder: "新笔记", attachmentsFolder: "附件", hiddenRootFolders: [] });
    expect(root.find(node => node.dataset.path === "新笔记/hello.md")).toHaveLength(1);
    expect(textarea.value).toBe("keep this draft");
    const search = root.find(node => node.type === "search")[0];
    search.value = "hidden";
    search.dispatch("input");
    for (let i = 0; i < 12; i++) await Promise.resolve();
    expect(app.vault.getAbstractFileByPath).toHaveBeenCalledWith("新笔记/hello.md");
    expect(app.vault.cachedRead).toHaveBeenCalledWith(file);
    expect(root.find(node => node.dataset.path === "新笔记/hello.md")).toHaveLength(1);
    expect(app.vault.createFolder).not.toHaveBeenCalled();
    await view.onClose();
    plugin.unload();
  });
});
