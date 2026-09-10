import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownRenderer } from "obsidian";
import { DeerNotesView } from "../src/views/dashboard-view";
import { DEFAULT_SETTINGS } from "../src/settings";
import type { VaultSnapshot } from "../src/services/vault-index";
import { TestElement } from "./dom.mock";

const empty: VaultSnapshot = { rootFolders: [], markdownFiles: [], deerNotes: [] };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

function setup(snapshot = empty, readBody = async (_path: string) => "body") {
  const unsubscribe = vi.fn();
  let listener: (value: VaultSnapshot) => void = () => {};
  const index = { initialize: vi.fn(async () => {}), getSnapshot: () => snapshot, subscribe: (callback: typeof listener) => { listener = callback; return unsubscribe; } };
  const service = { saveQuickNote: vi.fn(async (_input: unknown) => ({ path: "小鹿笔记/草稿.md" })), saveAttachment: vi.fn(async (_file: unknown) => "附件/image.png") };
  const openFile = vi.fn();
  const view = new DeerNotesView({ app: {} } as never, index as never, service as never, DEFAULT_SETTINGS, openFile, readBody);
  const root = view.contentEl as unknown as TestElement;
  const action = (name: string) => root.find(node => node.dataset.action === name)[0];
  const textarea = () => root.find(node => node.tagName === "textarea")[0];
  const draft = (body: string) => { textarea().value = body; textarea().dispatch("input"); };
  return { view, root, action, textarea, draft, service, index, openFile, unsubscribe, publish: (value: VaultSnapshot) => listener(value) };
}

