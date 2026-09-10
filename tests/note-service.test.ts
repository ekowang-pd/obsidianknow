import { describe, expect, it } from "vitest";
import type { EventRef, TAbstractFile, TFile, TFolder } from "obsidian";

import { DEFAULT_SETTINGS } from "../src/settings";
import {
  NoteService,
  type AttachmentInput,
  type NoteVaultAdapter
} from "../src/services/note-service";

interface MemoryFile extends TFile {
  content: string;
  binary?: ArrayBuffer;
}

interface MemoryFolder extends TFolder {
  children: TAbstractFile[];
}

class MemoryVault implements NoteVaultAdapter {
  readonly calls: string[] = [];
  readonly reads: string[] = [];
  private readonly entries = new Map<string, TAbstractFile>();
  private readonly root = { path: "", children: [] } as unknown as MemoryFolder;
  beforeRead: ((readCount: number) => void) | undefined;
  failCreate: Error | undefined;

  getAbstractFileByPath(path: string): TAbstractFile | null {
    return this.entries.get(path) ?? null;
  }

  getAllLoadedFiles(): TAbstractFile[] {
    return [...this.entries.values()];
  }

  async createFolder(path: string): Promise<TFolder> {
    this.calls.push(`createFolder:${path}`);
    if (this.entries.has(path)) {
      throw new Error(`exists:${path}`);
    }
    const folder = { path, children: [] } as unknown as MemoryFolder;
    this.entries.set(path, folder);
    this.refreshChildren();
    return folder;
  }

  async create(path: string, content: string): Promise<TFile> {
    this.calls.push(`create:${path}`);
    if (this.failCreate) {
      throw this.failCreate;
    }
    const file = this.makeFile(path, content);
    this.entries.set(path, file);
    this.refreshChildren();
    return file;
  }

  async createBinary(path: string, binary: ArrayBuffer): Promise<TFile> {
    this.calls.push(`createBinary:${path}`);
    const file = this.makeFile(path, "");
    file.binary = binary;
    this.entries.set(path, file);
    this.refreshChildren();
    return file;
  }

  async cachedRead(file: TFile): Promise<string> {
    this.reads.push(file.path);
    this.beforeRead?.(this.reads.length);
    return (file as MemoryFile).content;
  }

  async modify(file: TFile, content: string): Promise<void> {
    this.calls.push(`modify:${file.path}`);
    (file as MemoryFile).content = content;
  }

  addMarkdown(path: string, content: string): TFile {
    const file = this.makeFile(path, content);
    this.entries.set(path, file);
    this.refreshChildren();
    return file;
  }

  markdownFiles(): MemoryFile[] {
    return [...this.entries.values()].filter((entry): entry is MemoryFile => (
      "extension" in entry && entry.extension === "md"
    ));
  }

  private makeFile(path: string, content: string): MemoryFile {
    const basename = path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? path;
    const extension = path.split(".").pop() ?? "";
    return { path, basename, extension, content } as MemoryFile;
  }

  private refreshChildren(): void {
    const rootChildren: TAbstractFile[] = [];
    for (const entry of this.entries.values()) {
      const parent = entry.path.includes("/") ? entry.path.slice(0, entry.path.lastIndexOf("/")) : "";
      if (parent === "") {
        rootChildren.push(entry);
      }
    }
    this.root.children = rootChildren;
  }
}

function attachment(type: string, size: number): AttachmentInput {
  return {
    type,
    size,
    arrayBuffer: async () => new ArrayBuffer(size)
  };
}

