import type { EventRef, TAbstractFile, TFile, TFolder } from "obsidian";
import { parseYaml } from "obsidian";

import type { DeerNoteMeta } from "../domain/notes";
import { parseDeerNote } from "../domain/notes";
import type { DeerNotesSettings } from "../settings";
import { validateVaultPath } from "../settings";

type VaultEvent = "create" | "modify" | "delete" | "rename";

export interface VaultIndexAdapter {
  getRoot(): TFolder;
  getMarkdownFiles(): TFile[];
  getAbstractFileByPath(path: string): TAbstractFile | null;
  cachedRead(file: TFile): Promise<string>;
  on(event: Exclude<VaultEvent, "rename">, callback: (entry: TAbstractFile) => unknown): EventRef;
  on(event: "rename", callback: (entry: TAbstractFile, oldPath: string) => unknown): EventRef;
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
  readonly ctime: number;
  readonly mtime: number;
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

interface DeerNoteRead {
  current: boolean;
  meta: DeerNoteMeta | null;
}

interface FileState {
  file: TFile;
  path: string;
  extension: string;
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
  private initialization: Promise<void> | null = null;
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

    if (!this.initialization) {
      const lifecycle = this.lifecycle;
      let releaseScan!: () => void;
      this.eventQueue = new Promise<void>(resolve => { releaseScan = resolve; });
      this.registerEvents();
      this.initialization = this.scan(lifecycle).then(async () => {
        releaseScan();
        // Events observed during the scan must finish before the first snapshot.
        let pending: Promise<void>;
        do {
          pending = this.eventQueue;
          await pending;
        } while (this.isActive(lifecycle) && pending !== this.eventQueue);
        if (this.isActive(lifecycle)) {
          this.initialized = true;
          this.publish();
        }
      }).catch(error => {
        if (this.isActive(lifecycle)) {
          this.lifecycle += 1;
          this.unregisterEvents();
          this.initialization = null;
        }
        releaseScan();
        throw error;
      });
    }
    await this.initialization;
  }

