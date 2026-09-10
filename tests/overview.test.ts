import { describe, expect, it } from "vitest";
import { buildKnowledgeOverview } from "../src/domain/overview";
import { DEFAULT_SETTINGS } from "../src/settings";
import type { VaultSnapshot } from "../src/services/vault-index";

const date = (day: number, hour = 0) => new Date(2026, 8, day, hour).getTime();
const now = new Date(date(10, 12));
const file = (path: string, ctime: number, mtime = ctime) => ({ path, name: path.split("/").pop()!, basename: path.split("/").pop()!.replace(/\.md$/, ""), extension: "md", ctime, mtime });
const snapshot = (files: ReturnType<typeof file>[], folders: string[] = []): VaultSnapshot => ({
  markdownFiles: files, deerNotes: [], rootFolders: folders.map(path => ({ path, name: path }))
});

describe("knowledge overview", () => {
  it("counts the inclusive local-day boundary and preserves the earlier cumulative baseline", () => {
    const result = buildKnowledgeOverview(snapshot([
      file("阅读/old.md", date(-10), date(9)), file("阅读/start.md", date(4)),
      file("项目/today.md", date(10, 10)), file("root.md", date(9, 23))
    ]), DEFAULT_SETTINGS, 7, now);
    expect(result.total).toBe(4); expect(result.added).toBe(3); expect(result.updated).toBe(4);
    expect(result.trend).toHaveLength(7);
    expect(result.trend[0]).toEqual({ date: "2026-09-04", added: 1, total: 2 });
    expect(result.trend.at(-1)).toEqual({ date: "2026-09-10", added: 1, total: 4 });
    expect(result.categories.reduce((sum, category) => sum + category.count, 0)).toBe(result.total);
    expect(result.categories.find(category => category.path === "")?.name).toBe("根目录");
  });
  it("excludes hidden folders and dot paths, includes empty categories, and orders recent articles without mutating input", () => {
    const input = snapshot([file("私密/a.md", date(10)), file("私密/nested/b.md", date(10)),
      file("阅读/.archive/c.md", date(10)), ...[1, 2, 3, 4].map(day => file(`阅读/${day}.md`, date(day), date(day)))], ["阅读", "私密", "空目录", ".hidden"]);
    const paths = input.markdownFiles.map(file => file.path);
    const result = buildKnowledgeOverview(input, { ...DEFAULT_SETTINGS, hiddenRootFolders: ["私密"] }, 30, now);
    expect(result.total).toBe(4);
    expect(result.categories.map(category => category.name)).toEqual(["阅读", "空目录"]);
    expect(result.categories[0].recent.map(file => file.basename)).toEqual(["4", "3", "2"]);
    expect(result.categories[1].count).toBe(0);
    expect(input.markdownFiles.map(file => file.path)).toEqual(paths);
  });
  it("handles empty vaults, periods with no additions, and unknown or future creation dates without fabricating growth", () => {
    const empty = buildKnowledgeOverview(snapshot([]), DEFAULT_SETTINGS, 90, now);
    expect(empty.trend).toHaveLength(90); expect(empty.trend.every(day => day.total === 0 && day.added === 0)).toBe(true);
    const invalid = buildKnowledgeOverview(snapshot([file("a.md", NaN), file("b.md", date(11)), file("old.md", date(-50))]), DEFAULT_SETTINGS, 7, now);
    expect(invalid.total).toBe(3); expect(invalid.unknownCreated).toBe(2); expect(invalid.added).toBe(0);
    expect(invalid.trend.every(day => day.total === 1)).toBe(true);
  });
});
