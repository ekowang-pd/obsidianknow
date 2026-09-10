// Minimal DOM boundary for the Node unit suite; visual/browser QA is separate.
export class TestElement {
  children: TestElement[] = [];
  parentElement: TestElement | null = null;
  className = "";
  textContent = "";
  value = "";
  type = "";
  title = "";
  hidden = false;
  disabled = false;
  files: unknown[] = [];
  selectionStart = 0;
  selectionEnd = 0;
  rows = 0;
  placeholder = "";
  accept = "";
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  private listeners = new Map<string, Set<(event: any) => unknown>>();
  ownerDocument: TestDocument;

  constructor(public tagName = "div", document?: TestDocument) { this.ownerDocument = document ?? new TestDocument(); }
  append(...nodes: TestElement[]): void {
    nodes.forEach(node => { node.parentElement = this; this.children.push(node); });
  }
  replaceChildren(...nodes: TestElement[]): void {
    if (this.children.some(node => node.contains(this.ownerDocument.activeElement))) this.ownerDocument.activeElement = null;
    this.children.forEach(node => { node.parentElement = null; });
    this.children = [];
    this.append(...nodes);
  }
  empty(): void { this.replaceChildren(); }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  focus(): void { this.ownerDocument.activeElement = this; }
  contains(node: TestElement | null): boolean { return node === this || this.children.some(child => child.contains(node)); }
  setSelectionRange(start: number, end: number): void { this.selectionStart = start; this.selectionEnd = end; }
  addEventListener(event: string, listener: (event: any) => unknown): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
  }
  removeEventListener(event: string, listener: (event: any) => unknown): void { this.listeners.get(event)?.delete(listener); }
  closest(): TestElement | null {
    return this.tagName === "button" && this.dataset.action ? this : this.parentElement?.closest() ?? null;
  }
  click(): void { if (!this.disabled) this.dispatch("click"); }
  dispatch(type: string, target: TestElement = this): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ target, preventDefault() {} });
    this.parentElement?.dispatch(type, target);
  }
  find(predicate: (node: TestElement) => boolean): TestElement[] {
    return [...(predicate(this) ? [this] : []), ...this.children.flatMap(child => child.find(predicate))];
  }
}

class TestDocument {
  activeElement: TestElement | null = null;
  createElement(tag: string): TestElement { return new TestElement(tag, this); }
  createElementNS(_namespace: string, tag: string): TestElement { return new TestElement(tag, this); }
}
