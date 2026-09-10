import MarkdownIt from 'markdown-it';
import { createElement, NotebookPen, Folder, Notebook, ChartNoAxesCombined, FileText, Tag, Image, Bold, List, ListOrdered, Eye, Plus, Search, ChevronRight, ArrowLeft } from 'lucide';
export { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export class Component {
  private cleanups: (() => unknown)[] = [];
  private children = new Set<Component>();
  load(): void {}
  register(cleanup: () => unknown): void { this.cleanups.push(cleanup); }
  addChild<T extends Component>(child: T): T { this.children.add(child); child.load(); return child; }
  removeChild<T extends Component>(child: T): T { this.children.delete(child); child.unload(); return child; }
  unload(): void {
    for (const child of this.children) child.unload(); this.children.clear();
    this.cleanups.splice(0).forEach(cleanup => cleanup());
  }
}
export class ItemView extends Component {
  app: any;
  contentEl: HTMLElement;
  constructor(public leaf: any) { super(); this.app = leaf.app; this.contentEl = leaf.contentEl; }
}
// Settings UI is supplied by Obsidian in the plugin; this harness mounts the shared view directly.
export class Plugin extends Component {}
export class PluginSettingTab {}
export class Setting {}
export class Notice {
  constructor(message: string) {
    const element = document.createElement('div'); element.className = 'preview-notice'; element.textContent = message;
    document.querySelector('#notices')?.append(element); setTimeout(() => element.remove(), 5000);
  }
}
const icons = { 'notebook-pen': NotebookPen, folder: Folder, notebook: Notebook, 'chart-no-axes-combined': ChartNoAxesCombined,
  'file-text': FileText, tag: Tag, image: Image, bold: Bold, list: List, 'list-ordered': ListOrdered, eye: Eye, plus: Plus,
  search: Search, 'chevron-right': ChevronRight, 'arrow-left': ArrowLeft };
export function setIcon(element: HTMLElement, name: string): void {
  const icon = icons[name as keyof typeof icons]; if (icon) element.replaceChildren(createElement(icon));
}
const markdown = new MarkdownIt({ html: false, breaks: false });
export class MarkdownRenderer {
  static async render(app: any, text: string, target: HTMLElement, source: string, _component: Component): Promise<void> {
    const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
      .replace(/\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g, (_all, path, title) => `[${title ?? path}](<${encodeURI(path)}>)`);
    // Raw HTML is disabled in the parser; default protocol validation remains enabled.
    target.innerHTML = markdown.render(body);
    for (const link of target.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      const href = link.getAttribute('href')!;
      if (!/^[a-z][a-z\d+.-]*:/i.test(href)) { link.classList.add('internal-link'); link.dataset.href = decodeURI(href); }
      else { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    }
    for (const image of target.querySelectorAll<HTMLImageElement>('img')) {
      const path = image.getAttribute('src') ?? '';
      const resource = app.vault.resource(path, source);
      if (resource) image.src = resource;
      else { const placeholder = document.createElement('span'); placeholder.textContent = `[图片：${image.alt || path}，请在 Obsidian 查看]`; image.replaceWith(placeholder); }
    }
  }
}
