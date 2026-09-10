import { Notice, Plugin } from "obsidian";
import type { TFile } from "obsidian";

import { NoteService } from "./services/note-service";
import { VaultIndex } from "./services/vault-index";
import { DeerNotesView, VIEW_TYPE_DEER_NOTES } from "./views/dashboard-view";

import {
  DEFAULT_SETTINGS,
  DeerNotesSettings,
  DeerNotesSettingTab,
  normalizeSettings
} from "./settings";

export { VIEW_TYPE_DEER_NOTES };

export default class DeerNotesPlugin extends Plugin {
  settings: DeerNotesSettings = { ...DEFAULT_SETTINGS };
  private dashboardSettingsRefresh: (() => void) | null = null;
  private index: VaultIndex | null = null;
  private notes: NoteService | null = null;
  private ready: Promise<void> = Promise.resolve();
  private disposed = false;
  private activation: Promise<void> | null = null;

  async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
    this.addSettingTab(new DeerNotesSettingTab(this));
    this.index = new VaultIndex(this.app.vault, this.settings);
    this.notes = new NoteService(this.app.vault, this.settings);
    this.register(() => {
      this.disposed = true;
      this.index?.dispose();
      this.dashboardSettingsRefresh = null;
    });
    const initialIndex = this.index;
    this.ready = new Promise<void>(resolve => this.app.workspace.onLayoutReady(resolve))
      .then(async () => { if (!this.disposed && this.index === initialIndex) await initialIndex.initialize(); });
    void this.ready.catch(error => this.showError(error));
    this.registerView(VIEW_TYPE_DEER_NOTES, leaf => new DeerNotesView(
      leaf, this.index!, this.notes!, this.settings,
      path => this.openDashboardFile(path),
      path => this.readBody(path)
    ));
    const activate = () => { void this.activateView().catch(error => this.showError(error)); };
    this.addRibbonIcon("notebook-pen", "打开小鹿笔记", activate);
    this.addCommand({ id: "open-dashboard", name: "打开小鹿笔记", callback: activate });
  }

  async saveSettings(next: DeerNotesSettings): Promise<void> {
    const previousFolder = this.settings.notesFolder;
    this.settings = normalizeSettings(next);
    await this.saveData(this.settings);
    if (this.index && !this.disposed) {
      this.notes = new NoteService(this.app.vault, this.settings);
      if (previousFolder !== this.settings.notesFolder) {
        this.index.dispose();
        this.index = new VaultIndex(this.app.vault, this.settings);
        this.ready = this.index.initialize();
      }
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_DEER_NOTES)) {
        if (leaf.view instanceof DeerNotesView) leaf.view.updateSettings(this.settings, this.index, this.notes);
      }
      await this.ready;
    }
    this.dashboardSettingsRefresh?.();
  }

  async activateView(): Promise<void> {
    if (this.activation) return this.activation;
    this.activation = this.openDashboard();
    try { await this.activation; }
    finally { this.activation = null; }
  }

  private async openDashboard(): Promise<void> {
    await this.ready;
    if (this.disposed) return;
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_DEER_NOTES)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE_DEER_NOTES, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
  }

  // Task 6 can replace this path-based integration point with the split reader.
  async openDashboardFile(path: string): Promise<void> {
    await this.app.workspace.openLinkText(path, "", "tab");
  }

  private async readBody(path: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !("extension" in file) || typeof file.extension !== "string" || file.extension.toLowerCase() !== "md") {
      throw new Error(`笔记已移动或不存在：${path}`);
    }
    return this.app.vault.cachedRead(file as TFile);
  }

  private showError(error: unknown): void {
    if (!this.disposed) new Notice(`小鹿笔记：${error instanceof Error ? error.message : "请重试"}`);
  }

  setDashboardSettingsRefresh(handler: (() => void) | null): void {
    this.dashboardSettingsRefresh = handler;
  }
}
