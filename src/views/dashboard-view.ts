import { Component, ItemView, MarkdownRenderer, Notice, setIcon } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";

import { buildContributions } from "../domain/contributions";
import type { NoteService } from "../services/note-service";
import type { VaultIndex, VaultSnapshot } from "../services/vault-index";
import type { DeerNotesSettings } from "../settings";
import { DashboardState } from "./dashboard-state";
import type { ReadBody } from "./dashboard-state";
import { ReaderController } from "./reader";

export const VIEW_TYPE_DEER_NOTES = "deer-notes-dashboard";
export type OpenDashboardFile = (filePath: string) => void | Promise<void>;

interface DraftContext {
  notes: NoteService;
  notesFolder: string;
  attachmentPaths: Set<string>;
}

export class DeerNotesView extends ItemView {
  private state: DashboardState;
  private snapshot: VaultSnapshot;
  private unsubscribe: (() => void) | null = null;
  private cleanups: (() => void)[] = [];
  private closed = true;
  private draft = "";
  private draftContext: DraftContext | null = null;
  private busy = false;
  private preview = false;
  private previewRevision = 0;
  private searchRevision = 0;
  private previewComponent: Component | null = null;
  private reader: ReaderController | null = null;
  private sidebar!: HTMLElement;
  private results!: HTMLElement;
  private textarea!: HTMLTextAreaElement;
  private imageInput!: HTMLInputElement;
  private previewEl!: HTMLElement;
  private errorEl!: HTMLElement;
  private search!: HTMLInputElement;
  private saveButton!: HTMLButtonElement;
  private previewButton!: HTMLButtonElement;
  private composerButtons: HTMLButtonElement[] = [];

  constructor(
    leaf: WorkspaceLeaf,
    private index: VaultIndex,
    private notes: NoteService,
    private settings: DeerNotesSettings,
    private readonly openFile: OpenDashboardFile,
    readBody: ReadBody
  ) {
    super(leaf);
    this.snapshot = index.getSnapshot();
    this.state = new DashboardState(this.snapshot, settings, readBody);
  }

  getViewType(): string { return VIEW_TYPE_DEER_NOTES; }
  getDisplayText(): string { return "小鹿笔记"; }
  getIcon(): string { return "notebook-pen"; }

