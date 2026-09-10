import { translate } from "../i18n";
import { Component, ItemView, MarkdownRenderer, Notice } from "obsidian";
import { setFilledIcon } from "./icons";
import { renderKnowledgeOverview } from "./overview";
import type { OverviewDays } from "../domain/overview";
import type { WorkspaceLeaf } from "obsidian";

import { buildContributions } from "../domain/contributions";
import type { NoteService } from "../services/note-service";
import type { VaultIndex, VaultSnapshot } from "../services/vault-index";
import type { DeerNotesSettings } from "../settings";
import { DashboardState } from "./dashboard-state";
import type { ReadBody } from "./dashboard-state";
import { ReaderController } from "./reader";
import { noteSummary } from "./note-summary";

export const VIEW_TYPE_DEER_NOTES = "deer-notes-dashboard";
export type OpenDashboardFile = (filePath: string) => void | Promise<void>;

interface DraftContext {
  notes: NoteService;
  notesFolder: string;
  attachmentPaths: Set<string>;
}

export class DeerNotesView extends ItemView {
  private t = (source: string, ...values: unknown[]) => translate(this.settings.language, source, ...values);
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
  private activityEl: HTMLDetailsElement | null = null;
  private results!: HTMLElement;
  private composer!: HTMLElement;
  private pageTitle!: HTMLElement;
  private searchLabel!: HTMLElement;
  private overviewDays: OverviewDays = 30;
  private summaryRevision = 0;
  private summaryCache = new Map<string, { mtime: number; body: Promise<string> }>();
  private textarea!: HTMLTextAreaElement;
  private imageInput!: HTMLInputElement;
  private previewEl!: HTMLElement;
  private errorEl!: HTMLElement;
  private search!: HTMLInputElement;
  private saveButton!: HTMLButtonElement;
  private previewButton!: HTMLButtonElement;
  private saveLabel!: HTMLElement;
  private composerButtons: HTMLButtonElement[] = [];

  constructor(
    leaf: WorkspaceLeaf,
    private index: VaultIndex,
    private notes: NoteService,
    private settings: DeerNotesSettings,
    private readonly openFile: OpenDashboardFile,
    private readonly readBody: ReadBody
  ) {
    super(leaf);
    this.snapshot = index.getSnapshot();
    this.state = new DashboardState(this.snapshot, settings, readBody);
  }

  getViewType(): string { return VIEW_TYPE_DEER_NOTES; }
  getDisplayText(): string { return this.t("小鹿笔记"); }
  getIcon(): string { return "notebook-pen"; }

