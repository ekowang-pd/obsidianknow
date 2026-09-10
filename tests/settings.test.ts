import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  validateVaultPath
} from "../src/settings";

describe("settings", () => {
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
