import { describe, expect, it } from "vitest";
import type { EventRef, TAbstractFile, TFile, TFolder } from "obsidian";

import { DEFAULT_SETTINGS } from "../src/settings";
import { VaultIndex, type VaultIndexAdapter } from "../src/services/vault-index";

interface MemoryFile extends TFile {
  content: string;
}

interface MemoryFolder extends TFolder {
  children: TAbstractFile[];
}

type VaultEvent = "create" | "modify" | "delete" | "rename";
type Listener = (...args: any[]) => unknown;

class MemoryIndexVault implements VaultIndexAdapter {
  readonly reads: string[] = [];
  readonly released: EventRef[] = [];
  private readonly entries = new Map<string, TAbstractFile>();
  private readonly listeners = new Map<VaultEvent, Set<Listener>>();
  private readonly root = { path: "", children: [] } as unknown as MemoryFolder;
  private deferNextRead = false;
  private releaseRead: (() => void) | undefined;

  getRoot(): TFolder {
    return this.root;
  }

  getMarkdownFiles(): TFile[] {
    return [...this.entries.values()].filter((entry): entry is TFile => (
      "extension" in entry && typeof entry.extension === "string" && entry.extension.toLowerCase() === "md"
    ));
  }

  async cachedRead(file: TFile): Promise<string> {
    this.reads.push(file.path);
    if (this.deferNextRead) {
      this.deferNextRead = false;
      await new Promise<void>((resolve) => {
        this.releaseRead = resolve;
      });
      this.releaseRead = undefined;
    }
    return (file as MemoryFile).content;
  }

  on(event: VaultEvent, listener: Listener): EventRef {
    const listeners = this.listeners.get(event) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return { event, listener } as EventRef;
  }

  offref(ref: EventRef): void {
    this.released.push(ref);
    const { event, listener } = ref as EventRef & { event: VaultEvent; listener: Listener };
    this.listeners.get(event)?.delete(listener);
  }

  addFolder(path: string): TFolder {
    const folder = { path, children: [] } as unknown as MemoryFolder;
    this.entries.set(path, folder);
    this.refreshChildren();
    return folder;
  }

  addMarkdown(path: string, content: string): TFile {
    const file = this.makeFile(path, content);
    this.entries.set(path, file);
    this.refreshChildren();
    return file;
  }

  async emitCreate(file: TAbstractFile): Promise<void> {
    await this.emit("create", file);
  }

  async emitModify(file: TAbstractFile): Promise<void> {
    await this.emit("modify", file);
  }

  async emitDelete(file: TAbstractFile): Promise<void> {
    this.entries.delete(file.path);
    this.refreshChildren();
    await this.emit("delete", file);
  }

  async emitRename(file: TAbstractFile, oldPath: string, newPath: string): Promise<void> {
    this.entries.delete(oldPath);
    (file as { path: string }).path = newPath;
    if ("extension" in file) {
      (file as { extension: string }).extension = newPath.split(".").pop() ?? "";
    }
    this.entries.set(newPath, file);
    this.refreshChildren();
    await this.emit("rename", file, oldPath);
  }

  async emitFolderRename(folder: TFolder, oldPath: string, newPath: string): Promise<void> {
    const entries = [...this.entries.entries()];
    for (const [path, entry] of entries) {
      if (path === oldPath || path.startsWith(`${oldPath}/`)) {
        this.entries.delete(path);
        (entry as { path: string }).path = `${newPath}${path.slice(oldPath.length)}`;
        this.entries.set(entry.path, entry);
      }
    }
    this.refreshChildren();
    await this.emit("rename", folder, oldPath);
  }

  deferOneRead(): () => void {
    this.deferNextRead = true;
    return () => this.releaseRead?.();
  }

  listenerCount(): number {
    return [...this.listeners.values()].reduce((count, listeners) => count + listeners.size, 0);
  }

  private makeFile(path: string, content: string): MemoryFile {
    const basename = path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? path;
    return { path, basename, extension: "md", content } as MemoryFile;
  }

  private refreshChildren(): void {
    this.root.children = [...this.entries.values()].filter((entry) => !entry.path.includes("/"));
  }

  private async emit(event: VaultEvent, ...args: any[]): Promise<void> {
    for (const listener of this.listeners.get(event) ?? []) {
      await listener(...args);
    }
  }
}

const deerNote = (title: string) => `---
type: deer-note
created: "2026-09-10"
updated: "2026-09-10"
source: ""
tags: []
---

# ${title}
`;

