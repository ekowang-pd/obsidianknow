import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "../src/settings";
import { buildRootNavigation } from "../src/domain/navigation";

describe("root navigation", () => {
  it("excludes configured and hidden root folders before natural sorting", () => {
    const result = buildRootNavigation(
      ["10 项目", ".obsidian", "小鹿笔记", "01 收件箱", "附件库"],
      { ...DEFAULT_SETTINGS, hiddenRootFolders: ["附件库"] }
    );

    expect(result.map((item) => item.path)).toEqual(["01 收件箱", "10 项目"]);
    expect(result.map((item) => item.label)).toEqual(["01 收件箱", "10 项目"]);
  });
});
