import { describe, expect, it, vi } from "vitest";
import { MarkdownRenderer } from "obsidian";
import { DeerNotesView } from "../src/views/dashboard-view";
import { DEFAULT_SETTINGS } from "../src/settings";
import type { VaultSnapshot } from "../src/services/vault-index";
import { TestElement } from "./dom.mock";

const empty: VaultSnapshot = { rootFolders: [], markdownFiles: [], deerNotes: [] };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function setup(snapshot = empty) {
  const unsubscribe = vi.fn();
  let listener: (value: VaultSnapshot) => void = () => {};
  const index = { getSnapshot: () => snapshot, subscribe: (callback: typeof listener) => { listener = callback; return unsubscribe; } };
  const service = { saveQuickNote: vi.fn(async (_input: unknown) => ({ path: "小鹿笔记/草稿.md" })), saveAttachment: vi.fn(async (_file: unknown) => "附件/image.png") };
  const openFile = vi.fn();
  const view = new DeerNotesView({ app: {} } as never, index as never, service as never, DEFAULT_SETTINGS, openFile, async () => "body");
  const root = view.contentEl as unknown as TestElement;
  const action = (name: string) => root.find(node => node.dataset.action === name)[0];
  const textarea = () => root.find(node => node.tagName === "textarea")[0];
  const draft = (body: string) => { textarea().value = body; textarea().dispatch("input"); };
  return { view, root, action, textarea, draft, service, openFile, unsubscribe, publish: (value: VaultSnapshot) => listener(value) };
}

describe("DeerNotesView", () => {
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
    const descriptor = { path: "01 收件箱/a.md", name: "a.md", basename: "a", extension: "md" };
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
});
