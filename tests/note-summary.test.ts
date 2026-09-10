import { describe, expect, it } from "vitest";
import { noteSummary } from "../src/views/note-summary";

describe("noteSummary", () => {
  it("keeps the body while removing generated metadata and repeated titles", () => {
    const markdown = '---\ntype: deer-note\n---\n\n# 今天\n\n来源：[[阅读/文章]]\n\n## 12:00:00\n\n今天\n\n我的**理解**。\n\n> 一句原文。';
    expect(noteSummary(markdown, "今天")).toBe("我的理解。\n\n一句原文。");
  });
  it("makes links readable, keeps paragraph spacing, and bounds long excerpts", () => {
    expect(noteSummary("# 阅读\n\n[网站](https://example.com) 和 [[文档|知识]]\n\n下一段", "阅读")).toBe("网站 和 知识\n\n下一段");
    expect(noteSummary("长".repeat(1000), "标题")).toHaveLength(480);
    expect(noteSummary("# 标题\n\n引文\n\n标题\n\n感想 #阅读", "标题", ["阅读"])).toBe("引文\n\n感想");
  });
});
