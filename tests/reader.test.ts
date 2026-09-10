// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Component, MarkdownRenderer } from "obsidian";
import { ReaderController } from "../src/views/reader";

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const controllers: ReaderController[] = [];
afterEach(() => { controllers.splice(0).forEach(reader => reader.dispose()); document.body.replaceChildren(); vi.restoreAllMocks(); });

function setup() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("deer-selection-menu") ? new DOMRect(0, 0, 96, 40) : new DOMRect(0, 0, 1024, 768);
  });
  const host = document.createElement("div");
  const trigger = document.createElement("button");
  host.append(trigger); document.body.append(host); trigger.focus();
  const file = { path: "docs/source.md", basename: "source", extension: "md" };
  const openFile = vi.fn(async (_file: unknown) => {});
  const app = {
    vault: { getAbstractFileByPath: vi.fn(() => file), cachedRead: vi.fn(async () => "first\n\nsecond") },
    workspace: { getLeaf: vi.fn(() => ({ openFile })), openLinkText: vi.fn(async () => {}) }
  };
  const notes = { saveExcerptNote: vi.fn(async (_input: unknown) => file) };
  const reader = new ReaderController(app as never, host, () => notes as never);
  controllers.push(reader);
  const button = (label: string) => [...host.querySelectorAll("button")].find(el => (el.getAttribute("aria-label") ?? el.textContent) === label)!;
  const select = () => {
    const content = host.querySelector<HTMLElement>(".deer-reader-content")!;
    const range = document.createRange(); range.selectNodeContents(content);
    range.getBoundingClientRect = () => ({ left: 9999, bottom: 9999 } as DOMRect);
    const selection = document.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    return content;
  };
  const escape = () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  return { reader, host, app, notes, file, button, trigger, select, escape, openFile };
}