  async onOpen(): Promise<void> {
    this.closed = false;
    this.contentEl.replaceChildren();
    this.contentEl.className = "view-content deer-dashboard";
    this.sidebar = this.element(this.contentEl, "aside", "deer-sidebar");
    const main = this.element(this.contentEl, "main", "deer-main");
    this.renderComposer(main);
    const label = this.element(main, "label", "deer-search-label", "搜索笔记");
    this.search = this.element(label, "input", "deer-search");
    this.search.type = "search";
    this.search.placeholder = "搜索标题、路径、来源或正文";
    this.search.value = this.state.searchQuery;
    this.results = this.element(main, "section", "deer-results");
    this.results.setAttribute("aria-live", "polite");
    this.listen(this.contentEl, "click", event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
      if (button && !button.disabled) void this.handleAction(button);
    });
    this.listen(this.textarea, "input", () => { this.draft = this.textarea.value; this.updateComposer(); });
    this.listen(this.search, "input", () => { void this.refreshSearch(); });
    this.listen(this.imageInput, "change", () => { void this.attachImage(); });
    this.bindIndex();
    this.renderSidebar();
    await this.refreshSearch();
  }

  async onClose(): Promise<void> {
    this.closed = true;
    this.reader?.dispose();
    this.reader = null;
    this.searchRevision += 1;
    this.state.cancelSearch();
    this.previewRevision += 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.cleanups.splice(0).forEach(cleanup => cleanup());
    this.clearPreview();
    this.composerButtons = [];
    this.contentEl.replaceChildren();
  }

  async openReader(filePath: string): Promise<void> {
    if (this.closed) return;
    this.reader ??= new ReaderController(this.app, this.contentEl, () => this.notes);
    await this.reader.open(filePath);
  }

  updateSettings(settings: DeerNotesSettings, index = this.index, notes = this.notes): void {
    this.settings = settings;
    this.notes = notes;
    this.state.updateSettings(settings);
    if (index !== this.index) {
      this.unsubscribe?.();
      this.index = index;
      if (!this.closed) this.bindIndex();
    }
    this.snapshot = index.getSnapshot();
    this.state.updateSnapshot(this.snapshot);
    if (!this.closed) {
      this.updateComposer();
      this.renderSidebar();
      void this.refreshSearch();
      if (this.preview) void this.renderPreview();
    }
  }

  private bindIndex(): void {
    this.snapshot = this.index.getSnapshot();
    this.state.updateSnapshot(this.snapshot);
    this.unsubscribe = this.index.subscribe(snapshot => {
      if (this.closed) return;
      this.snapshot = snapshot;
      this.state.updateSnapshot(snapshot);
      this.renderSidebar();
      void this.refreshSearch();
    });
  }

  private renderSidebar(): void {
    const focused = this.sidebar.ownerDocument.activeElement;
    const restoreFocus = this.sidebar.contains(focused) && Boolean(focused?.closest("button[data-action]"));
    this.sidebar.replaceChildren();
    const brand = this.element(this.sidebar, "div", "deer-brand");
    this.renderIcon(brand, "notebook-pen");
    this.element(brand, "h1", "", "小鹿笔记");
    this.element(this.sidebar, "p", "deer-muted", "捕捉灵感，让知识慢慢生长");
    const summary = buildContributions(this.snapshot.deerNotes.map(note => new Date(`${note.created}T00:00:00`)), new Date());
    const stats = this.element(this.sidebar, "dl", "deer-statistics");
    for (const [label, count] of [["近 91 天笔记", summary.total], ["活跃天数", summary.activeDays], ["连续记录", summary.streak]] as const) {
      const stat = this.element(stats, "div", "deer-statistic");
      this.element(stat, "dt", "", label);
      this.element(stat, "dd", "", String(count));
    }
    const heatmap = this.element(this.sidebar, "div", "deer-heatmap");
    heatmap.setAttribute("role", "list");
    heatmap.setAttribute("aria-label", "近 91 天笔记记录");
    for (const day of summary.days) {
      const cell = this.element(heatmap, "span", "deer-heat-cell");
      cell.dataset.level = String(Math.min(day.count, 4));
      cell.setAttribute("role", "listitem");
      cell.title = `${day.date}：${day.count} 条笔记`;
      cell.setAttribute("aria-label", cell.title);
    }
    this.element(this.sidebar, "p", "deer-heat-legend", "近 91 天 · 颜色越深，记录越多");
    const nav = this.element(this.sidebar, "nav", "deer-navigation");
    nav.setAttribute("aria-label", "笔记导航");
    for (const item of this.state.navigation) {
      const button = this.button(nav, item.label, item.kind === "folder" ? "folder" : item.kind === "notes" ? "notebook" : "chart-no-axes-combined", item.kind);
      if (item.kind === "folder") button.dataset.folder = item.id;
      const selected = this.state.selectedView;
      if (selected.kind === item.kind && (selected.kind !== "folder" || selected.path === item.id)) {
        button.setAttribute("aria-current", "page");
        if (restoreFocus) button.focus();
      }
    }
  }

  private renderComposer(parent: HTMLElement): void {
    const composer = this.element(parent, "section", "deer-composer");
    const label = this.element(composer, "label", "deer-composer-label", "快速笔记");
    this.textarea = this.element(label, "textarea", "deer-quick-input");
    this.textarea.rows = 3;
    this.textarea.placeholder = "此刻有什么想法？";
    this.textarea.value = this.draft;
    this.previewEl = this.element(composer, "div", "deer-preview markdown-rendered");
    this.previewEl.hidden = true;
    const toolbar = this.element(composer, "div", "deer-toolbar");
    toolbar.setAttribute("role", "group");
    toolbar.setAttribute("aria-label", "笔记工具");
    this.composerButtons = [];
    for (const [action, label, icon] of [["tag", "插入标签", "tag"], ["image", "添加图片", "image"], ["bold", "加粗", "bold"], ["unordered", "无序列表", "list"], ["ordered", "有序列表", "list-ordered"], ["preview", "Markdown 预览", "eye"]]) {
      const button = this.button(toolbar, label, icon, action, true);
      this.composerButtons.push(button);
      if (action === "preview") this.previewButton = button;
    }
    this.saveButton = this.button(toolbar, "保存笔记", "plus", "save");
    this.saveButton.className = "deer-save mod-cta";
    this.composerButtons.push(this.saveButton);
    this.imageInput = this.element(composer, "input", "");
    this.imageInput.type = "file";
    this.imageInput.accept = "image/png,image/jpeg,image/gif,image/webp";
    this.imageInput.hidden = true;
    this.errorEl = this.element(composer, "p", "deer-error");
    this.errorEl.setAttribute("role", "alert");
    this.errorEl.hidden = true;
    this.updateComposer();
  }

  private renderResults(): void {
    this.results.replaceChildren();
    const selected = this.state.selectedView;
    if (selected.kind === "overview") {
      this.element(this.results, "h2", "", "知识概览");
      const overview = this.element(this.results, "dl", "deer-overview");
      for (const [label, count] of [["Markdown 文档", this.snapshot.markdownFiles.length], ["小鹿笔记", this.snapshot.deerNotes.length], ["可见根目录", this.state.navigation.filter(item => item.kind === "folder").length]] as const) {
        const card = this.element(overview, "div", "deer-overview-card");
        this.element(card, "dt", "", label);
        this.element(card, "dd", "", String(count));
      }
      return;
    }
    const files = this.state.visibleFiles;
    this.element(this.results, "h2", "", selected.kind === "notes" ? "全部笔记" : selected.path);
    this.element(this.results, "p", "deer-muted", `${files.length} 条记录`);
    if (!files.length) {
      this.element(this.results, "p", "deer-empty", this.state.searchQuery.trim() ? "没有匹配的笔记，试试其他关键词。" : "这里还没有笔记，先记录一个想法吧。");
      return;
    }
    const list = this.element(this.results, "ul", "deer-note-list");
    for (const file of files) {
      const row = this.element(list, "li", "deer-note-row");
      const button = this.button(row, "title" in file ? file.title : file.basename, "file-text", "open-file");
      button.dataset.path = file.path;
      this.element(row, "p", "deer-note-path", file.path);
      if ("source" in file) {
        this.element(row, "p", "deer-muted", `${file.updated}${file.source ? ` · 来源：${file.source}` : ""}`);
        if (file.tags.length) this.element(row, "p", "deer-tags", file.tags.map(tag => `#${tag}`).join(" "));
      }
    }
  }

  private async refreshSearch(): Promise<void> {
    const revision = ++this.searchRevision;
    try {
      const pending = this.state.setSearchQuery(this.search.value);
      this.renderResults();
      await pending;
      if (!this.closed && revision === this.searchRevision) this.renderResults();
    } catch (error) {
      if (!this.closed && revision === this.searchRevision) {
        this.renderResults();
        const message = this.element(this.results, "p", "deer-error", `搜索未完成：${errorMessage(error)}`);
        message.setAttribute("role", "alert");
      }
    }
  }

  private async handleAction(button: HTMLButtonElement): Promise<void> {
    const action = button.dataset.action;
    if (action === "notes" || action === "folder" || action === "overview") {
      if (action === "notes") this.state.selectNotes();
      else if (action === "folder") this.state.selectFolder(button.dataset.folder!);
      else this.state.selectOverview();
      this.renderSidebar();
      await this.refreshSearch();
    } else if (action === "open-file") {
      try { await this.openFile(button.dataset.path!); }
      catch (error) { if (!this.closed) new Notice(`无法打开笔记：${errorMessage(error)}`); }
    } else if (action === "save") await this.saveDraft();
    else if (action === "image") this.imageInput.click();
    else if (action === "preview") {
      this.preview = !this.preview;
      this.updateComposer();
      if (this.preview) await this.renderPreview();
      else { this.previewRevision += 1; this.clearPreview(); }
    } else if (action === "bold") this.insertText("**", "**", "文字");
    else if (action === "tag") this.insertText(" #", "", "标签");
    else if (action === "unordered" || action === "ordered") this.insertList(action === "ordered");
  }

  private insertText(prefix: string, suffix = "", fallback = ""): void {
    const { selectionStart: start, selectionEnd: end } = this.textarea;
    const selected = this.draft.slice(start, end) || fallback;
    this.replaceSelection(prefix + selected + suffix);
    this.textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
  }

  private replaceSelection(text: string): void {
    const { selectionStart: start, selectionEnd: end } = this.textarea;
    this.draft = this.draft.slice(0, start) + text + this.draft.slice(end);
    this.textarea.value = this.draft;
    this.textarea.focus();
    this.textarea.setSelectionRange(start + text.length, start + text.length);
    this.updateComposer();
    if (this.preview) void this.renderPreview();
  }

  private insertList(ordered: boolean): void {
    const start = this.draft.lastIndexOf("\n", this.textarea.selectionStart - 1) + 1;
    const end = this.textarea.selectionEnd;
    const lines = this.draft.slice(start, end).split("\n");
    this.textarea.setSelectionRange(start, end);
    this.replaceSelection(lines.map((line, index) => `${ordered ? `${index + 1}.` : "-"} ${line}`).join("\n"));
  }

  private async saveDraft(): Promise<void> {
    if (this.busy || !this.draft.trim()) return;
    this.busy = true;
    this.showError("");
    this.updateComposer();
    try {
      await this.getDraftContext().notes.saveQuickNote({ body: this.draft, date: new Date() });
      this.draft = "";
      this.draftContext = null;
      if (!this.closed) {
        this.textarea.value = "";
        this.preview = false;
        this.previewRevision += 1;
        this.clearPreview();
        new Notice("笔记已保存");
      }
    } catch (error) { if (!this.closed) this.showError(`保存失败：${errorMessage(error)}`); }
    finally { this.busy = false; if (!this.closed) this.updateComposer(); }
  }

  private async attachImage(): Promise<void> {
    const file = this.imageInput.files?.[0];
    if (!file || this.busy) return;
    this.busy = true;
    this.showError("");
    this.updateComposer();
    const context = this.getDraftContext();
    try {
      const relativePath = await context.notes.saveAttachment(file);
      // Keep the completed upload's Vault path tied to the captured draft context.
      const vaultPath = `${context.notesFolder}/${relativePath}`;
      context.attachmentPaths.add(vaultPath);
      if (!this.closed) this.replaceSelection(`![图片](<${relativePath.replace(/[<>%\r\n]/g, encodeURIComponent)}>)`);
    } catch (error) { if (!this.closed) this.showError(`图片保存失败：${errorMessage(error)}`); }
    finally {
      this.busy = false;
      if (!this.closed) { this.imageInput.value = ""; this.updateComposer(); }
    }
  }

  private async renderPreview(): Promise<void> {
    const revision = ++this.previewRevision;
    this.clearPreview();
    const component = this.addChild(new Component());
    this.previewComponent = component;
    const target = this.contentEl.ownerDocument.createElement("div");
    try {
      const notesFolder = this.draftContext?.notesFolder ?? this.settings.notesFolder;
      await MarkdownRenderer.render(this.app, this.draft, target, `${notesFolder}/未保存.md`, component);
      if (!this.closed && this.preview && revision === this.previewRevision) this.previewEl.replaceChildren(target);
    } catch (error) {
      if (!this.closed && revision === this.previewRevision) this.showError(`预览失败：${errorMessage(error)}`);
    }
  }

  private clearPreview(): void {
    if (this.previewComponent) this.removeChild(this.previewComponent);
    this.previewComponent = null;
    this.previewEl?.replaceChildren();
  }

  private updateComposer(): void {
    if (this.draft || this.busy) this.getDraftContext();
    else this.draftContext = null;
    this.textarea.disabled = this.busy;
    this.textarea.hidden = this.preview;
    this.previewEl.hidden = !this.preview;
    for (const button of this.composerButtons) button.disabled = this.busy;
    this.saveButton.disabled = this.busy || !this.draft.trim();
    this.previewButton.setAttribute("aria-pressed", String(this.preview));
  }

  private getDraftContext(): DraftContext {
    if (!this.draftContext) {
      this.draftContext = { notes: this.notes, notesFolder: this.settings.notesFolder, attachmentPaths: new Set() };
    }
    return this.draftContext;
  }

  private showError(message: string): void {
    this.errorEl.textContent = message;
    this.errorEl.hidden = !message;
    if (message) new Notice(message);
  }

  private button(parent: HTMLElement, label: string, icon: string, action: string, iconOnly = false): HTMLButtonElement {
    const button = this.element(parent, "button", iconOnly ? "deer-icon-button" : "deer-button");
    button.type = "button";
    button.dataset.action = action;
    button.setAttribute("aria-label", label);
    button.title = label;
    this.renderIcon(button, icon);
    if (!iconOnly) this.element(button, "span", "", label);
    return button;
  }

  private renderIcon(parent: HTMLElement, name: string): void {
    const icon = this.element(parent, "span", "deer-icon");
    icon.setAttribute("aria-hidden", "true");
    setIcon(icon, name);
  }

  private element<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
    const element = parent.ownerDocument.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    parent.append(element);
    return element;
  }

  private listen(element: HTMLElement, event: string, listener: (event: Event) => void): void {
    element.addEventListener(event, listener);
    this.cleanups.push(() => element.removeEventListener(event, listener));
  }
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : "请重试"; }
