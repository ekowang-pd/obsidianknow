import { describe, expect, it, vi } from "vitest";
import { parseYaml, stringifyYaml } from "obsidian";
import { parse as parseYamlDates } from "yaml";

import {
  appendNoteMarkdown as appendWithYaml,
  type AppendNoteInput,
  createNoteMarkdown,
  noteTitle,
  parseDeerNote as parseWithYaml,
  uniqueNotePath
} from "../src/domain/notes";

const createdAt = new Date(2026, 8, 10, 12, 14, 39);
const parseDeerNote = (content: string) => parseWithYaml(content, parseYaml);
const appendNoteMarkdown = (content: string, entry: AppendNoteInput) => appendWithYaml(content, entry, { parse: parseYaml, stringify: stringifyYaml });

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

  it("uses deterministic ASCII case folding instead of the runtime locale", () => {
    const localeLowerCase = vi.spyOn(String.prototype, "toLocaleLowerCase").mockImplementation(
      function localeSensitiveLowerCase(this: string): string {
        return this.replace(/I/g, "ı").toLowerCase();
      }
    );

    try {
      expect(uniqueNotePath("deer", "Idea", ["deer/idea.md"])).toBe("deer/Idea (2).md");
    } finally {
      localeLowerCase.mockRestore();
    }
  });
});

describe("deer note Markdown", () => {
  it.each([
    "tags:\n  - 思考\n  - '复盘'",
    "tags: [思考, '复盘']",
    "tags:\n- 思考\n- 复盘"
  ])("recognizes Properties-edited YAML dates, quoted type and tags: %s", tags => {
    const content = `---\ntype: 'deer-note' # plugin note\ncreated: 2026-09-10\nupdated: '2026-09-11'\nsource: Inbox/a.md\n${tags}\n\naliases:\n  - 我的别名\n---\n\n# 既有笔记\n\n正文\n`;
    expect(parseDeerNote(content)).toEqual({
      title: "既有笔记", created: "2026-09-10", updated: "2026-09-11",
      source: "Inbox/a.md", tags: ["思考", "复盘"]
    });
  });

  it("recognizes YAML timestamp dates and empty Properties fields", () => {
    const content = "---\ntype: deer-note\ncreated: 2026-09-10\nupdated: 2026-09-10\nsource:\ntags:\n---\n\n# 独立笔记\n";
    expect(parseWithYaml(content, yaml => parseYamlDates(yaml, { customTags: ["timestamp"] })))
      .toMatchObject({ created: "2026-09-10", updated: "2026-09-10", source: "", tags: [] });
  });

  it("recognizes a single tag stored as an ordinary YAML scalar", () => {
    const content = "---\ntype: deer-note\ncreated: 2026-09-10\nupdated: 2026-09-10\ntags: 思考\n---\n\n# 既有笔记\n";
    expect(parseDeerNote(content)?.tags).toEqual(["思考"]);
    expect(parseDeerNote(appendNoteMarkdown(content, { body: "新增 #复盘", excerpt: "", date: new Date(2026, 8, 10) }))?.tags).toEqual(["思考", "复盘"]);
  });

  it("preserves unrelated YAML properties and the original body when appending after a Properties edit", () => {
    const content = `---\ntype: deer-note\ncreated: 2026-09-10\nupdated: '2026-09-10'\nsource: Inbox/a.md\ntags:\n  - 思考\naliases: [一个别名, 'another: alias']\nrating: 5\npublished: false\ncustom:\n  nested: [one, two]\nsummary: |\n  多行说明\n  保留内容\n---\n\n# 既有笔记\n\n正文尾部保留空格  \n\nupdated: 正文不应改写\ntags: 正文不应改写\n`;
    const appended = appendNoteMarkdown(content, { body: "第二条 #复盘", excerpt: "选文", date: new Date(2026, 8, 11, 8) });
    const properties = parseYaml(appended.split("---")[1]);
    expect(properties).toMatchObject({
      type: "deer-note", created: "2026-09-10", updated: "2026-09-11", source: "Inbox/a.md",
      tags: ["思考", "复盘"], aliases: ["一个别名", "another: alias"], rating: 5,
      published: false, custom: { nested: ["one", "two"] }, summary: "多行说明\n保留内容\n"
    });
    expect(appended).toContain("# 既有笔记\n\n正文尾部保留空格  \n\nupdated: 正文不应改写\ntags: 正文不应改写\n\n## 08:00:00");
    expect(parseDeerNote(appended)?.tags).toEqual(["思考", "复盘"]);
  });

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
      date: new Date(2026, 8, 11, 8, 0, 1)
    });

    expect(parseDeerNote(appended)).toMatchObject({
      title: "我的想法",
      source: "01 收件箱/原文.md",
      created: "2026-09-10",
      updated: "2026-09-11",
      tags: ["思考", "复盘"]
    });
    expect(appended).toContain("## 08:00:01\n\n> 第二段\n\n第二条 #复盘");
    expect(appended).toContain("# 我的想法");
    expect(appended.match(/来源：/g)).toHaveLength(1);
    const withTrailingWhitespace = original.replace("个人判断 #思考\n", "个人判断 #思考  \n");
    expect(appendNoteMarkdown(withTrailingWhitespace, {
      body: "保留原文",
      excerpt: "",
      date: new Date(2026, 8, 11, 9)
    })).toContain("个人判断 #思考  \n\n## 09:00:00");
    const legacyNumericTag = original.replace(
      'tags: ["思考"]',
      'tags: ["思考", "2026", "复盘"]'
    );
    expect(parseDeerNote(appendNoteMarkdown(legacyNumericTag, {
      body: "新条目 #新标签",
      excerpt: "",
      date: new Date(2026, 8, 11, 10)
    }))?.tags).toEqual(["思考", "复盘", "新标签"]);
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

  it("deduplicates differently cased ASCII tags independently of the runtime locale", () => {
    const localeLowerCase = vi.spyOn(String.prototype, "toLocaleLowerCase").mockImplementation(
      function localeSensitiveLowerCase(this: string): string {
        return this.replace(/I/g, "ı").toLowerCase();
      }
    );

    try {
      const content = createNoteMarkdown({
        title: "标签大小写",
        body: "#IDEA #idea #Idea",
        date: createdAt
      });

      expect(parseDeerNote(content)?.tags).toEqual(["IDEA"]);
    } finally {
      localeLowerCase.mockRestore();
    }
  });
});