describe("VaultIndex", () => {
  it("initializes an immutable snapshot without writes and reads only notes-folder Markdown to identify deer-notes", async () => {
    const vault = new MemoryIndexVault();
    vault.addFolder("01 收件箱");
    vault.addFolder("小鹿笔记");
    vault.addMarkdown("01 收件箱/原文.md", "# 原文");
    vault.addMarkdown("小鹿笔记/插件笔记.md", deerNote("插件笔记"));
    vault.addMarkdown("小鹿笔记/用户笔记.md", "# 用户笔记");
    const index = new VaultIndex(vault, DEFAULT_SETTINGS);
    const snapshots = [] as ReturnType<typeof index.getSnapshot>[];
    index.subscribe((snapshot) => snapshots.push(snapshot));

    await index.initialize();

    expect(index.getSnapshot().rootFolders.map((folder) => folder.path)).toEqual(["01 收件箱", "小鹿笔记"]);
    expect(index.getSnapshot().markdownFiles.map((file) => file.path)).toEqual([
      "01 收件箱/原文.md",
      "小鹿笔记/插件笔记.md",
      "小鹿笔记/用户笔记.md"
    ]);
    expect(index.getSnapshot().deerNotes.map((file) => file.path)).toEqual(["小鹿笔记/插件笔记.md"]);
    expect(vault.reads).toEqual(["小鹿笔记/插件笔记.md", "小鹿笔记/用户笔记.md"]);
    expect(Object.isFrozen(index.getSnapshot())).toBe(true);
    expect(Object.isFrozen(index.getSnapshot().markdownFiles)).toBe(true);
    expect(snapshots).toHaveLength(1);
  });

  it("updates snapshots incrementally for root folders and Markdown create, modify, rename, and delete events", async () => {
    const vault = new MemoryIndexVault();
    vault.addFolder("小鹿笔记");
    const existing = vault.addMarkdown("小鹿笔记/a.md", deerNote("A"));
    const index = new VaultIndex(vault, DEFAULT_SETTINGS);
    await index.initialize();
    const snapshots = [] as ReturnType<typeof index.getSnapshot>[];
    index.subscribe((snapshot) => snapshots.push(snapshot));

    const project = vault.addFolder("10 项目");
    await vault.emitCreate(project);
    expect(snapshots).toHaveLength(1);
    expect(snapshots.at(-1)?.rootFolders.map((folder) => folder.path)).toContain("10 项目");

    const next = vault.addMarkdown("小鹿笔记/b.md", "# 用户笔记");
    await vault.emitCreate(next);
    expect(snapshots).toHaveLength(2);
    expect(snapshots.at(-1)?.deerNotes.map((file) => file.path)).toEqual(["小鹿笔记/a.md"]);

    (next as MemoryFile).content = deerNote("B");
    await vault.emitModify(next);
    expect(snapshots).toHaveLength(3);
    expect(snapshots.at(-1)?.deerNotes.map((file) => file.path)).toEqual(["小鹿笔记/a.md", "小鹿笔记/b.md"]);

    await vault.emitRename(existing, "小鹿笔记/a.md", "小鹿笔记/renamed.md");
    expect(snapshots).toHaveLength(4);
    expect(snapshots.at(-1)?.markdownFiles.map((file) => file.path)).toContain("小鹿笔记/renamed.md");

    await vault.emitDelete(next);
    expect(snapshots).toHaveLength(5);
    expect(snapshots.at(-1)?.deerNotes.map((file) => file.path)).toEqual(["小鹿笔记/renamed.md"]);
  });

  it("unsubscribes listeners and makes repeated initialization/disposal safe", async () => {
    const vault = new MemoryIndexVault();
    vault.addFolder("小鹿笔记");
    const index = new VaultIndex(vault, DEFAULT_SETTINGS);
    const snapshots = [] as ReturnType<typeof index.getSnapshot>[];
    const unsubscribe = index.subscribe((snapshot) => snapshots.push(snapshot));

    await index.initialize();
    await index.initialize();
    expect(snapshots).toHaveLength(1);
    unsubscribe();
    index.dispose();
    index.dispose();

    const file = vault.addMarkdown("小鹿笔记/after-dispose.md", deerNote("After"));
    await vault.emitCreate(file);
    expect(snapshots).toHaveLength(1);
    await expect(index.initialize()).rejects.toThrow("disposed");
  });

  it("remaps folder-rename descendants and re-evaluates deer-note membership", async () => {
    const vault = new MemoryIndexVault();
    const oldFolder = vault.addFolder("暂存") as TFolder;
    vault.addMarkdown("暂存/原文.md", deerNote("Moved"));
    const index = new VaultIndex(vault, DEFAULT_SETTINGS);
    await index.initialize();

    await vault.emitFolderRename(oldFolder, "暂存", "小鹿笔记");

    expect(index.getSnapshot().markdownFiles.map((file) => file.path)).toEqual(["小鹿笔记/原文.md"]);
    expect(index.getSnapshot().deerNotes.map((file) => file.path)).toEqual(["小鹿笔记/原文.md"]);
  });

  it("removes the old entry when a Markdown file is renamed to a non-Markdown path", async () => {
    const vault = new MemoryIndexVault();
    vault.addFolder("小鹿笔记");
    const file = vault.addMarkdown("小鹿笔记/a.md", deerNote("A"));
    const index = new VaultIndex(vault, DEFAULT_SETTINGS);
    await index.initialize();

    await vault.emitRename(file, "小鹿笔记/a.md", "小鹿笔记/a.txt");

    expect(index.getSnapshot().markdownFiles).toEqual([]);
    expect(index.getSnapshot().deerNotes).toEqual([]);
  });

  it("serializes delayed classifications so a later delete cannot be undone by an older modify", async () => {
    const vault = new MemoryIndexVault();
    vault.addFolder("小鹿笔记");
    const file = vault.addMarkdown("小鹿笔记/a.md", "# 用户笔记");
    const index = new VaultIndex(vault, DEFAULT_SETTINGS);
    await index.initialize();
    (file as MemoryFile).content = deerNote("A");
    const releaseRead = vault.deferOneRead();

    const modifying = vault.emitModify(file);
    await Promise.resolve();
    const deleting = vault.emitDelete(file);
    releaseRead();
    await Promise.all([modifying, deleting]);

    expect(index.getSnapshot().markdownFiles).toEqual([]);
    expect(index.getSnapshot().deerNotes).toEqual([]);
  });

  it("does not register, publish, or retain event listeners when disposed during initialization", async () => {
    const vault = new MemoryIndexVault();
    vault.addFolder("小鹿笔记");
    vault.addMarkdown("小鹿笔记/a.md", deerNote("A"));
    const index = new VaultIndex(vault, DEFAULT_SETTINGS);
    const snapshots = [] as ReturnType<typeof index.getSnapshot>[];
    index.subscribe((snapshot) => snapshots.push(snapshot));
    const releaseRead = vault.deferOneRead();

    const initializing = index.initialize();
    await Promise.resolve();
    index.dispose();
    releaseRead();
    await initializing;

    expect(snapshots).toEqual([]);
    expect(index.getSnapshot().markdownFiles).toEqual([]);
    expect(vault.listenerCount()).toBe(0);
    expect(vault.released).toHaveLength(0);
  });

  it("does not publish or mutate a snapshot when disposed during a delayed modify", async () => {
    const vault = new MemoryIndexVault();
    vault.addFolder("小鹿笔记");
    const file = vault.addMarkdown("小鹿笔记/a.md", deerNote("A"));
    const index = new VaultIndex(vault, DEFAULT_SETTINGS);
    await index.initialize();
    const before = index.getSnapshot();
    const releaseRead = vault.deferOneRead();
    (file as MemoryFile).content = "# 已转为用户笔记";

    const modifying = vault.emitModify(file);
    await Promise.resolve();
    index.dispose();
    releaseRead();
    await modifying;

    expect(index.getSnapshot()).toBe(before);
    expect(index.getSnapshot().deerNotes.map((entry) => entry.path)).toEqual(["小鹿笔记/a.md"]);
    expect(vault.released).toHaveLength(4);
  });

  it("publishes deeply frozen value descriptors whose old paths do not mutate after rename", async () => {
    const vault = new MemoryIndexVault();
    vault.addFolder("小鹿笔记");
    const file = vault.addMarkdown("小鹿笔记/a.md", deerNote("A"));
    const index = new VaultIndex(vault, DEFAULT_SETTINGS);
    await index.initialize();
    const beforeRename = index.getSnapshot();

    expect(Object.isFrozen(beforeRename.markdownFiles[0])).toBe(true);
    expect(Object.isFrozen(beforeRename.deerNotes[0])).toBe(true);
    await vault.emitRename(file, "小鹿笔记/a.md", "小鹿笔记/b.md");

    expect(beforeRename.markdownFiles[0]?.path).toBe("小鹿笔记/a.md");
    expect(index.getSnapshot().markdownFiles[0]?.path).toBe("小鹿笔记/b.md");
  });
});
