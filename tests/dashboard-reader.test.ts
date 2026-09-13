// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import DeerNotesPlugin from "../src/main";
import { DeerNotesView } from "../src/views/dashboard-view";
import { DEFAULT_SETTINGS } from "../src/settings";

it("saves with Ctrl+Enter, ignores IME composition and duplicate submissions, and retains a failed draft", async () => {
  const snapshot = { rootFolders: [], markdownFiles: [], deerNotes: [] };
  const index = { getSnapshot: () => snapshot, subscribe: () => () => {}, initialize: async () => {} };
  let reject!: (error: Error) => void;
  const saveQuickNote = vi.fn(() => new Promise((_resolve, fail) => { reject = fail; }));
  const view = new DeerNotesView({ app: {} } as never, index as never, { saveQuickNote } as never, DEFAULT_SETTINGS, () => {}, async () => "");
  const host = document.createElement("div");
  Object.defineProperty(view, "contentEl", { value: host }); document.body.append(host);
  try {
    await view.onOpen();
    const input = host.querySelector("textarea")!;
    input.value = "正在记录的想法"; input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, isComposing: true }));
    expect(saveQuickNote).not.toHaveBeenCalled();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true }));
    expect(saveQuickNote).toHaveBeenCalledOnce();
    expect(host.querySelector('[data-action="save"]')?.textContent).toBe("保存中…");
    reject(new Error("磁盘已满"));
    for (let i = 0; i < 12; i++) await Promise.resolve();
    expect(input.value).toBe("正在记录的想法");
    expect(input.disabled).toBe(false);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("磁盘已满");
  } finally { await view.onClose(); host.remove(); }
});

it("opens a dashboard descriptor in its internal reader and disposes it on view close", async () => {
  const file = { path: "docs/source.md", name: "source.md", basename: "source", extension: "md", stat: { ctime: 1000, mtime: 2000, size: 100 } };
  const app = {
    vault: {
      getRoot: () => ({ children: [{ path: "docs", name: "docs", children: [] }] }),
      getMarkdownFiles: () => [file], on: vi.fn(() => ({})), offref: vi.fn(),
      getAbstractFileByPath: vi.fn(() => file), cachedRead: vi.fn(async () => "source body")
    },
    workspace: {
      onLayoutReady: (callback: () => void) => callback(),
      getLeavesOfType: vi.fn(() => [] as unknown[]), revealLeaf: vi.fn(async () => {}),
      openLinkText: vi.fn(async () => {}), getLeaf: vi.fn()
    }
  };
  const plugin = new DeerNotesPlugin(app as never, {} as never);
  const factory = vi.spyOn(plugin, "registerView"); await plugin.onload();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  const view = factory.mock.calls[0][1]({ app } as never) as DeerNotesView;
  const host = document.createElement("div");
  Object.defineProperty(view, "contentEl", { value: host }); document.body.append(host);
  app.workspace.getLeavesOfType.mockReturnValue([{ view }]);
  await view.onOpen();
  host.querySelector<HTMLButtonElement>('button[data-action="overview"]')!.click();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  host.querySelector<HTMLButtonElement>('button[data-days="7"]')!.click();
  const selectedPeriod = host.querySelector<HTMLButtonElement>('button[data-days="7"]')!;
  expect(selectedPeriod.getAttribute("aria-pressed")).toBe("true");
  expect(document.activeElement).toBe(selectedPeriod);
  host.querySelector<HTMLButtonElement>('.deer-recent-link')!.click();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  expect(host.querySelector(".deer-reader-content")?.textContent).toBe("source body");
  host.querySelector<HTMLButtonElement>('.deer-reader-close')!.click();
  host.querySelector<HTMLButtonElement>('button[data-folder="docs"]')!.click();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  host.querySelector<HTMLButtonElement>('button[data-action="open-file"]')!.click();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  expect(host.querySelector(".deer-reader-content")?.textContent).toBe("source body");
  expect(app.workspace.openLinkText).not.toHaveBeenCalled();
  await view.onClose(); expect(host.children).toHaveLength(0); plugin.unload(); host.remove();
});


it("revisits a visible note without changing the draft or search and prevents duplicate opens", async () => {
  const file = { path: "notes/a.md", name: "a.md", basename: "a", extension: "md", ctime: 1, mtime: 2 };
  const snapshot = { rootFolders: [], markdownFiles: [file], deerNotes: [] };
  const index = { getSnapshot: () => snapshot, subscribe: () => () => {}, initialize: async () => {} };
  let finish!: () => void;
  const open = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const view = new DeerNotesView({ app: {} } as never, index as never, {} as never, DEFAULT_SETTINGS, open, async () => "body");
  const host = document.createElement("div");
  Object.defineProperty(view, "contentEl", { value: host }); document.body.append(host);
  try {
    await view.onOpen();
    for (let i = 0; i < 12; i++) await Promise.resolve();
    const input = host.querySelector("textarea")!;
    input.value = "keep my thought"; input.dispatchEvent(new Event("input"));
    const button = host.querySelector<HTMLButtonElement>('[data-action="revisit"]')!;
    button.click(); button.click();
    expect(open).toHaveBeenCalledExactlyOnceWith("notes/a.md");
    expect(button.disabled).toBe(true);
    expect(input.value).toBe("keep my thought");
    finish();
    for (let i = 0; i < 12; i++) await Promise.resolve();
    expect(button.disabled).toBe(false);
  } finally { await view.onClose(); host.remove(); }
});