describe("ReaderController", () => {
  it.each([true, false])("styles timestamp headings only in owned notes (owned: %s)", async owned => {
    const ui = setup();
    ui.app.vault.cachedRead.mockResolvedValue(owned ? '---\ntype: deer-note\ncreated: "2026-09-10"\nupdated: "2026-09-10"\n---\n\n# Title' : '# Title');
    vi.spyOn(MarkdownRenderer, "render").mockImplementationOnce(async (_app, _md, target) => {
      const host = target as unknown as HTMLElement;
      host.innerHTML = '<h1>Title</h1><h2>12:34:56</h2><p>My words</p><h2>A section</h2>';
    });
    await ui.reader.open("docs/source.md");
    expect(ui.host.querySelectorAll(".deer-note-timestamp")).toHaveLength(owned ? 1 : 0);
    expect(ui.host.querySelector(".deer-reader-content")?.textContent).toContain("My words");
  });
  it("reads the live file, renders Markdown with its source path and opens Obsidian only explicitly", async () => {
    const ui = setup(); const render = vi.spyOn(MarkdownRenderer, "render");
    await ui.reader.open("docs/source.md");
    expect(ui.app.vault.getAbstractFileByPath).toHaveBeenCalledWith("docs/source.md");
    expect(ui.app.vault.cachedRead).toHaveBeenCalledWith(ui.file);
    expect(render.mock.calls[0][3]).toBe("docs/source.md");
    expect(ui.host.querySelector(".deer-reader-content")?.textContent).toBe("first\n\nsecond");
    expect(ui.openFile).not.toHaveBeenCalled();
    ui.button("在 Obsidian 中打开").click(); await flush();
    expect(ui.openFile).toHaveBeenCalledWith(ui.file);
    ui.button("返回列表").click();
    expect(ui.host.querySelector(".deer-reader")).toBeNull();
    expect(document.activeElement).toBe(ui.trigger);
  });
  it.each(["close", "dispose"] as const)("ignores a pending read after %s", async action => {
    const ui = setup(); let resolve!: (value: string) => void;
    ui.app.vault.cachedRead.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const render = vi.spyOn(MarkdownRenderer, "render");
    const pending = ui.reader.open("docs/source.md"); ui.reader[action](); resolve("late"); await pending;
    expect(render).not.toHaveBeenCalled(); expect(ui.host.querySelector(".deer-reader")).toBeNull();
    if (action === "dispose") { await ui.reader.open("docs/source.md"); expect(ui.host.querySelector(".deer-reader")).toBeNull(); }
  });
  it("lets the latest open win and unloads a stale renderer component", async () => {
    const ui = setup(); let finish!: () => void;
    const unload = vi.spyOn(Component.prototype, "unload");
    vi.spyOn(MarkdownRenderer, "render").mockImplementationOnce(async (_app, _md, target) => {
      await new Promise<void>(done => { finish = done; }); target.textContent = "stale";
    });
    const first = ui.reader.open("docs/old.md"); await flush();
    await ui.reader.open("docs/source.md"); finish(); await first;
    expect(ui.host.querySelector(".deer-reader-content")?.textContent).toBe("first\n\nsecond");
    expect(unload).toHaveBeenCalled();
  });
  it("surfaces missing/read failures without rendering a stale document", async () => {
    const ui = setup(); ui.app.vault.getAbstractFileByPath.mockReturnValueOnce(null as never);
    await ui.reader.open("missing.md");
    expect(ui.host.querySelector('[role="alert"]')?.textContent).toContain("missing.md");
    ui.app.vault.cachedRead.mockRejectedValueOnce(new Error("read failed"));
    await ui.reader.open("docs/source.md");
    expect(ui.host.querySelector('[role="alert"]')?.textContent).toContain("read failed");
  });
  it("shows one clamped action for pointer/keyboard selection and prevents only selected reader contextmenu", async () => {
    const ui = setup(); await ui.reader.open("docs/source.md"); const content = ui.select();
    content.dispatchEvent(new Event("pointerup", { bubbles: true }));
    document.dispatchEvent(new Event("selectionchange"));
    const menu = ui.host.querySelector<HTMLElement>(".deer-selection-menu")!;
    expect(menu.querySelectorAll("button")).toHaveLength(1); expect(menu.textContent).toBe("做笔记");
    expect(parseFloat(menu.style.left)).toBeLessThan(window.innerWidth);
    expect(parseFloat(menu.style.top)).toBeLessThan(window.innerHeight);
    const inside = new MouseEvent("contextmenu", { bubbles: true, cancelable: true }); content.dispatchEvent(inside);
    expect(inside.defaultPrevented).toBe(true);
    const outside = new MouseEvent("contextmenu", { bubbles: true, cancelable: true }); document.body.dispatchEvent(outside);
    expect(outside.defaultPrevented).toBe(false);
    document.getSelection()!.removeAllRanges();
    const empty = new MouseEvent("contextmenu", { bubbles: true, cancelable: true }); content.dispatchEvent(empty);
    expect(empty.defaultPrevented).toBe(false);
  });
  it("retains the captured excerpt through action pointerdown, and Escape closes menu then editor then reader", async () => {
    const ui = setup(); await ui.reader.open("docs/source.md");
    ui.select().dispatchEvent(new Event("pointerup", { bubbles: true }));
    ui.escape(); expect(ui.host.querySelector(".deer-selection-menu")).toBeNull(); expect(ui.host.querySelector(".deer-reader")).not.toBeNull();
    ui.select().dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", bubbles: true }));
    const action = ui.button("做笔记");
    const down = new Event("pointerdown", { bubbles: true, cancelable: true }); action.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true); action.click();
    expect(ui.host.querySelector(".deer-excerpt")?.textContent).toBe("first\n\nsecond");
    expect(document.activeElement?.tagName).toBe("TEXTAREA");
    ui.escape(); expect(ui.host.querySelector(".deer-selection-note")).toBeNull();
    expect(document.activeElement).toBe(ui.host.querySelector(".deer-reader-content"));
    ui.escape(); expect(ui.host.querySelector(".deer-reader")).toBeNull(); expect(document.activeElement).toBe(ui.trigger);
  });
  it("saves exact excerpt/body/source and retains failed drafts for retry", async () => {
    const ui = setup(); await ui.reader.open("docs/source.md");
    ui.select().dispatchEvent(new Event("pointerup", { bubbles: true })); ui.button("做笔记").click();
    const textarea = ui.host.querySelector("textarea")!; textarea.value = " **my note**\n\nthought ";
    ui.notes.saveExcerptNote.mockRejectedValueOnce(new Error("disk full"));
    ui.button("保存笔记").click(); await flush();
    expect(textarea.value).toBe(" **my note**\n\nthought ");
    expect(ui.host.querySelector(".deer-excerpt")?.textContent).toBe("first\n\nsecond");
    expect(ui.host.querySelector('[role="alert"]')?.textContent).toContain("disk full");
    expect(ui.notes.saveExcerptNote).toHaveBeenCalledWith({ source: "docs/source.md", excerpt: "first\n\nsecond", body: " **my note**\n\nthought ", date: expect.any(Date) });
    ui.button("保存笔记").click(); await flush(); expect(ui.host.querySelector(".deer-selection-note")).toBeNull();
  });
  it("routes rendered internal links through Workspace with the current source path", async () => {
    const ui = setup(); await ui.reader.open("docs/source.md");
    const link = document.createElement("a"); link.className = "internal-link"; link.dataset.href = "other#section";
    ui.host.querySelector(".deer-reader-content")!.append(link);
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true })); await flush();
    expect(ui.app.workspace.openLinkText).toHaveBeenCalledWith("other#section", "docs/source.md", true);
  });
  it("starts the full-view reader at the top and restores the dashboard scroll on close", async () => {
    const ui = setup(); ui.host.scrollTop = 240; ui.host.scrollLeft = 12;
    await ui.reader.open("docs/source.md");
    expect(ui.host.scrollTop).toBe(0); expect(ui.host.scrollLeft).toBe(0);
    ui.reader.close(); expect(ui.host.scrollTop).toBe(240); expect(ui.host.scrollLeft).toBe(12);
  });
  it.each(["cancel", "escape", "close-reader", "open-reader"] as const)("preserves a pending excerpt through %s and allows retry after failure", async action => {
    const ui = setup(); await ui.reader.open("docs/source.md");
    ui.select().dispatchEvent(new Event("pointerup", { bubbles: true })); ui.button("做笔记").click();
    let fail!: (error: Error) => void;
    ui.notes.saveExcerptNote.mockImplementationOnce(() => new Promise((_done, reject) => { fail = reject; }));
    ui.host.querySelector("textarea")!.value = "important draft"; ui.button("保存笔记").click();
    if (action === "cancel") ui.button("取消").click();
    else if (action === "escape") ui.escape();
    else if (action === "close-reader") ui.button("返回列表").click();
    else await ui.reader.open("docs/other.md");
    expect(ui.host.querySelector("textarea")?.value).toBe("important draft");
    fail(new Error("disk full")); await flush();
    expect(ui.host.querySelector('[role="alert"]')?.textContent).toContain("disk full");
    expect(ui.host.querySelector("textarea")?.value).toBe("important draft");
    expect(ui.button("取消").disabled).toBe(false);
    ui.button("保存笔记").click(); await flush();
    expect(ui.notes.saveExcerptNote).toHaveBeenCalledTimes(2);
    expect(ui.host.querySelector(".deer-selection-note")).toBeNull();
  });
  it("announces a pending save, traps focus with disabled controls and closes on success", async () => {
    const ui = setup(); await ui.reader.open("docs/source.md");
    ui.select().dispatchEvent(new Event("pointerup", { bubbles: true })); ui.button("做笔记").click();
    let finish!: (value: typeof ui.file) => void;
    ui.notes.saveExcerptNote.mockImplementationOnce(() => new Promise(done => { finish = done; }));
    ui.host.querySelector("textarea")!.value = "draft"; ui.button("保存笔记").click();
    const editor = ui.host.querySelector<HTMLElement>(".deer-selection-note")!;
    expect(ui.button("取消").disabled).toBe(true);
    expect(editor.getAttribute("aria-busy")).toBe("true");
    expect(ui.host.querySelector('[role="status"]')?.textContent).toContain("正在保存");
    expect(document.activeElement).toBe(editor);
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    editor.dispatchEvent(tab); expect(tab.defaultPrevented).toBe(true);
    finish(ui.file); await flush();
    expect(ui.host.querySelector(".deer-selection-note")).toBeNull();
    expect(document.activeElement).toBe(ui.host.querySelector(".deer-reader-content"));
  });
  it("still releases the reader when disposed during a pending save", async () => {
    const ui = setup(); await ui.reader.open("docs/source.md");
    ui.select().dispatchEvent(new Event("pointerup", { bubbles: true })); ui.button("做笔记").click();
    let finish!: (value: typeof ui.file) => void;
    ui.notes.saveExcerptNote.mockImplementationOnce(() => new Promise(done => { finish = done; }));
    ui.button("保存笔记").click(); ui.reader.dispose();
    finish(ui.file); await flush();
    expect(ui.host.querySelector(".deer-reader")).toBeNull();
  });
  it("removes selection and detached action listeners when disposed", async () => {
    const ui = setup(); await ui.reader.open("docs/source.md");
    const content = ui.select(); content.dispatchEvent(new Event("pointerup", { bubbles: true }));
    const action = ui.button("做笔记"); const removed = vi.spyOn(document, "removeEventListener");
    ui.reader.dispose(); document.dispatchEvent(new Event("selectionchange")); action.click();
    expect(removed).toHaveBeenCalledWith("selectionchange", expect.any(Function));
    expect(ui.host.querySelector(".deer-reader")).toBeNull(); expect(ui.notes.saveExcerptNote).not.toHaveBeenCalled();
    const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true }); content.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(false);
  });
  it.each([
    { pane: [200, 100, 300, 350], anchor: [490, 440], expected: [172, 294] },
    { pane: [-50, -20, 450, 400], anchor: [-40, -10], expected: [58, 28] },
    { pane: [850, 650, 300, 300], anchor: [1140, 940], expected: [46, 62] }
  ])("keeps the measured menu within the visible intersection of pane $pane and viewport", async ({ pane, anchor, expected }) => {
    const ui = setup(); await ui.reader.open("docs/source.md");
    const root = ui.host.querySelector<HTMLElement>(".deer-reader")!;
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue(new DOMRect(...pane));
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("deer-selection-menu") ? new DOMRect(0, 0, 120, 48) : new DOMRect();
    });
    const content = ui.select();
    document.getSelection()!.getRangeAt(0).getBoundingClientRect = () => ({ left: anchor[0], bottom: anchor[1] } as DOMRect);
    content.dispatchEvent(new Event("pointerup", { bubbles: true }));
    const menu = ui.host.querySelector<HTMLElement>(".deer-selection-menu")!;
    expect([parseFloat(menu.style.left), parseFloat(menu.style.top)]).toEqual(expected);
  });
  it("keeps an unmeasured menu invisible and places it using its measured size before revealing", async () => {
    const ui = setup(); await ui.reader.open("docs/source.md");
    const root = ui.host.querySelector<HTMLElement>(".deer-reader")!;
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue(new DOMRect(200, 100, 300, 350));
    let measurable = false; let frame!: FrameRequestCallback;
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(() => measurable ? new DOMRect(0, 0, 120, 48) : new DOMRect());
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { frame = callback; return 7; });
    ui.select().dispatchEvent(new Event("pointerup", { bubbles: true }));
    const menu = ui.host.querySelector<HTMLElement>(".deer-selection-menu")!;
    expect(menu.style.visibility).toBe("hidden");
    measurable = true; expect(frame).toBeTypeOf("function"); frame(0);
    expect([parseFloat(menu.style.left), parseFloat(menu.style.top)]).toEqual([172, 294]);
    expect(menu.style.visibility).toBe("visible");
  });
  it.each(["close", "dispose"] as const)("cancels pending menu placement before the animation frame on %s", async action => {
    const ui = setup(); await ui.reader.open("docs/source.md");
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValue(new DOMRect());
    const pending = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { pending.set(7, callback); return 7; });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(id => { pending.delete(id); });
    ui.select().dispatchEvent(new Event("pointerup", { bubbles: true }));
    expect(pending.size).toBe(1);
    ui.reader[action]();
    expect(pending.size).toBe(0);
    expect(ui.host.querySelector(".deer-selection-menu")).toBeNull();
  });
});
