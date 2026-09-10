import type { EventRef, TAbstractFile, TFile, TFolder } from "obsidian";

import type { DeerNoteMeta } from "../domain/notes";
import { parseDeerNote } from "../domain/notes";
import type { DeerNotesSettings } from "../settings";
import { validateVaultPath } from "../settings";

type VaultEvent = "create" | "modify" | "delete" | "rename";

export interface VaultIndexAdapter {
  getRoot(): TFolder;
  getMarkdownFiles(): TFile[];
  cachedRead(file: TFile): Promise<string>;
  on(event: VaultEvent, callback: (...args: any[]) => unknown): EventRef;
  offref(ref: EventRef): void;
}

export interface VaultFolderDescriptor {
  readonly path: string;
  readonly name: string;
}

export interface VaultFileDescriptor {
  readonly path: string;
  readonly name: string;
  readonly basename: string;
  readonly extension: string;
}

export interface DeerNoteDescriptor extends VaultFileDescriptor {
  readonly title: string;
  readonly created: string;
  readonly updated: string;
  readonly source: string;
  readonly tags: readonly string[];
}

export interface VaultSnapshot {
  readonly rootFolders: readonly VaultFolderDescriptor[];
  readonly markdownFiles: readonly VaultFileDescriptor[];
  readonly deerNotes: readonly DeerNoteDescriptor[];
}

interface IndexedDeerNote {
  file: TFile;
  meta: DeerNoteMeta;
}

export class VaultIndex {
  private readonly notesFolder: string;
  private readonly rootFolders = new Map<string, TFolder>();
  private readonly markdownFiles = new Map<string, TFile>();
  private readonly deerNotes = new Map<string, IndexedDeerNote>();
  private readonly listeners = new Set<(snapshot: VaultSnapshot) => void>();
  private readonly eventRefs: EventRef[] = [];
  private snapshot: VaultSnapshot = freezeSnapshot([], [], []);
  private eventQueue: Promise<void> = Promise.resolve();
  private initialized = false;
  private disposed = false;
  private lifecycle = 0;

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

    const lifecycle = this.lifecycle;
    const rootFolders = new Map<string, TFolder>();
    const markdownFiles = new Map<string, TFile>();
    const deerNotes = new Map<string, IndexedDeerNote>();

    for (const child of this.vault.getRoot().children) {
      if (isFolder(child)) {
        rootFolders.set(child.path, child);
      }
    }
    for (const file of this.vault.getMarkdownFiles()) {
      markdownFiles.set(file.path, file);
      const meta = await this.readDeerNote(file);
      if (!this.isActive(lifecycle)) {
        return;
      }
      if (meta) {
        deerNotes.set(file.path, { file, meta });
      }
    }
    if (!this.isActive(lifecycle)) {
      return;
    }

