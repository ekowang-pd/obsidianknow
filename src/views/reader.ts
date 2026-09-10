import { Component, MarkdownRenderer, Notice } from "obsidian";
import type { App, TFile } from "obsidian";
import type { NoteService } from "../services/note-service";
import { selectionFromRange } from "./selection-model";
import { SelectionNoteController } from "./selection-note";

export class ReaderController {
  private root: HTMLElement | null = null;
  private content: HTMLElement | null = null;
  private menu: HTMLElement | null = null;
  private editor: SelectionNoteController | null = null;
  private component: Component | null = null;
  private cleanups: (() => void)[] = [];
  private menuCleanups: (() => void)[] = [];
  private restoreBackground: (() => void)[] = [];
  private trigger: HTMLElement | null = null;
  private revision = 0;
  private disposed = false;
  private scrollPosition: { top: number; left: number } | null = null;

  constructor(private app: App, private host: HTMLElement, private notes: () => NoteService) {}

  async open(filePath: string): Promise<void> {
    if (this.disposed) return;
    const trigger = this.root ? this.trigger : this.host.ownerDocument.activeElement as HTMLElement | null;
    this.close(); this.trigger = trigger;
    const revision = ++this.revision;
    this.scrollPosition = { top: this.host.scrollTop, left: this.host.scrollLeft };
    this.host.scrollTop = 0; this.host.scrollLeft = 0;
    for (const child of Array.from(this.host.children)) {
      const element = child as HTMLElement;
      const hidden = element.hidden; element.hidden = true;
      this.restoreBackground.push(() => { element.hidden = hidden; });
    }
    this.host.classList.add("deer-reader-open");
    const root = this.element(this.host, "section", "deer-reader");
    this.root = root;
    root.setAttribute("aria-label", "文档阅读器");
    const header = this.element(root, "header", "deer-reader-header");
    const close = this.element(header, "button", "deer-reader-close", "关闭阅读器");
    close.type = "button";
    const title = this.element(header, "div", "deer-reader-title");
    this.element(title, "h2", "", filePath.split("/").pop()?.replace(/\.md$/i, ""));
    this.element(title, "p", "deer-muted", filePath);
    const open = this.element(header, "button", "", "在 Obsidian 中打开");
    open.type = "button";
    const content = this.element(root, "article", "deer-reader-content markdown-rendered");
    this.content = content; content.tabIndex = -1;
    content.textContent = "正在加载…";
    this.editor = new SelectionNoteController(root, this.notes, () => content.focus());
    this.listen(close, "click", () => this.close());
    this.listen(open, "click", () => {
      try { void this.app.workspace.getLeaf("tab").openFile(this.resolveFile(filePath)).catch(error => this.showError(error, revision)); }
      catch (error) { this.showError(error, revision); }
    });
    const update = () => this.updateSelection(filePath);
    this.listen(content, "pointerup", update);
    this.listen(content, "keyup", event => { if ((event as KeyboardEvent).key !== "Escape") update(); });
    this.listen(content.ownerDocument, "selectionchange", update);
    this.listen(content, "contextmenu", event => { if (this.updateSelection(filePath)) event.preventDefault(); });
    this.listen(content, "scroll", () => this.hideMenu());
    const window = content.ownerDocument.defaultView;
    if (window) this.listen(window, "resize", () => this.hideMenu());
    this.listen(root, "keydown", event => {
      if ((event as KeyboardEvent).key !== "Escape") return;
      event.preventDefault(); event.stopPropagation();
      if (this.menu) { this.hideMenu(); content.focus(); }
      else if (this.editor?.isOpen) this.editor.close();
      else this.close();
    });
    this.listen(content, "click", event => {
      const target = event.target as Element;
      const link = target.closest<HTMLAnchorElement>("a.internal-link");
      const href = link?.dataset.href ?? link?.getAttribute("href");
      if (!href) return;
      event.preventDefault(); event.stopPropagation();
      const mouse = event as MouseEvent;
      void this.app.workspace.openLinkText(href, filePath, mouse.ctrlKey || mouse.metaKey).catch(error => this.showError(error, revision));
    });
    close.focus();
    try {
      const file = this.resolveFile(filePath);
      const markdown = await this.app.vault.cachedRead(file);
      if (revision !== this.revision || this.disposed) return;
      const component = new Component(); component.load(); this.component = component;
      const target = content.ownerDocument.createElement("div");
      try {
        await MarkdownRenderer.render(this.app, markdown, target, filePath, component);
      } finally {
        // Late Markdown processors may register children after the first unload.
        if (revision !== this.revision || this.disposed) component.unload();
      }
      if (revision === this.revision && !this.disposed) content.replaceChildren(target);
    } catch (error) {
      if (revision === this.revision && !this.disposed) { content.replaceChildren(); this.showError(error, revision); }
    }
  }

