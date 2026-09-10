import { Notice } from "obsidian";
import type { NoteService } from "../services/note-service";
import type { SelectionAnchor } from "./selection-model";

export class SelectionNoteController {
  private root: HTMLElement | null = null;
  private cleanups: (() => void)[] = [];
  private disposed = false;
  private revision = 0;
  private saving = false;

  constructor(private host: HTMLElement, private getNotes: () => NoteService, private restoreFocus: () => void) {}

  get isOpen(): boolean { return this.root !== null; }
  get isSaving(): boolean { return this.saving; }

  open(anchor: SelectionAnchor, filePath: string): void {
    if (this.disposed || this.root) return;
    const revision = ++this.revision;
    const notes = this.getNotes();
    const root = this.host.ownerDocument.createElement("section");
    root.className = "deer-selection-note";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "摘录笔记");
    root.setAttribute("aria-modal", "true");
    root.tabIndex = -1;
    this.root = root;
    this.element(root, "h2", "deer-excerpt-heading", "摘录笔记");
    this.element(root, "p", "deer-excerpt-source", `来自 ${filePath.split("/").pop()?.replace(/\.md$/i, "")}`);
    const excerpt = this.element(root, "blockquote", "deer-excerpt", anchor.excerpt);
    excerpt.setAttribute("aria-label", "原文摘录（只读）");
    const label = this.element(root, "label", "", "笔记（Markdown）");
    const input = this.element(label, "textarea", "deer-excerpt-input");
    input.rows = 6;
    input.placeholder = "写下你的理解，或一个新的想法…";
    const error = this.element(root, "p", "deer-error");
    error.hidden = true;
    error.setAttribute("role", "alert");
    const status = this.element(root, "p", "deer-muted");
    status.setAttribute("role", "status");
    status.hidden = true;
    const actions = this.element(root, "div", "deer-excerpt-actions");
    const cancel = this.element(actions, "button", "", "取消");
    const save = this.element(actions, "button", "mod-cta", "保存笔记");
    cancel.type = save.type = "button";
    this.listen(cancel, "click", () => this.close());
    this.listen(save, "click", () => {
      if (this.saving) return;
      this.saving = true; save.disabled = true; input.disabled = true; cancel.disabled = true; error.hidden = true;
      root.setAttribute("aria-busy", "true");
      status.textContent = "正在保存，请稍候…"; status.hidden = false;
      root.focus();
      void notes.saveExcerptNote({ source: filePath, excerpt: anchor.excerpt, body: input.value, date: new Date() })
        .then(() => {
          if (revision !== this.revision || this.disposed) return;
          this.saving = false;
          this.close(); new Notice("笔记已保存");
        })
        .catch((failure: unknown) => {
          if (revision !== this.revision || this.disposed) return;
          error.textContent = `保存失败：${failure instanceof Error ? failure.message : "请重试"}`;
          error.hidden = false; new Notice(error.textContent);
        })
        .finally(() => {
          if (revision !== this.revision || this.disposed) return;
          this.saving = false; save.disabled = false; input.disabled = false; cancel.disabled = false;
          root.setAttribute("aria-busy", "false"); status.hidden = true; input.focus();
        });
    });
    this.listen(root, "keydown", event => {
      if ((event as KeyboardEvent).key !== "Tab") return;
      const items = [input, cancel, save].filter(item => !item.disabled);
      if (!items.length) { event.preventDefault(); root.focus(); return; }
      const current = root.ownerDocument.activeElement;
      const backwards = (event as KeyboardEvent).shiftKey;
      if (backwards && current === items[0]) { event.preventDefault(); items[items.length - 1].focus(); }
      else if (!backwards && current === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
    });
    this.host.append(root); input.focus();
  }

  close(): void {
    if (this.saving && !this.disposed) return;
    this.revision += 1;
    const wasOpen = this.root !== null;
    this.cleanups.splice(0).forEach(cleanup => cleanup());
    this.root?.remove(); this.root = null;
    this.saving = false;
    if (wasOpen) this.restoreFocus();
  }

  dispose(): void { this.disposed = true; this.close(); }

  private element<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
    const element = parent.ownerDocument.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    parent.append(element); return element;
  }

  private listen(target: HTMLElement, event: string, listener: (event: Event) => void): void {
    target.addEventListener(event, listener);
    this.cleanups.push(() => target.removeEventListener(event, listener));
  }
}