    replaceMap(this.rootFolders, rootFolders);
    replaceMap(this.markdownFiles, markdownFiles);
    replaceMap(this.deerNotes, deerNotes);
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
    this.lifecycle += 1;
    for (const ref of this.eventRefs) {
      this.vault.offref(ref);
    }
    this.eventRefs.length = 0;
    this.listeners.clear();
  }

  private registerEvents(): void {
    this.eventRefs.push(
      this.vault.on("create", (entry: TAbstractFile) => this.enqueue((lifecycle) => this.handleCreate(entry, lifecycle))),
      this.vault.on("modify", (entry: TAbstractFile) => this.enqueue((lifecycle) => this.handleModify(entry, lifecycle))),
      this.vault.on("delete", (entry: TAbstractFile) => this.enqueue((lifecycle) => this.handleDelete(entry, lifecycle))),
      this.vault.on("rename", (entry: TAbstractFile, oldPath: string) => this.enqueue((lifecycle) => this.handleRename(entry, oldPath, lifecycle)))
    );
  }

  private enqueue(operation: (lifecycle: number) => Promise<void>): Promise<void> {
    const lifecycle = this.lifecycle;
    const pending = this.eventQueue.then(() => operation(lifecycle));
    this.eventQueue = pending.catch(() => undefined);
    return pending;
  }

  private async handleCreate(entry: TAbstractFile, lifecycle: number): Promise<void> {
    if (!this.isActive(lifecycle)) {
      return;
    }
    if (isFolder(entry) && isRootFolder(entry.path)) {
      this.rootFolders.set(entry.path, entry);
      this.publish();
      return;
    }
    if (!isMarkdownFile(entry)) {
      return;
    }

    const meta = await this.readDeerNote(entry);
    if (!this.isActive(lifecycle)) {
      return;
    }
    this.markdownFiles.set(entry.path, entry);
    this.setDeerNote(entry, meta);
    this.publish();
  }

  private async handleModify(entry: TAbstractFile, lifecycle: number): Promise<void> {
    if (!this.isActive(lifecycle) || !isMarkdownFile(entry)) {
      return;
    }

    const meta = await this.readDeerNote(entry);
    if (!this.isActive(lifecycle)) {
      return;
    }
    this.markdownFiles.set(entry.path, entry);
    this.setDeerNote(entry, meta);
    if (isWithinFolder(entry.path, this.notesFolder)) {
      this.publish();
    }
  }

  private async handleDelete(entry: TAbstractFile, lifecycle: number): Promise<void> {
    if (!this.isActive(lifecycle)) {
      return;
    }

    const changed = isFolder(entry)
      ? this.removeFolder(entry.path)
      : this.removeFile(entry.path);
    if (changed) {
      this.publish();
    }
  }

  private async handleRename(entry: TAbstractFile, oldPath: string, lifecycle: number): Promise<void> {
    if (!this.isActive(lifecycle)) {
      return;
    }
    if (isFolder(entry)) {
      await this.renameFolder(entry, oldPath, lifecycle);
      return;
    }

    const meta = isMarkdownFile(entry) ? await this.readDeerNote(entry) : null;
    if (!this.isActive(lifecycle)) {
      return;
    }
    const removed = this.removeFile(oldPath);
    if (isMarkdownFile(entry)) {
      this.markdownFiles.set(entry.path, entry);
      this.setDeerNote(entry, meta);
    }
    if (removed || isMarkdownFile(entry)) {
      this.publish();
    }
  }

  private async renameFolder(folder: TFolder, oldPath: string, lifecycle: number): Promise<void> {
    const prefix = `${oldPath}/`;
    const descendants = [...this.markdownFiles.entries()]
      .filter(([path]) => path.startsWith(prefix));
    const updated = await Promise.all(descendants.map(async ([oldFilePath, file]) => ({
      oldFilePath,
      file,
      meta: await this.readDeerNote(file)
    })));
    if (!this.isActive(lifecycle)) {
      return;
    }

    let changed = this.rootFolders.delete(oldPath);
    if (isRootFolder(folder.path)) {
      this.rootFolders.set(folder.path, folder);
      changed = true;
    }
    for (const { oldFilePath, file, meta } of updated) {
      this.removeFile(oldFilePath);
      this.markdownFiles.set(file.path, file);
      this.setDeerNote(file, meta);
      changed = true;
    }
    if (changed) {
      this.publish();
    }
  }

  private async readDeerNote(file: TFile): Promise<DeerNoteMeta | null> {
    if (!isWithinFolder(file.path, this.notesFolder)) {
      return null;
    }
    return parseDeerNote(await this.vault.cachedRead(file));
  }

  private setDeerNote(file: TFile, meta: DeerNoteMeta | null): void {
    if (meta) {
      this.deerNotes.set(file.path, { file, meta });
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

  private isActive(lifecycle: number): boolean {
    return !this.disposed && lifecycle === this.lifecycle;
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

function replaceMap<K, V>(target: Map<K, V>, source: Map<K, V>): void {
  target.clear();
  for (const [key, value] of source) {
    target.set(key, value);
  }
}

function freezeSnapshot(
  rootFolders: TFolder[],
  markdownFiles: TFile[],
  deerNotes: IndexedDeerNote[]
): VaultSnapshot {
  return Object.freeze({
    rootFolders: Object.freeze(rootFolders.map(folderDescriptor)),
    markdownFiles: Object.freeze(markdownFiles.map(fileDescriptor)),
    deerNotes: Object.freeze(deerNotes.map(deerNoteDescriptor))
  });
}

function folderDescriptor(folder: TFolder): VaultFolderDescriptor {
  return Object.freeze({ path: folder.path, name: pathName(folder.path) });
}

function fileDescriptor(file: TFile): VaultFileDescriptor {
  const extension = file.extension;
  const name = pathName(file.path);
  const suffix = extension ? `.${extension}` : "";
  const basename = suffix && name.toLowerCase().endsWith(suffix.toLowerCase())
    ? name.slice(0, -suffix.length)
    : name;
  return Object.freeze({ path: file.path, name, basename, extension });
}

function deerNoteDescriptor({ file, meta }: IndexedDeerNote): DeerNoteDescriptor {
  return Object.freeze({
    ...fileDescriptor(file),
    title: meta.title,
    created: meta.created,
    updated: meta.updated,
    source: meta.source,
    tags: Object.freeze([...meta.tags])
  });
}

function pathName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
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