  close(): void {
    const wasOpen = this.root !== null;
    this.revision += 1;
    this.hideMenu(); this.editor?.dispose(); this.editor = null;
    this.cleanups.splice(0).forEach(cleanup => cleanup());
    this.component?.unload(); this.component = null;
    this.root?.remove(); this.root = null; this.content = null;
    this.restoreBackground.splice(0).forEach(restore => restore());
    this.host.classList.remove("deer-reader-open");
    if (this.trigger?.isConnected) this.trigger.focus();
    else if (wasOpen && this.host.isConnected) { this.host.tabIndex = -1; this.host.focus(); }
    if (this.scrollPosition) {
      this.host.scrollTop = this.scrollPosition.top; this.host.scrollLeft = this.scrollPosition.left;
      this.scrollPosition = null;
    }
    this.trigger = null;
  }

  dispose(): void { this.disposed = true; this.close(); }

  private updateSelection(filePath: string): boolean {
    if (!this.root || !this.content || this.editor?.isOpen) return false;
    const selection = this.content.ownerDocument.getSelection();
    const anchor = selection?.rangeCount === 1 ? selectionFromRange(selection.getRangeAt(0), this.content) : null;
    if (!anchor) { this.hideMenu(); return false; }
    // Retain a focused action when selectionchange follows pointerdown on it.
    if (this.menu?.contains(this.host.ownerDocument.activeElement)) return true;
    this.hideMenu();
    const menu = this.element(this.root, "div", "deer-selection-menu"); this.menu = menu;
    menu.style.visibility = "hidden";
    const button = this.element(menu, "button", "mod-cta", "做笔记"); button.type = "button";
    const down = (event: Event) => event.preventDefault();
    const click = () => { this.hideMenu(); this.editor?.open(anchor, filePath); };
    button.addEventListener("pointerdown", down); button.addEventListener("click", click);
    this.menuCleanups.push(() => { button.removeEventListener("pointerdown", down); button.removeEventListener("click", click); });
    const window = this.host.ownerDocument.defaultView!;
    const position = (): boolean => {
      if (this.menu !== menu || !this.root) return true;
      const rect = this.root.getBoundingClientRect();
      const minLeft = Math.max(0, rect.left) + 8;
      const minTop = Math.max(0, rect.top) + 8;
      const maxRight = Math.min(window.innerWidth, rect.right) - 8;
      const maxBottom = Math.min(window.innerHeight, rect.bottom) - 8;
      const width = maxRight - minLeft;
      const height = maxBottom - minTop;
      if (width <= 0 || height <= 0) return false;
      menu.style.maxWidth = `${width}px`; menu.style.maxHeight = `${height}px`;
      menu.style.boxSizing = "border-box"; menu.style.overflow = "auto";
      const size = menu.getBoundingClientRect();
      if (!size.width || !size.height) return false;
      const left = Math.max(minLeft, Math.min(anchor.rect.left, maxRight - size.width));
      const top = Math.max(minTop, Math.min(anchor.rect.bottom + 8, maxBottom - size.height));
      menu.style.left = `${left - rect.left}px`; menu.style.top = `${top - rect.top}px`;
      menu.style.visibility = "visible";
      return true;
    };
    // A hidden menu still participates in layout; only reveal measured placement.
    if (!position()) {
      const frame = window.requestAnimationFrame(() => { position(); });
      this.menuCleanups.push(() => window.cancelAnimationFrame(frame));
    }
    return true;
  }

  private hideMenu(): void {
    this.menuCleanups.splice(0).forEach(cleanup => cleanup());
    this.menu?.remove(); this.menu = null;
  }

  private resolveFile(path: string): TFile {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !("extension" in file) || typeof file.extension !== "string" || file.extension.toLowerCase() !== "md") {
      throw new Error(`笔记已移动或不存在：${path}`);
    }
    return file as TFile;
  }

  private showError(error: unknown, revision: number): void {
    if (revision !== this.revision || !this.root || this.disposed) return;
    const message = `无法打开笔记：${error instanceof Error ? error.message : "请重试"}`;
    const alert = this.element(this.root, "p", "deer-error", message); alert.setAttribute("role", "alert");
    new Notice(message);
  }

  private element<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
    const element = parent.ownerDocument.createElement(tag); element.className = className;
    if (text !== undefined) element.textContent = text;
    parent.append(element); return element;
  }

  private listen(target: EventTarget, event: string, listener: (event: Event) => void): void {
    target.addEventListener(event, listener);
    this.cleanups.push(() => target.removeEventListener(event, listener));
  }
}
