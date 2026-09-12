import { describe, expect, it } from "vitest";
import { noteCover } from "../src/views/note-cover";
import { noteSummary } from "../src/views/note-summary";

describe("note cover", () => {
  it("supports local markdown and Obsidian embeds with sizes, titles and encoded spaces", () => {
    expect(noteCover('![[附件/旅行照片.jpg|600]]')).toEqual({path:'附件/旅行照片.jpg',alt:''});
    expect(noteCover('![View](<photos/my photo.png> "Caption")')).toEqual({path:'photos/my photo.png',alt:'View'});
    expect(noteCover('![](../photos/my%20photo.webp)')).toEqual({path:'../photos/my photo.webp',alt:''});
  });
  it("skips remote, executable, nonimage and code examples", () => {
    const body = '---\ncover: ![[meta.png]]\n---\n```md\n![[example.png]]\n```\n`![[inline.png]]`\n![](https://example.com/a.png)\n![](//example.com/a.png)\n![[document.pdf]]\n![[image.svg]]\n![[real.jpg]]';
    expect(noteCover(body)?.path).toBe('real.jpg');
    expect(noteCover('![](data:image/png;base64,abc)')).toBeUndefined();
    expect(noteCover('Only text')).toBeUndefined();
  });
  it("does not leak embed syntax or attachment filenames into the excerpt", () => {
    expect(noteSummary('![[photos/a.jpg|400]]\n\n![Photo](photos/b.png)\n\nMy own thoughts.', 'Note')).toBe('My own thoughts.');
  });
});