  async onOpen(): Promise<void> {
    this.closed = false;
    this.contentEl.replaceChildren();
    this.contentEl.className = "view-content deer-dashboard";
    this.sidebar = this.element(this.contentEl, "aside", "deer-sidebar");
    const main = this.element(this.contentEl, "main", "deer-main");
    const pageHeader = this.element(main, "header", "deer-page-header");
    this.pageTitle = this.element(pageHeader, "h2", "deer-page-title", this.t("全部笔记"));
    const label = this.element(pageHeader, "label", "deer-search-label");
    this.searchLabel = label;
    this.element(label, "span", "deer-sr-only", this.t("搜索笔记"));
    this.renderIcon(label, "search");
    this.search = this.element(label, "input", "deer-search");
    this.search.type = "search";
    this.search.placeholder = this.t("搜索笔记、标签或正文…");
    this.search.value = this.state.searchQuery;
    this.renderComposer(main);
    this.results = this.element(main, "section", "deer-results");
    this.results.setAttribute("aria-live", "polite");
    this.listen(this.contentEl, "click", event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
      if (button && !button.disabled) void this.handleAction(button);
    });
    this.listen(this.textarea, "input", () => { this.draft = this.textarea.value; this.updateComposer(); });
    this.listen(this.textarea, "keydown", event => {
      const key = event as KeyboardEvent;
      if (key.key === "Enter" && (key.ctrlKey || key.metaKey) && !key.isComposing) {
        key.preventDefault(); void this.saveDraft();
      }
    });
    this.listen(this.search, "input", () => { void this.refreshSearch(); });
    this.listen(this.imageInput, "change", () => { void this.attachImage(); });
    this.bindIndex();
    this.renderSidebar();
    await this.index.initialize();
    if (!this.closed) await this.refreshSearch();
  }

  async onClose(): Promise<void> {
    this.closed = true;
    this.summaryRevision += 1;
    this.summaryCache.clear();
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
    this.reader ??= new ReaderController(this.app, this.contentEl, () => this.notes, () => this.settings.language ?? "zh-CN");
    await this.reader.open(filePath);
  }

  updateSettings(settings: DeerNotesSettings, index = this.index, notes = this.notes): void {
    const languageChanged = this.settings.language !== settings.language;
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
      if (languageChanged) this.refreshLanguage();
      this.updateComposer();
      this.renderSidebar();
      void this.refreshSearch();
      if (this.preview) void this.renderPreview();
    }
  }

  private refreshLanguage(): void {
    this.search.placeholder = this.t("搜索笔记、标签或正文…");
    const searchLabel = this.searchLabel.querySelector(".deer-sr-only");
    if (searchLabel) searchLabel.textContent = this.t("搜索笔记");
    this.textarea.placeholder = this.t("此刻有什么想法？");
    const label = this.composer.querySelector(".deer-composer-label");
    if (label?.firstChild?.nodeType === 3) label.firstChild.textContent = this.t("快速笔记");
    const labels: Record<string, string> = { tag: "插入标签", image: "添加图片", bold: "加粗", unordered: "无序列表", ordered: "有序列表", preview: "Markdown 预览" };
    for (const button of this.composerButtons) {
      const source = labels[button.dataset.action ?? ""];
      if (source) { button.setAttribute("aria-label", this.t(source)); button.title = this.t(source); }
    }
    this.saveButton.title = this.t("保存笔记（Ctrl / ⌘ + Enter）");
    this.saveButton.setAttribute("aria-label", this.t("保存笔记"));
    this.composer.querySelector('.deer-toolbar')?.setAttribute("aria-label", this.t("笔记工具"));
    this.reader?.refreshLanguage();
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
    const focusedNav = this.sidebar.contains(focused) ? focused?.closest<HTMLButtonElement>("button[data-action]") : null;
    let focusTarget: HTMLButtonElement | undefined;
    let selectedButton: HTMLButtonElement | undefined;
    this.sidebar.replaceChildren();
    const brand = this.element(this.sidebar, "div", "deer-brand");
    this.renderIcon(brand, "deer-brand");
    this.element(brand, "h1", "", this.t("小鹿笔记"));
    this.element(this.sidebar, "p", "deer-muted", this.t("捕捉灵感，让知识慢慢生长"));
    const nav = this.element(this.sidebar, "nav", "deer-navigation");
    const activity = this.element(this.sidebar, "details", "deer-activity");
    activity.open = this.activityEl?.open ?? false;
    this.activityEl = activity;
    const activityToggle = this.element(activity, "summary", "deer-activity-title", this.t("最近修改活动"));
    activityToggle.title = this.t("展开或收起近 91 天修改活动");
    const summary = buildContributions(this.snapshot.deerNotes.map(note => new Date(note.mtime)), new Date());
    const stats = this.element(activity, "dl", "deer-statistics");
    for (const [label, count] of [[this.t("修改笔记"), summary.total], [this.t("活跃天数"), summary.activeDays], [this.t("连续活跃"), summary.streak]] as const) {
      const stat = this.element(stats, "div", "deer-statistic");
      this.element(stat, "dt", "", label);
      this.element(stat, "dd", "", String(count));
    }
    const heatmap = this.element(activity, "div", "deer-heatmap");
    heatmap.setAttribute("role", "list");
    heatmap.setAttribute("aria-label", this.t("最近修改活动，近 91 天"));
    for (const day of summary.days) {
      const cell = this.element(heatmap, "span", "deer-heat-cell");
      cell.dataset.level = String(Math.min(day.count, 4));
      cell.setAttribute("role", "listitem");
      cell.title = this.t("{0}：{1} 条笔记", day.date, day.count);
      cell.setAttribute("aria-label", cell.title);
    }
    this.element(activity, "p", "deer-heat-legend", this.t("近 91 天 · 最近修改记录"));
    nav.setAttribute("aria-label", this.t("笔记导航"));
    for (const item of this.state.navigation) {
      const button = this.button(nav, item.label, item.kind === "folder" ? "folder" : item.kind === "notes" ? "notebook" : "chart-no-axes-combined", item.kind);
      if (item.kind === "folder") button.dataset.folder = item.id;
      if (focusedNav?.dataset.action === button.dataset.action && focusedNav?.dataset.folder === button.dataset.folder) focusTarget = button;
      const selected = this.state.selectedView;
      if (selected.kind === item.kind && (selected.kind !== "folder" || selected.path === item.id)) {
        button.setAttribute("aria-current", "page");
        selectedButton = button;
      }
    }
    if (focusedNav) (focusTarget ?? selectedButton)?.focus();
  }

  private renderComposer(parent: HTMLElement): void {
    const composer = this.element(parent, "section", "deer-composer");
    this.composer = composer;
    const label = this.element(composer, "label", "deer-composer-label", this.t("快速笔记"));
    this.textarea = this.element(label, "textarea", "deer-quick-input");
    this.textarea.rows = 3;
    this.textarea.placeholder = this.t("此刻有什么想法？");
    this.textarea.value = this.draft;
    this.previewEl = this.element(composer, "div", "deer-preview markdown-rendered");
    this.previewEl.hidden = true;
    const toolbar = this.element(composer, "div", "deer-toolbar");
    toolbar.setAttribute("role", "group");
    toolbar.setAttribute("aria-label", this.t("笔记工具"));
    this.composerButtons = [];
    for (const [action, label, icon] of [["tag", this.t("插入标签"), "tag"], ["image", this.t("添加图片"), "image"], ["bold", this.t("加粗"), "bold"], ["unordered", this.t("无序列表"), "list"], ["ordered", this.t("有序列表"), "list-ordered"], ["preview", this.t("Markdown 预览"), "eye"]]) {
      const button = this.button(toolbar, label, icon, action, true);
      this.composerButtons.push(button);
      if (action === "preview") this.previewButton = button;
    }
    this.saveButton = this.button(toolbar, this.t("保存笔记"), "plus", "save");
    this.saveButton.className = "deer-save mod-cta";
    this.saveLabel = this.saveButton.lastElementChild as HTMLElement;
    this.saveButton.title = this.t("保存笔记（Ctrl / ⌘ + Enter）");
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
    const summaryRevision = ++this.summaryRevision;
    this.pageTitle.textContent = selected.kind === "notes" ? this.t("全部笔记") : selected.kind === "overview" ? this.t("知识概览") : selected.path;
    this.composer.hidden = selected.kind !== "notes";
    this.searchLabel.hidden = selected.kind === "overview";
    if (selected.kind === "overview") {
      renderKnowledgeOverview(this.results, this.snapshot, this.settings, this.overviewDays);
      return;
    }
    const files = this.state.visibleFiles;
    const heading = this.element(this.results, "div", "deer-results-heading");
    this.element(heading, "p", "deer-result-count", this.t("{0} 条记录", files.length));
    if (!files.length) {
      this.element(this.results, "p", "deer-empty", this.state.searchQuery.trim() ? this.t("没有匹配的笔记，试试其他关键词。") : this.t("这里还没有笔记，先记录一个想法吧。"));
      return;
    }
    const list = this.element(this.results, "ul", "deer-note-list");
    const excerpts: { path: string; mtime: number; title: string; tags: readonly string[]; element: HTMLElement; more: HTMLElement }[] = [];
    for (const file of files) {
      const row = this.element(list, "li", "deer-note-row");
      const title = "title" in file ? file.title : file.basename;
      const button = this.element(row, "button", "deer-note-link");
      button.type = "button";
      button.dataset.action = "open-file";
      button.setAttribute("aria-label", title);
      button.dataset.path = file.path;
      button.title = file.path;
      const date = new Date(file.mtime);
      const modified = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      this.element(button, "span", "deer-note-date", modified);
      this.element(button, "span", "deer-note-title", title);
      const excerpt = this.element(button, "span", "deer-note-summary");
      const meta = this.element(button, "span", "deer-note-meta");
      if ("source" in file) {
        if (file.tags.length) this.element(meta, "span", "deer-tags", file.tags.map(tag => `#${tag}`).join("  "));
        if (file.source) this.element(meta, "span", "deer-note-source", this.t("来自 {0}", file.source.split("/").pop()?.replace(/\.md$/i, "")));
      } else {
        this.element(meta, "span", "deer-note-path", file.path.split("/").slice(0, -1).join(" / ") || this.t("根目录"));
      }
      meta.hidden = !meta.children.length;
      const more = this.element(button, "span", "deer-note-open", this.t("阅读全文"));
      more.hidden = true;
      excerpts.push({ path: file.path, mtime: file.mtime, title, tags: "tags" in file ? file.tags : [], element: excerpt, more });
    }
    let next = 0;
    const fill = async () => {
      while (!this.closed && summaryRevision === this.summaryRevision && next < excerpts.length) {
        const item = excerpts[next++];
        let cached = this.summaryCache.get(item.path);
        if (!cached || cached.mtime !== item.mtime) {
          cached = { mtime: item.mtime, body: Promise.resolve().then(() => {
            if (this.closed) throw new Error("View closed");
            return this.readBody(item.path);
          }) };
          if (this.summaryCache.size >= 256) this.summaryCache.delete(this.summaryCache.keys().next().value!);
          this.summaryCache.set(item.path, cached);
        }
        try {
          const body = await cached.body;
          if (!this.closed && summaryRevision === this.summaryRevision) {
            const summary = noteSummary(body, item.title, item.tags);
            item.element.textContent = summary;
            item.element.hidden = !summary;
            item.more.hidden = summary.length < 140 && summary.split("\n").length < 5;
          }
        } catch {
          if (this.summaryCache.get(item.path) === cached) this.summaryCache.delete(item.path);
          if (!this.closed && summaryRevision === this.summaryRevision) item.element.hidden = true;
        }
      }
    };
    void fill(); void fill();
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
        const message = this.element(this.results, "p", "deer-error", this.t("搜索未完成：{0}", errorMessage(error)));
        message.setAttribute("role", "alert");
      }
    }
  }

  private async handleAction(button: HTMLButtonElement): Promise<void> {
    const action = button.dataset.action;
    if (action === "overview-range") {
      const days = Number(button.dataset.days);
      if (days === 7 || days === 30 || days === 90) {
        this.overviewDays = days;
        this.renderResults();
        this.results.querySelector<HTMLButtonElement>(`button[data-days="${days}"]`)?.focus();
      }
    } else if (action === "notes" || action === "folder" || action === "overview") {
      if (action === "notes") this.state.selectNotes();
      else if (action === "folder") this.state.selectFolder(button.dataset.folder!);
      else this.state.selectOverview();
      this.renderSidebar();
      await this.refreshSearch();
    } else if (action === "open-file") {
      try { await this.openFile(button.dataset.path!); }
      catch (error) { if (!this.closed) new Notice(this.t("无法打开笔记：{0}", errorMessage(error))); }
    } else if (action === "save") await this.saveDraft();
    else if (action === "image") this.imageInput.click();
    else if (action === "preview") {
      this.preview = !this.preview;
      this.updateComposer();
      if (this.preview) await this.renderPreview();
      else { this.previewRevision += 1; this.clearPreview(); }
    } else if (action === "bold") this.insertText("**", "**", this.t("文字"));
    else if (action === "tag") this.insertText(" #", "", this.t("标签"));
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
        new Notice(this.t("笔记已保存"));
      }
    } catch (error) { if (!this.closed) this.showError(this.t("保存失败：{0}", errorMessage(error))); }
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
    } catch (error) { if (!this.closed) this.showError(this.t("图片保存失败：{0}", errorMessage(error))); }
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
      if (!this.closed && revision === this.previewRevision) this.showError(this.t("预览失败：{0}", errorMessage(error)));
    } finally {
      // Markdown processors can register resources after clearPreview has unloaded the component.
      if (this.closed || !this.preview || revision !== this.previewRevision) component.unload();
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
    if (this.saveLabel) this.saveLabel.textContent = this.busy ? this.t("保存中…") : this.t("保存笔记");
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
    setFilledIcon(icon, name);
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

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : "Please try again"; }