  private async scan(lifecycle: number): Promise<void> {
    const rootFolders = new Map<string, TFolder>();
    const markdownFiles = new Map<string, TFile>();
    const deerNotes = new Map<string, IndexedDeerNote>();

    for (const child of this.vault.getRoot().children) {
      if (isFolder(child)) {
        rootFolders.set(child.path, child);
      }
    }
    for (const file of this.vault.getMarkdownFiles()) {
      const read = await this.readDeerNote(file);
      if (!this.isActive(lifecycle)) {
        return;
      }
      if (read.current) {
        markdownFiles.set(file.path, file);
        if (read.meta) {
          deerNotes.set(file.path, { file, meta: read.meta });
        }
      }
    }
    if (!this.isActive(lifecycle)) {
      return;
    }

    replaceMap(this.rootFolders, rootFolders);
    replaceMap(this.markdownFiles, markdownFiles);
    replaceMap(this.deerNotes, deerNotes);
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
    this.unregisterEvents();
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

  private unregisterEvents(): void {
    for (const ref of this.eventRefs) this.vault.offref(ref);
    this.eventRefs.length = 0;
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

    const read = await this.readDeerNote(entry);
    if (!this.isActive(lifecycle) || !read.current) {
      return;
    }
    this.replaceMarkdownFile(entry, read.meta);
    this.publish();
  }

  private async handleModify(entry: TAbstractFile, lifecycle: number): Promise<void> {
    if (!this.isActive(lifecycle) || !isMarkdownFile(entry)) {
      return;
    }

    const read = await this.readDeerNote(entry);
    if (!this.isActive(lifecycle) || !read.current) {
      return;
    }
    this.replaceMarkdownFile(entry, read.meta);
    this.publish();
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

    const file = isFile(entry) ? entry : null;
    const read = file && isMarkdownFile(file)
      ? await this.readDeerNote(file)
      : { current: false, meta: null };
    if (!this.isActive(lifecycle)) {
      return;
    }
    const removed = this.removeFile(oldPath, file ?? undefined);
    if (read.current && file) {
      this.replaceMarkdownFile(file, read.meta);
    }
    if (removed || read.current) {
      this.publish();
    }
  }

  private async renameFolder(folder: TFolder, oldPath: string, lifecycle: number): Promise<void> {
    const prefix = `${oldPath}/`;
    const descendants = new Map([...this.markdownFiles.entries()]
      .filter(([path]) => path.startsWith(prefix)).map(([path, file]) => [file, path]));
    // A descendant renamed during its first read may not be indexed yet.
    for (const file of markdownDescendants(folder)) {
      if (!descendants.has(file)) descendants.set(file, file.path);
    }
    const updated = await Promise.all([...descendants].map(async ([file, oldFilePath]) => ({
      oldFilePath,
      file,
      read: await this.readDeerNote(file)
    })));
    if (!this.isActive(lifecycle)) {
      return;
    }

    let changed = this.rootFolders.delete(oldPath);
    if (isRootFolder(folder.path)) {
      this.rootFolders.set(folder.path, folder);
      changed = true;
    }
    for (const { oldFilePath, file, read } of updated) {
      this.removeFile(oldFilePath, file);
      if (read.current) {
        this.replaceMarkdownFile(file, read.meta);
      }
      changed = true;
    }
    if (changed) {
      this.publish();
    }
  }

  private async readDeerNote(file: TFile): Promise<DeerNoteRead> {
    const state = captureFileState(file);
    if (!isWithinFolder(state.path, this.notesFolder)) {
      return { current: this.isCurrentMarkdownFile(state), meta: null };
    }
    try {
      const meta = parseDeerNote(await this.vault.cachedRead(file), parseYaml);
      return { current: this.isCurrentMarkdownFile(state), meta };
    } catch (error) {
      if (!this.isCurrentMarkdownFile(state)) return { current: false, meta: null };
      throw error;
    }
  }

  private replaceMarkdownFile(file: TFile, meta: DeerNoteMeta | null): void {
    this.removeFileByIdentity(file);
    this.markdownFiles.set(file.path, file);
    if (meta) {
      this.deerNotes.set(file.path, { file, meta });
    }
  }

  private removeFile(path: string, file?: TFile): boolean {
    const removed = this.markdownFiles.delete(path);
    const removedDeer = this.deerNotes.delete(path);
    return this.removeFileByIdentity(file) || removedDeer || removed;
  }

  private removeFileByIdentity(file: TFile | undefined): boolean {
    if (!file) {
      return false;
    }
    let removed = false;
    for (const [path, indexed] of this.markdownFiles) {
      if (indexed === file) {
        this.markdownFiles.delete(path);
        removed = true;
      }
    }
    for (const [path, indexed] of this.deerNotes) {
      if (indexed.file === file) {
        this.deerNotes.delete(path);
        removed = true;
      }
    }
    return removed;
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

  private isCurrentMarkdownFile(state: FileState): boolean {
    return isMarkdownFile(state.file) &&
      state.file.path === state.path &&
      state.file.extension === state.extension &&
      this.vault.getAbstractFileByPath(state.path) === state.file;
  }

  private publish(): void {
    if (!this.initialized) return;
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
  return Object.freeze({ path: file.path, name, basename, extension, ctime: file.stat.ctime, mtime: file.stat.mtime });
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

function captureFileState(file: TFile): FileState {
  return { file, path: file.path, extension: file.extension };
}

function isFolder(entry: TAbstractFile): entry is TFolder {
  return "children" in entry;
}

function markdownDescendants(folder: TFolder): TFile[] {
  return folder.children.flatMap(entry => isFolder(entry) ? markdownDescendants(entry) : isMarkdownFile(entry) ? [entry] : []);
}

function isMarkdownFile(entry: TAbstractFile): entry is TFile {
  return isFile(entry) && entry.extension.toLowerCase() === "md";
}

function isFile(entry: TAbstractFile): entry is TFile {
  return "extension" in entry && typeof entry.extension === "string";
}

function isRootFolder(path: string): boolean {
  return Boolean(path) && !path.includes("/");
}

function isWithinFolder(path: string, folder: string): boolean {
  return path.startsWith(`${folder}/`);
}
