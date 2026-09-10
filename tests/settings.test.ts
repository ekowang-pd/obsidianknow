import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  DeerNotesSettingTab,
  normalizeSettings,
  validateVaultPath
} from "../src/settings";
import { TestElement } from "./dom.mock";

function settingsUI() {
  const entries = [
    { path: "小鹿笔记", children: [] }, { path: "小鹿笔记/附件", children: [] },
    { path: "小鹿笔记/资料/图片", children: [] }, { path: "80 笔记", children: [] },
    { path: "80 笔记/相册", children: [] }, { path: ".obsidian", children: [] },
    { path: "用户笔记.md", extension: "md" }
  ];
  const plugin = {
    app: { vault: { getAllLoadedFiles: () => entries } },
    settings: { ...DEFAULT_SETTINGS },
    async saveSettings(next: typeof DEFAULT_SETTINGS) { this.settings = next; }
  };
  const tab = new DeerNotesSettingTab(plugin as never);
  tab.display();
  const root = tab.containerEl as unknown as TestElement;
  const input = (placeholder: string) => root.find(node => node.tagName === "input" && node.placeholder === placeholder)[0];
  const options = (input: TestElement) => root.find(node => node.tagName === "datalist" && node.getAttribute("id") === input.getAttribute("list"))[0]?.children.map(option => option.value) ?? [];
  return { plugin, entries, tab, input, options };
}

describe("settings", () => {
  it("suggests existing Vault folders and saves a selected notes folder without offering files or hidden configuration", async () => {
    const ui = settingsUI();
    const input = ui.input("小鹿笔记");
    expect(ui.options(input)).toContain("80 笔记");
    expect(ui.options(input)).toContain("小鹿笔记/资料/图片");
    expect(ui.options(input)).not.toContain("用户笔记.md");
    expect(ui.options(input)).not.toContain(".obsidian");
    input.value = "80 笔记";
    input.dispatch("input");
    await Promise.resolve();
    expect(ui.plugin.settings.notesFolder).toBe("80 笔记");
  });

  it("suggests attachment descendants relative to the current notes folder and refreshes after a folder change", async () => {
    const ui = settingsUI();
    const attachments = ui.input("附件");
    expect(ui.options(attachments)).toEqual(["附件", "资料/图片"]);
    ui.input("小鹿笔记").value = "80 笔记";
    ui.input("小鹿笔记").dispatch("input");
    await Promise.resolve();
    ui.entries.push({ path: "80 笔记/新附件", children: [] });
    attachments.dispatch("focus");
    expect(ui.options(attachments)).toEqual(["相册", "新附件"]);
    attachments.value = "新附件";
    attachments.dispatch("input");
    await Promise.resolve();
    expect(ui.plugin.settings.attachmentsFolder).toBe("新附件");
  });

  it("normalizes an empty stored value to the exact defaults", () => {
    expect(normalizeSettings({})).toEqual({
      notesFolder: "小鹿笔记",
      attachmentsFolder: "附件",
      hiddenRootFolders: []
    });
  });

  it("rejects paths outside the Vault", () => {
    expect(() => validateVaultPath("../秘密")).toThrow("Vault 内的相对路径");
    expect(() => validateVaultPath("/绝对路径")).toThrow("Vault 内的相对路径");
  });

  it("rejects Windows drive paths after trailing slashes are normalized", () => {
    expect(() => validateVaultPath("C:/")).toThrow("Vault 内的相对路径");
    expect(() => validateVaultPath("C:\\")).toThrow("Vault 内的相对路径");
  });

  it("accepts a valid Vault-relative folder", () => {
    expect(validateVaultPath("80 笔记")).toBe("80 笔记");
  });

  it("normalizes separators and invalid stored settings", () => {
    expect(normalizeSettings({
      notesFolder: " 80 笔记\\ ",
      attachmentsFolder: "../附件",
      hiddenRootFolders: [" 收件箱/ ", "收件箱", 1]
    })).toEqual({
      notesFolder: "80 笔记",
      attachmentsFolder: DEFAULT_SETTINGS.attachmentsFolder,
      hiddenRootFolders: ["收件箱"]
    });
  });
});
