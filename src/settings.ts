import { Notice, Plugin, PluginSettingTab, Setting } from "obsidian";

export interface DeerNotesSettings {
  notesFolder: string;
  attachmentsFolder: string;
  hiddenRootFolders: string[];
}

export const DEFAULT_SETTINGS: DeerNotesSettings = {
  notesFolder: "小鹿笔记",
  attachmentsFolder: "附件",
  hiddenRootFolders: []
};

const VAULT_PATH_ERROR = "路径必须是 Vault 内的相对路径";

export function validateVaultPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").trim().replace(/\/+$/, "");

  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:($|\/)/.test(normalized) ||
    normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(VAULT_PATH_ERROR);
  }

  return normalized;
}

function normalizedStoredPath(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  try {
    return validateVaultPath(value);
  } catch {
    return fallback;
  }
}

function normalizeHiddenRootFolders(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const folders = new Set<string>();
  for (const folder of value) {
    if (typeof folder !== "string") {
      continue;
    }

    try {
      folders.add(validateVaultPath(folder));
    } catch {
      // Stored settings may be stale or malformed; keep the safe defaults.
    }
  }

  return [...folders];
}

export function normalizeSettings(input: unknown): DeerNotesSettings {
  const stored = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};

  return {
    notesFolder: normalizedStoredPath(stored.notesFolder, DEFAULT_SETTINGS.notesFolder),
    attachmentsFolder: normalizedStoredPath(
      stored.attachmentsFolder,
      DEFAULT_SETTINGS.attachmentsFolder
    ),
    hiddenRootFolders: normalizeHiddenRootFolders(stored.hiddenRootFolders)
  };
}

export interface DeerNotesSettingsPlugin extends Plugin {
  settings: DeerNotesSettings;
  saveSettings(next: DeerNotesSettings): Promise<void>;
}

export class DeerNotesSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: DeerNotesSettingsPlugin) {
    super(plugin.app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("笔记目录")
      .setDesc("小鹿笔记保存 Markdown 文件的 Vault 内相对目录。")
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_SETTINGS.notesFolder)
          .setValue(this.plugin.settings.notesFolder)
          .onChange(async (value) => this.savePath("notesFolder", value));
      });

    new Setting(containerEl)
      .setName("附件目录")
      .setDesc("位于笔记目录内的附件子目录。")
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_SETTINGS.attachmentsFolder)
          .setValue(this.plugin.settings.attachmentsFolder)
          .onChange(async (value) => this.savePath("attachmentsFolder", value));
      });

    new Setting(containerEl)
      .setName("隐藏的根目录")
      .setDesc("以英文逗号分隔；这些目录不会显示在小鹿笔记导航中。")
      .addText((text) => {
        text
          .setPlaceholder("例如：模板, 附件库")
          .setValue(this.plugin.settings.hiddenRootFolders.join(", "))
          .onChange(async (value) => this.saveHiddenRootFolders(value));
      });
  }

  private async savePath(
    key: "notesFolder" | "attachmentsFolder",
    value: string
  ): Promise<void> {
    try {
      await this.plugin.saveSettings({
        ...this.plugin.settings,
        [key]: validateVaultPath(value)
      });
    } catch (error) {
      this.showInvalidPath(error);
    }
  }

  private async saveHiddenRootFolders(value: string): Promise<void> {
    try {
      const folders = value
        .split(",")
        .map((folder) => folder.trim())
        .filter(Boolean)
        .map(validateVaultPath);

      await this.plugin.saveSettings({
        ...this.plugin.settings,
        hiddenRootFolders: [...new Set(folders)]
      });
    } catch (error) {
      this.showInvalidPath(error);
    }
  }

  private showInvalidPath(error: unknown): void {
    new Notice(error instanceof Error ? error.message : VAULT_PATH_ERROR);
  }
}
