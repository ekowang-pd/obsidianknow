import type { EventRef, TAbstractFile, TFile, TFolder } from "obsidian";

import type { DeerNotesSettings } from "../settings";
import { validateVaultPath } from "../settings";
import { parseDeerNote } from "../domain/notes";

type VaultEvent = "create" | "modify" | "delete" | "rename";

export interface VaultIndexAdapter {
  getRoot(): TFolder;
  getMarkdownFiles(): TFile[];
  cachedRead(file: TFile): Promise<string>;
  on(event: VaultEvent, callback: (...args: any[]) => unknown): EventRef;
  offref(ref: EventRef): void;
}

export interface VaultSnapshot {
  readonly rootFolders: readonly TFolder[];
  readonly markdownFiles: readonly TFile[];
  readonly deerNotes: readonly TFile[];
}

export class VaultIndex {
  private readonly notesFolder: string;
  private readonly rootFolders = new Map<string, TFolder>();
  private readonly markdownFiles = new Map<string, TFile>();
  private readonly deerNotes = new Map<string, TFile>();
  private readonly listeners = new Set<(snapshot: VaultSnapshot) => void>();
  private readonly eventRefs: EventRef[] = [];
  private snapshot: VaultSnapshot = freezeSnapshot([], [], []);
  private initialized = false;
  private disposed = false;

  constructor(
    private readonly vault: VaultIndexAdapter,
    settings: DeerNotesSettings
  ) {
    this.notesFolder = validateVaultPath(settings.notesFolder);
  }

  async initialize(): Promise<void> {
    if (this.disposed) {
      throw new Error("VaultIndex has been disposed");
    }
    if (this.initialized) {
      return;
    }

    for (const child of this.vault.getRoot().children) {
      if (isFolder(child)) {
        this.rootFolders.set(child.path, child);
      }
    }
    for (const file of this.vault.getMarkdownFiles()) {
      this.markdownFiles.set(file.path, file);
      if (isWithinFolder(file.path, this.notesFolder) && parseDeerNote(await this.vault.cachedRead(file))) {
        this.deerNotes.set(file.path, file);
      }
    }

    this.registerEvents();
    this.initialized = true;
    this.publish();
  }

  getSnapshot(): VaultSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: VaultSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const ref of this.eventRefs) {
      this.vault.offref(ref);
    }
    this.eventRefs.length = 0;
    this.listeners.clear();
  }

  private registerEvents(): void {
    this.eventRefs.push(
      this.vault.on("create", async (entry: TAbstractFile) => this.handleCreate(entry)),
      this.vault.on("modify", async (entry: TAbstractFile) => this.handleModify(entry)),
      this.vault.on("delete", async (entry: TAbstractFile) => this.handleDelete(entry)),
      this.vault.on("rename", async (entry: TAbstractFile, oldPath: string) => this.handleRename(entry, oldPath))
    );
  }

  private async handleCreate(entry: TAbstractFile): Promise<void> {
    if (this.disposed) {
      return;
    }

    let changed = false;
    if (isFolder(entry) && isRootFolder(entry.path)) {
      this.rootFolders.set(entry.path, entry);
      changed = true;
    }
    if (isMarkdownFile(entry)) {
      this.markdownFiles.set(entry.path, entry);
      changed = true;
      await this.updateDeerNote(entry);
    }
    if (changed) {
      this.publish();
    }
  }

  private async handleModify(entry: TAbstractFile): Promise<void> {
    if (this.disposed || !isMarkdownFile(entry)) {
      return;
    }

    this.markdownFiles.set(entry.path, entry);
    if (isWithinFolder(entry.path, this.notesFolder)) {
      await this.updateDeerNote(entry);
      this.publish();
    }
  }

  private async handleDelete(entry: TAbstractFile): Promise<void> {
    if (this.disposed) {
      return;
    }

    const changed = isFolder(entry)
      ? this.removeFolder(entry.path)
      : this.removeFile(entry.path);
    if (changed) {
      this.publish();
    }
  }

  private async handleRename(entry: TAbstractFile, oldPath: string): Promise<void> {
    if (this.disposed) {
      return;
    }

    if (isFolder(entry)) {
      const changed = this.removeFolder(oldPath);
      if (isRootFolder(entry.path)) {
        this.rootFolders.set(entry.path, entry);
      }
      if (changed || isRootFolder(entry.path)) {
        this.publish();
      }
      return;
    }
    if (!isMarkdownFile(entry)) {
      return;
    }

    this.removeFile(oldPath);
    this.markdownFiles.set(entry.path, entry);
    await this.updateDeerNote(entry);
    this.publish();
  }

  private async updateDeerNote(file: TFile): Promise<void> {
    if (!isWithinFolder(file.path, this.notesFolder)) {
      this.deerNotes.delete(file.path);
      return;
    }

    if (parseDeerNote(await this.vault.cachedRead(file))) {
      this.deerNotes.set(file.path, file);
    } else {
      this.deerNotes.delete(file.path);
    }
  }

  private removeFile(path: string): boolean {
    const removed = this.markdownFiles.delete(path);
    return this.deerNotes.delete(path) || removed;
  }

  private removeFolder(path: string): boolean {
    let changed = this.rootFolders.delete(path);
    const prefix = `${path}/`;
    for (const key of [...this.markdownFiles.keys()]) {
      if (key === path || key.startsWith(prefix)) {
        changed = this.removeFile(key) || changed;
      }
    }
    return changed;
  }

  private publish(): void {
    this.snapshot = freezeSnapshot(
      [...this.rootFolders.values()],
      [...this.markdownFiles.values()],
      [...this.deerNotes.values()]
    );
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }
}

function freezeSnapshot(
  rootFolders: TFolder[],
  markdownFiles: TFile[],
  deerNotes: TFile[]
): VaultSnapshot {
  return Object.freeze({
    rootFolders: Object.freeze(rootFolders),
    markdownFiles: Object.freeze(markdownFiles),
    deerNotes: Object.freeze(deerNotes)
  });
}

function isFolder(entry: TAbstractFile): entry is TFolder {
  return "children" in entry;
}

function isMarkdownFile(entry: TAbstractFile): entry is TFile {
  return "extension" in entry && typeof entry.extension === "string" && entry.extension.toLowerCase() === "md";
}

function isRootFolder(path: string): boolean {
  return Boolean(path) && !path.includes("/");
}

function isWithinFolder(path: string, folder: string): boolean {
  return path.startsWith(`${folder}/`);
}