describe("NoteService", () => {
  it("does not write during construction and creates the notes directory only on first quick save", async () => {
    const vault = new MemoryVault();
    const service = new NoteService(vault, DEFAULT_SETTINGS);

    expect(vault.calls).toEqual([]);

    const file = await service.saveQuickNote({ body: "第一条想法 #记录", date: new Date(2026, 8, 10, 9, 0, 0) });

    expect(file.path).toBe("小鹿笔记/第一条想法 #记录.md");
    expect(vault.calls).toEqual([
      "createFolder:小鹿笔记",
      "create:小鹿笔记/第一条想法 #记录.md"
    ]);
  });

  it("does not recreate existing directories and propagates a failed save", async () => {
    const vault = new MemoryVault();
    await vault.createFolder("小鹿笔记");
    vault.calls.length = 0;
    const failure = new Error("storage unavailable");
    vault.failCreate = failure;
    const service = new NoteService(vault, DEFAULT_SETTINGS);

    await expect(service.saveQuickNote({ body: "草稿", date: new Date(2026, 8, 10) })).rejects.toBe(failure);
    expect(vault.calls).toEqual(["create:小鹿笔记/草稿.md"]);
  });

  it("rejects a configured notes path occupied by a file", async () => {
    const vault = new MemoryVault();
    vault.addMarkdown("小鹿笔记", "用户文件");
    const service = new NoteService(vault, DEFAULT_SETTINGS);

    await expect(service.saveQuickNote({ body: "不应保存", date: new Date(2026, 8, 10) }))
      .rejects.toThrow("目录路径被文件占用");
    expect(vault.calls).toEqual([]);
  });

  it("uses current case-insensitive Vault paths for unique quick-note filenames", async () => {
    const vault = new MemoryVault();
    await vault.createFolder("小鹿笔记");
    vault.addMarkdown("小鹿笔记/想法.md", "已有文件");
    vault.calls.length = 0;
    const service = new NoteService(vault, DEFAULT_SETTINGS);

    const file = await service.saveQuickNote({ body: "想法", date: new Date(2026, 8, 10) });

    expect(file.path).toBe("小鹿笔记/想法 (2).md");
  });

  it("appends same-source excerpts from the same local day and separates later days or sources", async () => {
    const vault = new MemoryVault();
    const service = new NoteService(vault, DEFAULT_SETTINGS);
    const dayOne = new Date(2026, 8, 10, 9, 0, 0);

    await service.saveExcerptNote({ source: "Inbox/a.md", excerpt: "原文 A", body: "想法 A", date: dayOne });
    await service.saveExcerptNote({ source: "Inbox/a.md", excerpt: "原文 B", body: "想法 B", date: new Date(2026, 8, 10, 10, 0, 0) });
    await service.saveExcerptNote({ source: "Inbox/a.md", excerpt: "原文 C", body: "想法 C", date: new Date(2026, 8, 11, 9, 0, 0) });
    await service.saveExcerptNote({ source: "Inbox/b.md", excerpt: "原文 D", body: "想法 D", date: dayOne });

    expect(vault.markdownFiles()).toHaveLength(3);
    const sameDay = vault.markdownFiles().find((file) => file.content.includes("想法 A"));
    expect(sameDay?.content).toContain("想法 B");
    expect(vault.reads).toContain(sameDay?.path);
  });

  it("re-reads and re-validates a matching excerpt immediately before append", async () => {
    const vault = new MemoryVault();
    const service = new NoteService(vault, DEFAULT_SETTINGS);
    const first = await service.saveExcerptNote({
      source: "Inbox/a.md",
      excerpt: "原文 A",
      body: "想法 A",
      date: new Date(2026, 8, 10, 9, 0, 0)
    });
    vault.beforeRead = (readCount) => {
      if (readCount === 2) {
        (first as MemoryFile).content = "# 用户刚修改的普通笔记";
      }
    };

    await expect(service.saveExcerptNote({
      source: "Inbox/a.md",
      excerpt: "原文 B",
      body: "想法 B",
      date: new Date(2026, 8, 10, 10, 0, 0)
    })).rejects.toThrow("已不再匹配");
    expect(vault.reads).toEqual([first.path, first.path]);
    expect((first as MemoryFile).content).toBe("# 用户刚修改的普通笔记");
  });

  it("writes only supported attachments below the configured directory and returns a relative link", async () => {
    const vault = new MemoryVault();
    const service = new NoteService(vault, DEFAULT_SETTINGS);

    await expect(service.saveAttachment(attachment("image/svg+xml", 4))).rejects.toThrow("不支持");
    await expect(service.saveAttachment(attachment("image/png", 20 * 1024 * 1024 + 1))).rejects.toThrow("20 MiB");
    expect(vault.calls).toEqual([]);

    const link = await service.saveAttachment(attachment("image/png", 4));

    expect(link).toMatch(/^附件\/[0-9a-f-]+\.png$/);
    expect(vault.calls).toEqual([
      "createFolder:小鹿笔记",
      "createFolder:小鹿笔记/附件",
      `createBinary:小鹿笔记/${link}`
    ]);
  });
});
