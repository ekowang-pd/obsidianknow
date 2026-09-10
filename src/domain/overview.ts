import type { DeerNotesSettings } from "../settings";
import type { VaultFileDescriptor, VaultSnapshot } from "../services/vault-index";

export type OverviewDays = 7 | 30 | 90;
export interface GrowthDay { date: string; added: number; total: number }
export interface KnowledgeCategory { path: string; name: string; count: number; added: number; recent: VaultFileDescriptor[] }
export interface KnowledgeOverview {
  total: number; added: number; updated: number; unknownCreated: number;
  trend: GrowthDay[]; categories: KnowledgeCategory[]; recent: VaultFileDescriptor[];
}

export function dayLabel(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function buildKnowledgeOverview(snapshot: VaultSnapshot, settings: DeerNotesSettings, days: OverviewDays, now = new Date()): KnowledgeOverview {
  const visible = (path: string) => !path.split("/").some(part => part.startsWith(".")) &&
    !settings.hiddenRootFolders.some(hidden => path === hidden || path.startsWith(`${hidden}/`));
  const files = snapshot.markdownFiles.filter(file => visible(file.path));
  const validDate = (time: number) => Number.isFinite(time) && time > 0 && time <= now.getTime();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1);
  const inPeriod = (time: number) => validDate(time) && time >= start.getTime();
  const recentFirst = (a: VaultFileDescriptor, b: VaultFileDescriptor) =>
    (validDate(b.mtime) ? b.mtime : 0) - (validDate(a.mtime) ? a.mtime : 0) || a.path.localeCompare(b.path, "zh-CN");
  const groups = new Map<string, VaultFileDescriptor[]>();
  for (const folder of snapshot.rootFolders) if (visible(folder.path)) groups.set(folder.path, []);
  for (const file of files) {
    const key = file.path.includes("/") ? file.path.split("/")[0] : "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(file);
  }
  const categories = Array.from(groups, ([path, entries]) => ({ path, name: path || "根目录", count: entries.length,
    added: entries.filter(file => inPeriod(file.ctime)).length, recent: [...entries].sort(recentFirst).slice(0, 3) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
  const additions = new Map<string, number>();
  let total = 0;
  for (const file of files) {
    if (!validDate(file.ctime)) continue;
    if (file.ctime < start.getTime()) total++;
    else {
      const date = dayLabel(new Date(file.ctime));
      additions.set(date, (additions.get(date) ?? 0) + 1);
    }
  }
  const trend = Array.from({ length: days }, (_, index) => {
    const date = dayLabel(new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
    const added = additions.get(date) ?? 0; total += added;
    return { date, added, total };
  });
  return { total: files.length, added: files.filter(file => inPeriod(file.ctime)).length,
    updated: files.filter(file => inPeriod(file.mtime)).length,
    unknownCreated: files.filter(file => !validDate(file.ctime)).length,
    trend, categories, recent: [...files].sort(recentFirst).slice(0, 5) };
}
