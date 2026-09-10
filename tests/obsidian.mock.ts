export class Plugin {
  async loadData(): Promise<unknown> {
    return null;
  }

  async saveData(): Promise<void> {}

  addSettingTab(): void {}
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
