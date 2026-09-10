import { TestElement } from "./dom.mock";

export class Component {
  private cleanups: (() => unknown)[] = [];
  load(): void {}
  unload(): void { this.cleanups.splice(0).forEach(cleanup => cleanup()); }
  register(cleanup: () => unknown): void { this.cleanups.push(cleanup); }
  addChild<T>(child: T): T { return child; }
  removeChild<T>(child: T): T { (child as Component).unload(); return child; }
}

export class Plugin extends Component {
  app: any;
  constructor(app?: unknown, _manifest?: unknown) { super(); this.app = app; }
  async loadData(): Promise<unknown> {
    return null;
  }

  async saveData(): Promise<void> {}

  addSettingTab(): void {}
  registerView(_type: string, _factory: (leaf: any) => unknown): void {}
  addRibbonIcon(_icon: string, _label: string, _callback: () => unknown): void {}
  addCommand(_command: unknown): void {}
}

export class ItemView extends Component {
  app: any;
  contentEl = new TestElement();
  constructor(public leaf: any) { super(); this.app = leaf.app; }
}

export function setIcon(_el: unknown, _icon: string): void {}
export class MarkdownRenderer {
  static async render(_app: unknown, markdown: string, target: TestElement, _path: string, _component: Component): Promise<void> {
    target.textContent = markdown;
  }
}

export class PluginSettingTab {
  containerEl = {
    empty(): void {}
  };

  constructor(_app: unknown, _plugin: Plugin) {}
}

export class Setting {
  constructor(_containerEl: unknown) {}

  setName(): this {
    return this;
  }

  setDesc(): this {
    return this;
  }

  addText(callback: (component: TextComponent) => void): this {
    callback(new TextComponent());
    return this;
  }
}

export class TextComponent {
  setValue(): this {
    return this;
  }

  setPlaceholder(): this {
    return this;
  }

  onChange(): this {
    return this;
  }
}

export class Notice {
  constructor(_message: string) {}
}
