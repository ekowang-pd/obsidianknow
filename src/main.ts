import { Plugin } from "obsidian";

import {
  DEFAULT_SETTINGS,
  DeerNotesSettings,
  DeerNotesSettingTab,
  normalizeSettings
} from "./settings";

export const VIEW_TYPE_DEER_NOTES = "deer-notes-dashboard";

export default class DeerNotesPlugin extends Plugin {
  settings: DeerNotesSettings = { ...DEFAULT_SETTINGS };
  private dashboardSettingsRefresh: (() => void) | null = null;

  async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
    this.addSettingTab(new DeerNotesSettingTab(this));
  }

  async saveSettings(next: DeerNotesSettings): Promise<void> {
    this.settings = normalizeSettings(next);
    await this.saveData(this.settings);
    this.dashboardSettingsRefresh?.();
  }

  setDashboardSettingsRefresh(handler: (() => void) | null): void {
    this.dashboardSettingsRefresh = handler;
  }
}
