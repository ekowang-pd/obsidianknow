import { describe, expect, it, vi } from "vitest";

import { DashboardState } from "../src/views/dashboard-state";
import { DEFAULT_SETTINGS } from "../src/settings";
import type { VaultFileDescriptor, VaultSnapshot } from "../src/services/vault-index";

const file = (path: string): VaultFileDescriptor => {
  const name = path.split("/").pop()!;
  return Object.freeze({ path, name, basename: name.slice(0, -3), extension: "md", ctime: 1000, mtime: 2000 });
};
const note = Object.freeze({ ...file("小鹿笔记/Alpha.md"), title: "Alpha idea", source: "Books/Design.md", created: "2026-09-10", updated: "2026-09-10", tags: Object.freeze([]) });
const snapshot: VaultSnapshot = Object.freeze({
  rootFolders: Object.freeze(["10 项目", "小鹿笔记", "01 收件箱", ".private"].map(path => Object.freeze({ path, name: path }))),
  markdownFiles: Object.freeze([file("01 收件箱/a.md"), file("01 收件箱/子目录/b.md"), file("01 收件箱别处/c.md"), file("10 项目/plan.md"), note]),
  deerNotes: Object.freeze([note])
});

describe("DashboardState", () => {
  it("shows recently modified notes first without changing the snapshot and matches frontmatter tags", async () => {
    const tagged = { ...note, path: "小鹿笔记/new.md", mtime: 3000, tags: ["阅读"] };
    const notes = Object.freeze([note, tagged]);
    const read = vi.fn(async () => "unrelated");
    const state = new DashboardState({ ...snapshot, deerNotes: notes }, DEFAULT_SETTINGS, read);
    expect(state.visibleFiles.map(file => file.path)).toEqual([tagged.path, note.path]);
    expect(notes[0]).toBe(note);
    await state.setSearchQuery("#阅读");
    expect(state.visibleFiles).toEqual([tagged]);
    expect(read).not.toHaveBeenCalledWith(tagged.path);
  });
  it("orders fixed and visible root navigation and shows only deer-notes initially", () => {
    const state = new DashboardState(snapshot, DEFAULT_SETTINGS);
    expect(state.navigation.map(item => item.id)).toEqual(["all-notes", "01 收件箱", "10 项目", "overview"]);
    expect(state.visibleFiles.map(item => item.path)).toEqual(["小鹿笔记/Alpha.md"]);
  });

  it("filters folders recursively without matching sibling prefixes", () => {
    const state = new DashboardState(snapshot, DEFAULT_SETTINGS);
    state.selectFolder("01 收件箱");
    expect(state.visibleFiles.map(item => item.path)).toEqual(["01 收件箱/a.md", "01 收件箱/子目录/b.md"]);
    state.selectOverview();
    expect(state.selectedView).toEqual({ kind: "overview" });
    expect(state.visibleFiles).toEqual([]);
    state.selectNotes();
    expect(state.visibleFiles).toEqual([note]);
  });

  it("falls back when a selected folder disappears or is hidden by new settings", () => {
    const state = new DashboardState(snapshot, DEFAULT_SETTINGS);
    state.selectFolder("01 收件箱");
    state.updateSnapshot({ ...snapshot, rootFolders: snapshot.rootFolders.filter(folder => folder.path !== "01 收件箱") });
    expect(state.selectedView).toEqual({ kind: "notes" });
    state.selectFolder("10 项目");
    state.updateSettings({ ...DEFAULT_SETTINGS, hiddenRootFolders: ["10 项目"] });
    expect(state.selectedView).toEqual({ kind: "notes" });
    expect(state.navigation.at(-1)?.id).toBe("overview");
  });

  it.each(["ALPHA", "小鹿笔记", "DESIGN"])("matches descriptor title, path and source without reading bodies: %s", async query => {
    const read = vi.fn(async () => "unrelated");
    const state = new DashboardState(snapshot, DEFAULT_SETTINGS, read);
    await state.setSearchQuery(query);
    expect(state.visibleFiles).toEqual([note]);
    expect(read).not.toHaveBeenCalled();
  });

  it("reads bodies lazily by path and searches case-insensitively", async () => {
    const read = vi.fn(async () => "A HIDDEN thought");
    const state = new DashboardState(snapshot, DEFAULT_SETTINGS, read);
    expect(read).not.toHaveBeenCalled();
    await state.setSearchQuery("hidden");
    expect(state.visibleFiles).toEqual([note]);
    expect(read).toHaveBeenCalledWith("小鹿笔记/Alpha.md");
    await state.setSearchQuery("missing");
    expect(state.visibleFiles).toEqual([]);
  });

  it("does not let a delayed search overwrite a newer query or selection", async () => {
    let resolve!: (text: string) => void;
    const state = new DashboardState(snapshot, DEFAULT_SETTINGS, () => new Promise(done => { resolve = done; }));
    const pending = state.setSearchQuery("old");
    await state.setSearchQuery("ALPHA");
    resolve("old");
    await pending;
    expect(state.searchQuery).toBe("ALPHA");
    expect(state.visibleFiles).toEqual([note]);
    state.selectFolder("01 收件箱");
    expect(state.visibleFiles).toEqual([]);
  });

  it("propagates body read failures so the view can show an error", async () => {
    const state = new DashboardState(snapshot, DEFAULT_SETTINGS, async () => { throw new Error("读取失败"); });
    await expect(state.setSearchQuery("hidden")).rejects.toThrow("读取失败");
  });

  it("cancels pending body search without starting another read or applying its result", async () => {
    let resolve!: (body: string) => void;
    const read = vi.fn(() => new Promise<string>(done => { resolve = done; }));
    const state = new DashboardState(snapshot, DEFAULT_SETTINGS, read);
    state.selectFolder("01 收件箱");
    const pending = state.setSearchQuery("hidden");
    state.cancelSearch();
    resolve("hidden");
    await pending;
    expect(read).toHaveBeenCalledTimes(1);
    expect(state.visibleFiles).toEqual([]);
    await state.setSearchQuery("");
    expect(state.visibleFiles.map(file => file.path)).toEqual(["01 收件箱/a.md", "01 收件箱/子目录/b.md"]);
  });
});
