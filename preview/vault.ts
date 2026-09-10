export interface PreviewFile {
  path: string; name: string; basename: string; extension: string; content: string; dataUrl?: string;
  stat: { ctime: number; mtime: number; size: number };
}
interface PreviewFolder { path: string; name: string; children: Entry[] }
type Entry = PreviewFile | PreviewFolder;
interface StoredEntry { path: string; folder?: boolean; content?: string; dataUrl?: string; ctime?: number; mtime?: number }
export const STORAGE_KEY = 'deer-notes-browser-preview-v1';

export class PreviewVault {
  private entries = new Map<string, Entry>();
  private root: PreviewFolder = { path: '', name: '', children: [] };
  private listeners = new Set<{ event: string; callback: (...args: any[]) => unknown }>();
  private writes = new Map<string, Promise<unknown>>();
  beforeWrite: () => Promise<void> = async () => {};
  constructor(private storage: Storage, seed: StoredEntry[]) {
    const saved = storage.getItem(STORAGE_KEY);
    const records: StoredEntry[] = saved ? JSON.parse(saved) : seed;
    for (const record of records) {
      if (record.folder) this.entries.set(record.path, { path: record.path, name: record.path.split('/').pop()!, children: [] });
      else this.entries.set(record.path, this.makeFile(record.path, record.content ?? '', record.dataUrl, record.ctime, record.mtime));
    }
    this.rebuildFolders();
  }
  getRoot(): PreviewFolder { return this.root; }
  getAbstractFileByPath(path: string): Entry | null { return path === '' ? this.root : this.entries.get(path) ?? null; }
  getAllLoadedFiles(): Entry[] { return [...this.entries.values()]; }
  getMarkdownFiles(): PreviewFile[] { return this.getAllLoadedFiles().filter((file): file is PreviewFile => 'extension' in file && file.extension === 'md'); }
  async cachedRead(file: PreviewFile): Promise<string> { return file.content; }
  on(event: string, callback: (...args: any[]) => unknown) { const ref = { event, callback }; this.listeners.add(ref); return ref; }
  offref(ref: { event: string; callback: (...args: any[]) => unknown }): void { this.listeners.delete(ref); }
  async createFolder(path: string): Promise<PreviewFolder> {
    if (this.entries.has(path)) throw new Error('目录已存在');
    const folder = { path, name: path.split('/').pop()!, children: [] };
    this.persist(new Map(this.entries).set(path, folder)); this.entries.set(path, folder); this.rebuildFolders(); this.emit('create', folder); return folder;
  }
  async create(path: string, content: string): Promise<PreviewFile> {
    await this.beforeWrite();
    if (this.entries.has(path)) throw new Error('文件已存在，请重试');
    const file = this.makeFile(path, content); this.addFile(file); return file;
  }
  async createBinary(path: string, data: ArrayBuffer): Promise<PreviewFile> {
    await this.beforeWrite();
    if (this.entries.has(path)) throw new Error('附件已存在');
    const type = ({ png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' } as Record<string, string>)[path.split('.').pop()!] ?? '';
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(new Blob([data], { type }));
    });
    const file = this.makeFile(path, '', dataUrl); this.addFile(file); return file;
  }
  async process(file: PreviewFile, transform: (body: string) => string): Promise<string> {
    const pending = (this.writes.get(file.path) ?? Promise.resolve()).catch(() => {}).then(async () => {
      await this.beforeWrite();
      if (this.entries.get(file.path) !== file) throw new Error('文件已移动');
      const content = transform(file.content);
      const next = { ...file, content, stat: { ...file.stat, mtime: Date.now(), size: content.length } };
      this.persist(new Map(this.entries).set(file.path, next)); Object.assign(file, next); this.emit('modify', file); return content;
    });
    this.writes.set(file.path, pending);
    try { return await pending; } finally { if (this.writes.get(file.path) === pending) this.writes.delete(file.path); }
  }
  resource(path: string, source: string): string | undefined {
    const decoded = decodeURI(path); const folder = source.slice(0, source.lastIndexOf('/') + 1);
    const file = this.entries.get(folder + decoded) ?? this.entries.get(decoded);
    return file && 'extension' in file ? file.dataUrl : undefined;
  }
  resolveLink(path: string, source: string): string | undefined {
    const plain = path.split('#')[0]; if (!plain) return source;
    const folder = source.slice(0, source.lastIndexOf('/') + 1);
    return [plain, plain + '.md', folder + plain, folder + plain + '.md'].find(candidate => this.entries.has(candidate));
  }
  private makeFile(path: string, content: string, dataUrl?: string, ctime = Date.now(), mtime = ctime): PreviewFile {
    const name = path.split('/').pop()!; const dot = name.lastIndexOf('.');
    return { path, name, basename: name.slice(0, dot), extension: name.slice(dot + 1).toLowerCase(), content, dataUrl, stat: { ctime, mtime, size: content.length } };
  }
  private addFile(file: PreviewFile): void { this.persist(new Map(this.entries).set(file.path, file)); this.entries.set(file.path, file); this.rebuildFolders(); this.emit('create', file); }
  private persist(entries: Map<string, Entry>): void {
    const data = [...entries.values()].map(entry => 'children' in entry ? { path: entry.path, folder: true } : { path: entry.path, content: entry.content, dataUrl: entry.dataUrl, ctime: entry.stat.ctime, mtime: entry.stat.mtime });
    try { this.storage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch { throw new Error('浏览器存储不足，内容尚未保存；可先导出笔记，或使用更小的图片'); }
  }
  private rebuildFolders(): void {
    this.root.children = []; for (const entry of this.entries.values()) if ('children' in entry) entry.children = [];
    for (const entry of this.entries.values()) {
      const parentPath = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '';
      const parent = parentPath ? this.entries.get(parentPath) : this.root;
      if (parent && 'children' in parent) parent.children.push(entry);
    }
  }
  private emit(event: string, entry: Entry): void { for (const listener of this.listeners) if (listener.event === event) listener.callback(entry); }
}
