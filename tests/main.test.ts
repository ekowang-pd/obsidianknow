import { describe, expect, it, vi } from "vitest";

import { VIEW_TYPE_DEER_NOTES } from "../src/main";
import DeerNotesPlugin from "../src/main";
import type { DeerNotesSettings } from "../src/settings";

describe("Deer Notes plugin", () => {
  it("exports the dashboard view type", () => {
    expect(VIEW_TYPE_DEER_NOTES).toBe("deer-notes-dashboard");
  });

  it("loads normalized settings and registers the settings tab", async () => {
    const plugin = new DeerNotesPlugin({} as never, {} as never);
    const underTest = plugin as typeof plugin & { settings: DeerNotesSettings };
    vi.spyOn(plugin, "loadData").mockResolvedValue({ notesFolder: " 80 笔记/ " });
    const addSettingTab = vi.spyOn(plugin, "addSettingTab");

    await underTest.onload();

    expect(underTest.settings).toEqual({
      notesFolder: "80 笔记",
      attachmentsFolder: "附件",
      hiddenRootFolders: []
    });
    expect(addSettingTab).toHaveBeenCalledTimes(1);
  });

  it("persists normalized settings", async () => {
    const plugin = new DeerNotesPlugin({} as never, {} as never);
    const underTest = plugin as typeof plugin & {
      settings: DeerNotesSettings;
      saveSettings(next: DeerNotesSettings): Promise<void>;
    };
    const saveData = vi.spyOn(plugin, "saveData");

    await underTest.saveSettings({
      notesFolder: "../秘密",
      attachmentsFolder: " 附件/ ",
      hiddenRootFolders: ["收件箱", "收件箱"]
    });

    expect(saveData).toHaveBeenCalledWith({
      notesFolder: "小鹿笔记",
      attachmentsFolder: "附件",
      hiddenRootFolders: ["收件箱"]
    });
  });
});
