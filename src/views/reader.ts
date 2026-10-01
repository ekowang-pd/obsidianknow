import { translate, type Language } from "../i18n";
import { Component, MarkdownRenderer, Notice, parseYaml } from "obsidian";
import DOMPurify from "dompurify";
import { setFilledIcon } from "./icons";
import { parseDeerNote } from "../domain/notes";
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
  private t = (source: string, ...values: unknown[]) => translate(this.language(), source, ...values);
  private revision = 0;
  private disposed = false;
  private scrollPosition: { top: number; left: number } | null = null;
  private editing = false;
  private saving = false;
  private original = "";
  private editInput: HTMLTextAreaElement | null = null;
  private htmlTextMode = false;

  constructor(private app: App, private host: HTMLElement, private notes: () => NoteService, private language: () => Language = () => "zh-CN") {}

  async open(filePath: string): Promise<void> {
    if (this.disposed || this.editor?.isSaving) return;
    const trigger = this.root ? this.trigger : this.host.ownerDocument.activeElement as HTMLElement | null;
    this.close();
    if (this.root) return;
    this.trigger = trigger;
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
    root.dataset.path = filePath;
    root.setAttribute("aria-label", this.t("文档阅读器"));
    const header = this.element(root, "header", "deer-reader-header");
    const close = this.element(header, "button", "deer-reader-close");
    close.setAttribute("aria-label", this.t("返回列表"));
    const backIcon = this.element(close, "span", "deer-icon");
    backIcon.setAttribute("aria-hidden", "true"); setFilledIcon(backIcon, "arrow-left");
    this.element(close, "span", "", this.t("返回列表"));
    close.type = "button";
    const title = this.element(header, "div", "deer-reader-title");
    this.element(title, "span", "deer-reader-folder", filePath.split("/").slice(0, -1).join(" / ") || this.t("根目录"));
    title.title = filePath;
    this.element(title, "span", "deer-sr-only", filePath);
    const open = this.element(header, "button", "deer-reader-external", this.t("在 Obsidian 中打开"));
    open.type = "button";
    const htmlMode = this.element(header, "button", "deer-reader-html-mode", this.t("阅读文本"));
    htmlMode.type = "button"; htmlMode.hidden = true;
    htmlMode.title = this.t("交互预览只运行内嵌脚本与样式，外部资源不会加载。");
    const edit = this.element(header, "button", "deer-reader-edit", this.t("编辑原文"));
    edit.type = "button";
    edit.hidden = true;
    const cancel = this.element(header, "button", "deer-reader-cancel", this.t("取消编辑"));
    cancel.type = "button"; cancel.hidden = true;
    const save = this.element(header, "button", "deer-reader-save mod-cta", this.t("保存修改"));
    save.type = "button"; save.hidden = true;
    const content = this.element(root, "article", "deer-reader-content markdown-rendered");
    this.content = content; content.tabIndex = -1;
    content.textContent = this.t("正在加载…");
    this.editor = new SelectionNoteController(root, this.notes, () => content.focus(), this.language);
    this.listen(close, "click", () => this.close());
    this.listen(edit, "click", () => {
      if (this.editing) return;
      this.editing = true;
      const input = this.element(root, "textarea", "deer-reader-editor");
      input.setAttribute("aria-label", this.t(filePath.toLowerCase().endsWith(".md") ? "Markdown 原文" : "HTML 原文"));
      input.value = this.original; this.editInput = input;
      content.hidden = true; edit.hidden = true; htmlMode.hidden = true; cancel.hidden = false; save.hidden = false;
      input.focus();
      this.listen(input, "keydown", event => {
        const key = event as KeyboardEvent;
        if (key.key === "Enter" && (key.ctrlKey || key.metaKey) && !key.isComposing) {
          key.preventDefault(); void saveEdit();
        }
      });
    });
    const endEdit = () => {
      this.editing = false; this.editInput?.remove(); this.editInput = null;
      content.hidden = false; edit.hidden = false; htmlMode.hidden = !filePath.match(/\.html?$/i); cancel.hidden = true; save.hidden = true;
      edit.focus();
    };
    this.listen(cancel, "click", () => {
      if (this.saving) return;
      if (this.editInput?.value !== this.original && !root.ownerDocument.defaultView?.confirm(this.t("放弃未保存的修改？"))) return;
      endEdit();
    });
    const saveEdit = async () => {
      if (this.saving || !this.editInput) return;
      const next = this.editInput.value;
      const file = this.resolveFile(filePath);
      this.saving = true; save.disabled = true; cancel.disabled = true;
      try {
        await this.app.vault.process(file, current => {
          if (current !== this.original) throw new Error(this.t("文件已在别处修改，请复制当前内容后重新打开。"));
          return next;
        });
        this.original = next;
        if (revision !== this.revision || this.disposed) return;
        if (file.extension.toLowerCase() === "md") await this.renderMarkdown(next, filePath, content, title, revision);
        else this.renderHtml(next, filePath, content);
        endEdit();
        new Notice(this.t("修改已保存"));
      } catch (error) { this.showError(error, revision); }
      finally { this.saving = false; save.disabled = false; cancel.disabled = false; }
    };
    this.listen(save, "click", () => { void saveEdit(); });
    this.listen(htmlMode, "click", () => {
      this.htmlTextMode = !this.htmlTextMode;
      htmlMode.textContent = this.t(this.htmlTextMode ? "交互预览" : "阅读文本");
      this.renderHtml(this.original, filePath, content);
      content.focus();
    });
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
      else if (this.editing) cancel.click();
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
      const extension = file.extension.toLowerCase();
      const markdown = ["md", "html", "htm"].includes(extension) ? await this.app.vault.cachedRead(file) : "";
      if (revision !== this.revision || this.disposed) return;
      if (extension === "md") {
        this.original = markdown;
        edit.hidden = false;
        await this.renderMarkdown(markdown, filePath, content, title, revision);
      } else if (extension === "html" || extension === "htm") {
        this.original = markdown;
        edit.hidden = false; htmlMode.hidden = false;
        this.renderHtml(markdown, filePath, content);
      } else {
        const image = this.element(content, "img", "deer-reader-image");
        image.alt = file.basename;
        image.src = this.app.vault.getResourcePath(file);
        content.replaceChildren(image);
      }
    } catch (error) {
      if (revision === this.revision && !this.disposed) { content.replaceChildren(); this.showError(error, revision); }
    }
  }

  close(): void {
    if ((this.editor?.isSaving || this.saving) && !this.disposed) return;
    if (this.editing && this.editInput?.value !== this.original && !this.disposed) {
      this.showError(new Error(this.t("请先保存或取消编辑。")), this.revision);
      return;
    }
    const wasOpen = this.root !== null;
    this.revision += 1;
    this.hideMenu(); this.editor?.dispose(); this.editor = null;
    this.cleanups.splice(0).forEach(cleanup => cleanup());
    this.component?.unload(); this.component = null;
    this.root?.remove(); this.root = null; this.content = null;
    this.editing = false; this.editInput = null;
    this.htmlTextMode = false;
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

  refreshLanguage(): void {
    if (!this.root) return;
    this.root.setAttribute("aria-label", this.t("文档阅读器"));
    const back = this.root.querySelector(".deer-reader-close");
    back?.setAttribute("aria-label", this.t("返回列表"));
    const label = back?.querySelector("span:not(.deer-icon)");
    if (label) label.textContent = this.t("返回列表");
    const external = this.root.querySelector(".deer-reader-external");
    if (external) external.textContent = this.t("在 Obsidian 中打开");
    const htmlMode = this.root.querySelector(".deer-reader-html-mode");
    if (htmlMode) htmlMode.textContent = this.t(this.htmlTextMode ? "交互预览" : "阅读文本");
    if (htmlMode) (htmlMode as HTMLElement).title = this.t("交互预览只运行内嵌脚本与样式，外部资源不会加载。");
    for (const [selector, label] of [[".deer-reader-edit", "编辑原文"], [".deer-reader-cancel", "取消编辑"], [".deer-reader-save", "保存修改"]]) {
      const button = this.root.querySelector(selector);
      if (button) button.textContent = this.t(label);
    }
    if (this.editInput) this.editInput.setAttribute("aria-label", this.t(this.root.dataset.path?.toLowerCase().endsWith(".md") ? "Markdown 原文" : "HTML 原文"));
    this.editor?.refreshLanguage();
    this.hideMenu();
  }

  dispose(): void { this.disposed = true; this.close(); }

  private async renderMarkdown(markdown: string, path: string, content: HTMLElement, title: HTMLElement, revision: number): Promise<void> {
    this.component?.unload();
    const component = new Component(); component.load(); this.component = component;
    const target = content.ownerDocument.createElement("div");
    try { await MarkdownRenderer.render(this.app, markdown, target, path, component); }
    finally { if (revision !== this.revision || this.disposed) component.unload(); }
    if (revision !== this.revision || this.disposed) return;
    if (!target.querySelector("h1")) {
      const folder = title.querySelector(".deer-reader-folder");
      if (folder) folder.textContent = path.replace(/\.md$/i, "").split("/").join(" / ");
    }
    if (parseDeerNote(markdown, parseYaml)) {
      for (const heading of Array.from(target.querySelectorAll("h2"))) {
        if (/^\d{2}:\d{2}:\d{2}$/.test(heading.textContent?.trim() ?? "")) heading.classList.add("deer-note-timestamp");
      }
    }
    content.replaceChildren(target);
  }

  private renderHtml(html: string, path: string, content: HTMLElement): void {
    content.classList.toggle("deer-reader-content--html", !this.htmlTextMode);
    if (!this.htmlTextMode) {
      const frame = content.ownerDocument.createElement("iframe");
      frame.className = "deer-reader-html-frame";
      frame.title = this.t("HTML 交互预览");
      // Keep vault HTML in an opaque origin; never grant access to the Obsidian window.
      frame.setAttribute("sandbox", "allow-scripts");
      frame.referrerPolicy = "no-referrer";
      const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: app: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";
      const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
      frame.srcdoc = /<head\b[^>]*>/i.test(html)
        ? html.replace(/<head\b[^>]*>/i, match => `${match}${meta}`)
        : `<!doctype html><html><head>${meta}</head><body>${html}</body></html>`;
      content.replaceChildren(frame);
      return;
    }
    const safe = DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true, FORBID_TAGS: ["script", "style", "link", "iframe", "object", "embed", "form", "meta", "base", "video", "audio", "source", "picture", "svg", "math", "canvas"], FORBID_ATTR: ["style", "srcset"] });
    for (const image of Array.from(safe.querySelectorAll("img"))) {
      const src = image.getAttribute("src") ?? "";
      const resolved = this.resolveLocalResource(src, path);
      if (resolved) image.src = resolved;
      else image.removeAttribute("src");
    }
    for (const link of Array.from(safe.querySelectorAll("a"))) link.removeAttribute("href");
    content.replaceChildren(safe);
  }

  private resolveLocalResource(src: string, source: string): string | undefined {
    if (!src || /^(?:[a-z][a-z\d+.-]*:|\/\/|\/)/i.test(src)) return undefined;
    const path = src.split(/[?#]/)[0];
    const folder = source.slice(0, source.lastIndexOf("/") + 1);
    const segments: string[] = [];
    for (const segment of `${folder}${path}`.split("/")) {
      if (segment === "..") segments.pop();
      else if (segment && segment !== ".") segments.push(segment);
    }
    const file = this.app.vault.getAbstractFileByPath(segments.join("/")) ?? this.app.vault.getAbstractFileByPath(path);
    return file && "extension" in file && typeof file.extension === "string" && ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(file.extension.toLowerCase())
      ? this.app.vault.getResourcePath(file as TFile) : undefined;
  }

  private updateSelection(filePath: string): boolean {
    if (!this.root || !this.content || this.editor?.isOpen) return false;
    const selection = this.content.ownerDocument.getSelection();
    const anchor = selection?.rangeCount === 1 ? selectionFromRange(selection.getRangeAt(0), this.content) : null;
    if (!anchor) { this.hideMenu(); return false; }
    // Retain a focused action when selectionchange follows pointerdown on it.
    if (this.menu?.contains(this.host.ownerDocument.activeElement)) return true;
    this.hideMenu();
    const menu = this.element(this.root, "div", "deer-selection-menu"); this.menu = menu;
    menu.classList.add("deer-selection-menu-pending");
    const button = this.element(menu, "button", "mod-cta", this.t("做笔记")); button.type = "button";
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
      const size = menu.getBoundingClientRect();
      if (!size.width || !size.height) return false;
      const left = Math.max(minLeft, Math.min(anchor.rect.left, maxRight - size.width));
      const top = Math.max(minTop, Math.min(anchor.rect.bottom + 8, maxBottom - size.height));
      menu.style.left = `${left - rect.left}px`; menu.style.top = `${top - rect.top}px`;
      menu.classList.remove("deer-selection-menu-pending");
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
    if (!file || !("extension" in file) || typeof file.extension !== "string" || !["md", "html", "htm", "png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(file.extension.toLowerCase())) {
      throw new Error(this.t("笔记已移动或不存在：{0}", path));
    }
    return file as TFile;
  }

  private showError(error: unknown, revision: number): void {
    if (revision !== this.revision || !this.root || this.disposed) return;
    const message = this.t("无法打开笔记：{0}", error instanceof Error ? error.message : "请重试");
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
