import { describe, expect, it } from "vitest";

import {
  appendNoteMarkdown,
  createNoteMarkdown,
  noteTitle,
  parseDeerNote,
  uniqueNotePath
} from "../src/domain/notes";

const createdAt = new Date("2026-09-10T12:14:39+08:00");

describe("deer note titles and paths", () => {
  it("uses the cleaned first non-empty paragraph as the title", () => {
    expect(noteTitle("\n第一段 **重点**\n继续\n\n第二段")).toBe("第一段 重点 继续");
  });

  it("uses the fallback when a paragraph contains only Markdown and illegal filename characters", () => {
    expect(noteTitle("# <>:\\/?*|")).toBe("未命名笔记");
  });

  it("keeps readable image and link labels while cleaning their Markdown syntax", () => {
    expect(noteTitle("![猫咪](assets/cat.png)   [相关链接](https://example.com)")).toBe(
      "猫咪 相关链接"
    );
  });

  it("collapses whitespace, truncates to 60 characters, and prefixes Windows reserved names", () => {
    expect(noteTitle("  多个\t 空白\n字符  ")).toBe("多个 空白 字符");
    expect(noteTitle("一".repeat(61))).toBe("一".repeat(60));
    expect(noteTitle("CON")).toBe("笔记-CON");
    expect(noteTitle("nul.txt")).toBe("笔记-nul.txt");
  });

  it("finds a case-insensitive unused Markdown path with slash separators", () => {
    expect(uniqueNotePath("小鹿笔记", "想法", new Set(["小鹿笔记/想法.md"]))).toBe(
      "小鹿笔记/想法 (2).md"
    );
    expect(uniqueNotePath("小鹿笔记\\收集", "想法", ["小鹿笔记/收集/想法.md", "小鹿笔记/收集/想法 (2).md"])).toBe(
      "小鹿笔记/收集/想法 (3).md"
    );
    expect(uniqueNotePath("deer", "Idea", ["deer/idea.md"])).toBe("deer/Idea (2).md");
  });
});

describe("deer note Markdown", () => {
  it("creates the exact source-note frontmatter and body format", () => {
    expect(createNoteMarkdown({
      title: "我的想法",
      body: "个人判断 #思考",
      source: "01 收件箱/原文.md",
      excerpt: "被选中的原文",
      date: createdAt
    })).toBe(`---
type: deer-note
created: "2026-09-10"
updated: "2026-09-10"
source: "01 收件箱/原文.md"
tags: ["思考"]
---

# 我的想法

来源：[[01 收件箱/原文]]

## 12:14:39

> 被选中的原文

个人判断 #思考
`);
  });

  it("creates independent notes with an empty source and no source line", () => {
    const content = createNoteMarkdown({
      title: "独立笔记",
      body: "自由记录 #灵感",
      date: createdAt
    });

    expect(content).not.toContain("source:");
    expect(parseDeerNote(content)).toMatchObject({
      title: "独立笔记",
      source: "",
      created: "2026-09-10",
      updated: "2026-09-10",
      tags: ["灵感"]
    });
  });

  it("parses only well-formed deer-note frontmatter", () => {
    const content = createNoteMarkdown({
      title: "我的想法",
      body: "个人判断 #思考",
      source: "01 收件箱/原文.md",
      excerpt: "被选中的原文",
      date: createdAt
    });

    expect(parseDeerNote(content)).toMatchObject({
      title: "我的想法",
      source: "01 收件箱/原文.md",
      created: "2026-09-10",
      updated: "2026-09-10",
      tags: ["思考"]
    });
    expect(parseDeerNote("# 用户自己的笔记")).toBeNull();
    expect(parseDeerNote("---\ntype: deer-note\ncreated: not quoted\n---\n# 损坏")).toBeNull();
    expect(parseDeerNote("---\ntype: another-note\n---\n# 不是小鹿笔记")).toBeNull();
  });

  it("appends a timestamped source excerpt while changing only updated and tags metadata", () => {
    const original = createNoteMarkdown({
      title: "我的想法",
      body: "个人判断 #思考",
      source: "01 收件箱/原文.md",
      excerpt: "被选中的原文",
      date: createdAt
    });
    const appended = appendNoteMarkdown(original, {
      body: "第二条 #复盘",
      excerpt: "第二段",
      date: new Date("2026-09-11T08:00:01+08:00")
    });

    expect(parseDeerNote(appended)).toMatchObject({
      title: "我的想法",
      source: "01 收件箱/原文.md",
      created: "2026-09-10",
      updated: "2026-09-11",
      tags: ["思考", "复盘"]
    });
    expect(appended).toContain("## 08:00:01\n\n> 第二段\n\n第二条 #复盘");
    expect(appended).toContain("source: \"01 收件箱/原文.md\"");
    expect(appended).toContain("# 我的想法");
    expect(appended.match(/来源：/g)).toHaveLength(1);
    const withTrailingWhitespace = original.replace("个人判断 #思考\n", "个人判断 #思考  \n");
    expect(appendNoteMarkdown(withTrailingWhitespace, {
      body: "保留原文",
      excerpt: "",
      date: new Date("2026-09-11T09:00:00+08:00")
    })).toContain("个人判断 #思考  \n\n## 09:00:00");
    expect(() => appendNoteMarkdown("# 用户笔记", {
      body: "不应写入",
      excerpt: "",
      date: createdAt
    })).toThrow("deer-note");
  });

  it("extracts distinct Unicode tags while ignoring numeric-only and code tags", () => {
    const content = createNoteMarkdown({
      title: "标签",
      body: "计划 #思考 #思考 #2026 #标签2 `#忽略`\n```md\n#也忽略\n```",
      date: createdAt
    });

    expect(parseDeerNote(content)?.tags).toEqual(["思考", "标签2"]);
  });
});
