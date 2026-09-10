import type { TAbstractFile, TFile, TFolder } from "obsidian";
import { parseYaml, stringifyYaml } from "obsidian";

import type { DeerNotesSettings } from "../settings";
import { validateVaultPath } from "../settings";
import {
  appendNoteMarkdown,
  createNoteMarkdown,
  noteTitle,
  parseDeerNote,
  uniqueNotePath
} from "../domain/notes";

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const ATTACHMENT_EXTENSIONS = new Map<string, string>([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/gif", "gif"],
  ["image/webp", "webp"]
]);

export interface NoteVaultAdapter {
  getAbstractFileByPath(path: string): TAbstractFile | null;
  getAllLoadedFiles(): TAbstractFile[];
  createFolder(path: string): Promise<TFolder>;
  create(path: string, data: string): Promise<TFile>;
  createBinary(path: string, data: ArrayBuffer): Promise<TFile>;
  cachedRead(file: TFile): Promise<string>;
  process(file: TFile, transform: (data: string) => string): Promise<string>;
}

export interface QuickNoteInput {
  body: string;
  date: Date;
}

export interface ExcerptNoteInput {
  source: string;
  excerpt: string;
  body: string;
  date: Date;
}

export interface AttachmentInput {
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export class NoteService {
  private readonly notesFolder: string;
  private readonly attachmentsFolder: string;

  constructor(
    private readonly vault: NoteVaultAdapter,
    settings: DeerNotesSettings
  ) {
    this.notesFolder = validateVaultPath(settings.notesFolder);
    this.attachmentsFolder = validateVaultPath(settings.attachmentsFolder);
  }

  async saveQuickNote(input: QuickNoteInput): Promise<TFile> {
    await this.ensureDirectory(this.notesFolder);
    const title = noteTitle(input.body);
    const path = uniqueNotePath(this.notesFolder, title, this.currentVaultPaths());

    return this.vault.create(path, createNoteMarkdown({
      title,
      body: input.body,
      date: input.date
    }));
  }

  async saveExcerptNote(input: ExcerptNoteInput): Promise<TFile> {
    await this.ensureDirectory(this.notesFolder);
    const matching = await this.findMatchingExcerpt(input.source, localDate(input.date));

    if (!matching) {
      const title = noteTitle(input.body);
      const path = uniqueNotePath(this.notesFolder, title, this.currentVaultPaths());
      return this.vault.create(path, createNoteMarkdown({
        title,
        body: input.body,
        source: input.source,
        excerpt: input.excerpt,
        date: input.date
      }));
    }

    await this.vault.process(matching, latest => {
      const meta = parseDeerNote(latest, parseYaml);
      const liveFile = this.vault.getAbstractFileByPath(matching.path);
      if (
        liveFile !== matching ||
        !isMarkdownFile(liveFile) ||
        !isWithinFolder(liveFile.path, this.notesFolder) ||
        !meta ||
        meta.source !== input.source ||
        meta.created !== localDate(input.date)
      ) {
        throw new Error("关联笔记已不再匹配，请重试保存");
      }

      return appendNoteMarkdown(latest, {
        body: input.body,
        excerpt: input.excerpt,
        date: input.date
      }, { parse: parseYaml, stringify: stringifyYaml });
    });
    return matching;
  }

  async saveAttachment(file: AttachmentInput): Promise<string> {
    const extension = ATTACHMENT_EXTENSIONS.get(file.type);
    if (!extension) {
      throw new Error("不支持的附件类型");
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new Error("附件不能超过 20 MiB");
    }

    const attachmentPath = `${this.notesFolder}/${this.attachmentsFolder}`;
    await this.ensureDirectory(attachmentPath);
    const filename = `${crypto.randomUUID()}.${extension}`;
    await this.vault.createBinary(`${attachmentPath}/${filename}`, await file.arrayBuffer());
    return `${this.attachmentsFolder}/${filename}`;
  }

  private async findMatchingExcerpt(source: string, created: string): Promise<TFile | null> {
    for (const entry of this.vault.getAllLoadedFiles()) {
      if (!isMarkdownFile(entry) || !isWithinFolder(entry.path, this.notesFolder)) {
        continue;
      }

      const content = await this.vault.cachedRead(entry);
      const meta = parseDeerNote(content, parseYaml);
      if (meta?.source === source && meta.created === created) {
        return entry;
      }
    }

    return null;
  }

  private currentVaultPaths(): string[] {
    return this.vault.getAllLoadedFiles().map((entry) => entry.path);
  }

  private async ensureDirectory(path: string): Promise<void> {
    const segments = path.split("/");
    for (let index = 1; index <= segments.length; index += 1) {
      const folderPath = segments.slice(0, index).join("/");
      const existing = this.vault.getAbstractFileByPath(folderPath);
      if (!existing) {
        await this.vault.createFolder(folderPath);
        continue;
      }
      if (!isFolder(existing)) {
        throw new Error(`目录路径被文件占用：${folderPath}`);
      }
    }
  }
}

function isMarkdownFile(entry: TAbstractFile): entry is TFile {
  return "extension" in entry && typeof entry.extension === "string" && entry.extension.toLowerCase() === "md";
}

function isFolder(entry: TAbstractFile): entry is TFolder {
  return "children" in entry;
}

function isWithinFolder(path: string, folder: string): boolean {
  return path.startsWith(`${folder}/`);
}

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