describe("DeerNotesView", () => {
  it("shows recent modification activity using file mtime and moves activity when that file changes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 10, 12));
    const note = { path: "小鹿笔记/old.md", name: "old.md", basename: "old", extension: "md", title: "Old", source: "", tags: [], created: "2026-01-01", updated: "2026-01-01", ctime: new Date(2026, 0, 1).getTime(), mtime: new Date(2026, 8, 9, 12).getTime() };
    const ui = setup({ ...empty, deerNotes: [note], markdownFiles: [note] });
    await ui.view.onOpen();
    const cell = (date: string) => ui.root.find(node => node.className === "deer-heat-cell" && node.title.startsWith(date))[0];
    expect(cell("2026-09-09").dataset.level).toBe("1");
    expect(ui.root.find(node => node.textContent === "最近修改活动")).toHaveLength(1);
    const changed = { ...note, mtime: new Date(2026, 8, 10, 10).getTime() };
    ui.publish({ ...empty, deerNotes: [changed], markdownFiles: [changed] });
    await flush();
    expect(cell("2026-09-09").dataset.level).toBe("0");
    expect(cell("2026-09-10").dataset.level).toBe("1");
    expect(ui.root.find(node => node.className === "deer-heat-cell")).toHaveLength(91);
    await ui.view.onClose();
  });

  it.each(["close", "hide"] as const)("cleans up resources registered by a late preview renderer after %s", async action => {
    const ui = setup();
    await ui.view.onOpen();
    ui.draft("preview draft");
    let finish!: () => void;
    const external = new EventTarget();
    let received = 0;
    vi.spyOn(MarkdownRenderer, "render").mockImplementationOnce(async (_app, _markdown, target, _path, component) => {
      await new Promise<void>(resolve => { finish = resolve; });
      const listener = () => { received += 1; };
      external.addEventListener("refresh", listener);
      component.register(() => external.removeEventListener("refresh", listener));
      target.textContent = "late preview";
    });
    ui.action("preview").click();
    if (action === "close") await ui.view.onClose();
    else ui.action("preview").click();
    finish();
    await flush();
    external.dispatchEvent(new Event("refresh"));
    expect(received).toBe(0);
    expect(ui.root.find(node => node.textContent === "late preview")).toHaveLength(0);
    if (action === "hide") await ui.view.onClose();
  });

  it("opens without writes, renders 91 labeled empty cells and disposes its subscription", async () => {
    const ui = setup();
    await ui.view.onOpen();
    expect(ui.root.find(node => node.className === "deer-heat-cell")).toHaveLength(91);
    expect(ui.root.find(node => node.className === "deer-heat-cell")[0].getAttribute("aria-label")).toMatch(/\d{4}-\d{2}-\d{2}：0 条笔记/);
    expect(ui.service.saveQuickNote).not.toHaveBeenCalled();
    expect(ui.service.saveAttachment).not.toHaveBeenCalled();
    await ui.view.onClose();
    expect(ui.unsubscribe).toHaveBeenCalledOnce();
    expect(ui.root.children).toEqual([]);
    ui.publish(empty);
    expect(ui.root.children).toEqual([]);
  });

  it("retains failed drafts with an inline alert, then clears them only after a successful save", async () => {
    const ui = setup();
    await ui.view.onOpen();
    ui.draft("My draft");
    ui.service.saveQuickNote.mockRejectedValueOnce(new Error("磁盘写入失败"));
    ui.action("save").click();
    await flush();
    expect(ui.textarea().value).toBe("My draft");
    expect(ui.root.find(node => node.getAttribute("role") === "alert").some(node => node.textContent.includes("磁盘写入失败"))).toBe(true);
    ui.action("save").click();
    await flush();
    expect(ui.service.saveQuickNote).toHaveBeenLastCalledWith({ body: "My draft", date: expect.any(Date) });
    expect(ui.textarea().value).toBe("");
    expect(ui.action("save").disabled).toBe(true);
  });

  it("inserts Markdown tools and the saved relative attachment path, and previews with a note source path", async () => {
    const ui = setup();
    await ui.view.onOpen();
    ui.draft("hello");
    ui.textarea().setSelectionRange(0, 5);
    ui.action("bold").click();
    expect(ui.textarea().value).toBe("**hello**");
    ui.textarea().setSelectionRange(9, 9);
    ui.action("tag").click();
    expect(ui.textarea().value).toContain("#标签");
    const imageInput = ui.root.find(node => node.type === "file")[0];
    const image = { type: "image/png", size: 3, arrayBuffer: async () => new ArrayBuffer(3) };
    imageInput.files = [image];
    imageInput.dispatch("change");
    await flush();
    expect(ui.service.saveAttachment).toHaveBeenCalledWith(image);
    expect(ui.textarea().value).toContain("![图片](<附件/image.png>)");
    const render = vi.spyOn(MarkdownRenderer, "render");
    ui.action("preview").click();
    await flush();
    expect(render).toHaveBeenCalledWith(expect.anything(), ui.textarea().value, expect.anything(), "小鹿笔记/未保存.md", expect.anything());
    render.mockRestore();
  });

  it("routes list opens by descriptor path and refreshes settings without losing a draft", async () => {
    const descriptor = { path: "01 收件箱/a.md", name: "a.md", basename: "a", extension: "md", ctime: 1000, mtime: 2000 };
    const snapshot = { ...empty, rootFolders: [{ path: "01 收件箱", name: "01 收件箱" }], markdownFiles: [descriptor] };
    const ui = setup(snapshot);
    await ui.view.onOpen();
    ui.draft("unsaved");
    ui.root.find(node => node.dataset.folder === "01 收件箱")[0].click();
    await flush();
    ui.action("open-file").click();
    expect(ui.openFile).toHaveBeenCalledWith("01 收件箱/a.md");
    ui.view.updateSettings({ ...DEFAULT_SETTINGS, hiddenRootFolders: ["01 收件箱"] });
    expect(ui.textarea().value).toBe("unsaved");
    expect(ui.root.find(node => node.dataset.folder === "01 收件箱")).toHaveLength(0);
  });

  it.each([["unordered", "- one\n- two"], ["ordered", "1. one\n2. two"]])("formats selected lines once with %s", async (action, expected) => {
    const ui = setup();
    await ui.view.onOpen();
    ui.draft("one\ntwo");
    ui.textarea().setSelectionRange(0, 7);
    ui.action(action).click();
    expect(ui.textarea().value).toBe(expected);
  });

  it("does not start more body reads after closing a view with an in-flight search", async () => {
    let resolve!: (body: string) => void;
    const read = vi.fn(() => new Promise<string>(done => { resolve = done; }));
    const notes = ["a", "b"].map(name => ({ path: `小鹿笔记/${name}.md`, name: `${name}.md`, basename: name, extension: "md", title: name, source: "", tags: [], created: "2026-09-10", updated: "2026-09-10", ctime: 1000, mtime: 2000 }));
    const ui = setup({ ...empty, deerNotes: notes, markdownFiles: notes }, read);
    await ui.view.onOpen();
    const search = ui.root.find(node => node.type === "search")[0];
    search.value = "hidden";
    search.dispatch("input");
    await ui.view.onClose();
    resolve("hidden");
    await flush();
    expect(read).toHaveBeenCalledTimes(1);
    expect(ui.root.children).toEqual([]);
  });

  it.each([false, true])("keeps image draft save and preview in their original folder when settings change (pending upload: %s)", async pending => {
    const ui = setup();
    await ui.view.onOpen();
    let finishUpload!: (path: string) => void;
    if (pending) ui.service.saveAttachment.mockImplementationOnce(() => new Promise(resolve => { finishUpload = resolve; }));
    const imageInput = ui.root.find(node => node.type === "file")[0];
    imageInput.files = [{ type: "image/png", size: 1, arrayBuffer: async () => new ArrayBuffer(1) }];
    imageInput.dispatch("change");
    if (!pending) await flush();
    const nextService = { saveQuickNote: vi.fn(async () => ({ path: "新笔记/new.md" })), saveAttachment: vi.fn(async () => "新附件/new.png") };
    ui.view.updateSettings({ ...DEFAULT_SETTINGS, notesFolder: "新笔记", attachmentsFolder: "新附件" }, ui.index as never, nextService as never);
    if (pending) { finishUpload("附件/image.png"); await flush(); }
    expect(ui.textarea().value).toBe("![图片](<附件/image.png>)");
    const render = vi.spyOn(MarkdownRenderer, "render");
    ui.action("preview").click();
    await flush();
    expect(render.mock.calls.at(-1)?.[3]).toBe("小鹿笔记/未保存.md");
    render.mockRestore();
    ui.service.saveQuickNote.mockRejectedValueOnce(new Error("请重试"));
    ui.action("save").click();
    await flush();
    expect(ui.textarea().value).toBe("![图片](<附件/image.png>)");
    ui.action("save").click();
    await flush();
    expect(ui.service.saveQuickNote).toHaveBeenCalledTimes(2);
    expect(nextService.saveQuickNote).not.toHaveBeenCalled();
    expect(ui.textarea().value).toBe("");
    ui.draft("next draft");
    ui.action("save").click();
    await flush();
    expect(nextService.saveQuickNote).toHaveBeenCalledWith({ body: "next draft", date: expect.any(Date) });
  });

  it("adopts new settings immediately for an empty or manually cleared draft", async () => {
    const ui = setup();
    await ui.view.onOpen();
    const nextService = { saveQuickNote: vi.fn(async () => ({ path: "新笔记/new.md" })), saveAttachment: vi.fn(async () => "新附件/new.png") };
    ui.draft("old draft");
    ui.draft("");
    ui.view.updateSettings({ ...DEFAULT_SETTINGS, notesFolder: "新笔记", attachmentsFolder: "新附件" }, ui.index as never, nextService as never);
    const imageInput = ui.root.find(node => node.type === "file")[0];
    imageInput.files = [{ type: "image/png", size: 1, arrayBuffer: async () => new ArrayBuffer(1) }];
    imageInput.dispatch("change");
    await flush();
    expect(ui.textarea().value).toBe("![图片](<新附件/new.png>)");
    expect(ui.service.saveAttachment).not.toHaveBeenCalled();
    ui.action("save").click();
    await flush();
    expect(nextService.saveQuickNote).toHaveBeenCalledOnce();
  });

  it("restores selected navigation focus after navigation and snapshot rebuilds without stealing input focus", async () => {
    const ui = setup({ ...empty, rootFolders: [{ path: "01 收件箱", name: "01 收件箱" }] });
    await ui.view.onOpen();
    const folder = ui.root.find(node => node.dataset.folder === "01 收件箱")[0];
    folder.focus();
    folder.click();
    await flush();
    expect(ui.root.ownerDocument.activeElement === ui.root.find(node => node.dataset.folder === "01 收件箱")[0]).toBe(true);
    ui.publish(empty);
    await flush();
    expect(ui.root.ownerDocument.activeElement === ui.action("notes")).toBe(true);
    ui.textarea().focus();
    ui.publish(empty);
    await flush();
    expect(ui.root.ownerDocument.activeElement === ui.textarea()).toBe(true);
  });

  it("preserves a focused unselected navigation item when the sidebar refreshes", async () => {
    const folders = [{ path: "01 收件箱", name: "01 收件箱" }];
    const ui = setup({ ...empty, rootFolders: folders });
    await ui.view.onOpen();
    ui.root.find(node => node.dataset.folder === "01 收件箱")[0].focus();
    ui.publish({ ...empty, rootFolders: [...folders, { path: "10 项目", name: "10 项目" }] });
    await flush();
    expect(ui.root.ownerDocument.activeElement?.dataset.folder).toBe("01 收件箱");
    expect(ui.action("notes").getAttribute("aria-current")).toBe("page");
    await ui.view.onClose();
  });
});
