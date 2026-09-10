import { translate, type Language } from "../i18n";
import { buildKnowledgeOverview, dayLabel } from "../domain/overview";
import type { GrowthDay, OverviewDays } from "../domain/overview";
import type { DeerNotesSettings } from "../settings";
import type { VaultFileDescriptor, VaultSnapshot } from "../services/vault-index";

function el<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const element = parent.ownerDocument.createElement(tag); element.className = className;
  if (text !== undefined) element.textContent = text;
  parent.append(element); return element;
}

export function renderKnowledgeOverview(parent: HTMLElement, snapshot: VaultSnapshot, settings: DeerNotesSettings, days: OverviewDays): void {
  const t = (source: string, ...values: unknown[]) => translate(settings.language, source, ...values);
  const data = buildKnowledgeOverview(snapshot, settings, days);
  const titles = new Map(snapshot.deerNotes.map(note => [note.path, note.title]));
  const metric = el(parent, "dl", "deer-overview-metrics");
  for (const [label, count, hint] of [[t("文档总量"), data.total, t("可见 Markdown 文档")], [t("近期新增"), data.added, t("近 {0} 天创建", days)],
    [t("近期更新"), data.updated, t("近 {0} 天修改过的文档", days)], [t("知识类别"), data.categories.length, t("按一级目录分类")]] as const) {
    const card = el(metric, "div", "deer-metric-card");
    el(card, "dt", "", label); el(card, "dd", "", String(count)); el(card, "span", "deer-metric-hint", hint);
  }
  const growth = el(parent, "section", "deer-insight-card");
  const head = el(growth, "div", "deer-insight-heading");
  el(head, "h3", "", t("知识增长趋势"));
  const periods = el(head, "div", "deer-periods"); periods.setAttribute("role", "group"); periods.setAttribute("aria-label", t("统计周期"));
  for (const range of [7, 30, 90] as const) {
    const button = el(periods, "button", "", t("{0} 天", range)); button.type = "button";
    button.dataset.action = "overview-range"; button.dataset.days = String(range);
    button.setAttribute("aria-pressed", String(range === days));
  }
  el(growth, "p", "deer-insight-caption", t("近 {0} 天新增 {1} 篇 · 曲线表示累计文档数", days, data.added));
  drawGrowth(growth, data.trend, settings.language);
  el(growth, "p", "deer-chart-note", t("根据现存文档的创建时间估算，不含已删除文档；导入或复制文件可能影响时间。") +
    (data.unknownCreated ? t(" {0} 篇创建时间无效，未计入曲线。", data.unknownCreated) : ""));
  const details = el(growth, "details", "deer-chart-data");
  el(details, "summary", "", t("查看每日数据"));
  const table = el(details, "table", "");
  const tr = el(el(table, "thead", ""), "tr", "");
  for (const name of [t("日期"), t("新增"), t("累计")]) el(tr, "th", "", name).scope = "col";
  const tbody = el(table, "tbody", "");
  for (const day of data.trend) { const row = el(tbody, "tr", ""); for (const value of [day.date, day.added, day.total]) el(row, "td", "", String(value)); }

  const columns = el(parent, "div", "deer-overview-columns");
  const distribution = el(columns, "section", "deer-insight-card");
  el(distribution, "h3", "", t("知识分类")); el(distribution, "p", "deer-insight-caption", t("各一级目录的文档数量与占比"));
  const bars = el(distribution, "div", "deer-category-bars");
  for (const category of data.categories) {
    const row = el(bars, "div", "deer-category-bar");
    const label = el(row, "div", "deer-category-bar-label");
    el(label, "span", "", (category.path ? category.name : t("根目录")));
    el(label, "span", "", t("{0} 篇 · {1}%", category.count, data.total ? Math.round(category.count / data.total * 1000) / 10 : 0));
    const meter = el(row, "meter", ""); meter.min = 0; meter.max = Math.max(1, data.total); meter.value = category.count;
    meter.setAttribute("aria-label", t("{0}：{1} 篇", category.name, category.count));
  }
  if (!data.categories.length) el(distribution, "p", "deer-insight-empty", t("添加文档后，这里会显示分类分布。"));

  const recent = el(columns, "section", "deer-insight-card");
  el(recent, "h3", "", t("最近更新")); el(recent, "p", "deer-insight-caption", t("最近修改的 5 篇文档"));
  articleList(recent, data.recent, titles, settings.language);

  const categoryHead = el(parent, "div", "deer-category-section-heading");
  el(categoryHead, "h3", "", t("分类速览")); el(categoryHead, "span", "", t("每类最近 3 篇"));
  const categories = el(parent, "div", "deer-category-cards");
  for (const category of data.categories) {
    const card = el(categories, "section", "deer-insight-card");
    const heading = el(card, "div", "deer-insight-heading");
    el(heading, "h4", "", category.name); el(heading, "span", "deer-category-count", t("{0} 篇", category.count));
    el(card, "p", "deer-insight-caption", t("近 {0} 天新增 {1} 篇", days, category.added));
    articleList(card, category.recent, titles, settings.language);
  }
  if (!data.total) el(parent, "p", "deer-insight-empty", t("还没有可见文档。可以先在“全部笔记”记录一个想法。"));
}

function articleList(parent: HTMLElement, files: VaultFileDescriptor[], titles: Map<string, string>, language?: Language): void {
  const t = (source: string, ...values: unknown[]) => translate(language, source, ...values);
  if (!files.length) { el(parent, "p", "deer-insight-empty", t("这里还没有文档")); return; }
  const list = el(parent, "ul", "deer-recent-list");
  for (const file of files) {
    const button = el(el(list, "li", ""), "button", "deer-recent-link"); button.type = "button";
    button.dataset.action = "open-file"; button.dataset.path = file.path; button.title = file.path;
    el(button, "span", "deer-recent-title", titles.get(file.path) ?? file.basename);
    const valid = Number.isFinite(file.mtime) && file.mtime > 0 && file.mtime <= Date.now();
    el(button, "span", "deer-recent-date", valid ? dayLabel(new Date(file.mtime)) : t("日期不详"));
  }
}

function drawGrowth(parent: HTMLElement, trend: GrowthDay[], language?: Language): void {
  const t = (source: string, ...values: unknown[]) => translate(language, source, ...values);
  const ns = "http://www.w3.org/2000/svg";
  const svg = parent.ownerDocument.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 600 210"); svg.setAttribute("class", "deer-growth-chart");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", t("累计文档从 {0} 篇到 {1} 篇，每日明细可在下方展开", trend[0].total, trend.at(-1)!.total));
  const add = (name: string, attrs: Record<string, string>, text?: string) => {
    const node = parent.ownerDocument.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text; svg.append(node); return node;
  };
  const max = Math.max(2, ...trend.map(day => day.total));
  const scale = Math.ceil(max / 2) * 2;
  for (const value of [0, scale / 2, scale]) {
    const y = 174 - value / scale * 144;
    add("line", { x1: "36", x2: "584", y1: String(y), y2: String(y), class: "deer-chart-grid" });
    add("text", { x: "26", y: String(y + 4), "text-anchor": "end" }, String(value));
  }
  const points = trend.map((day, index) => ({ x: 36 + index / (trend.length - 1) * 548, y: 174 - day.total / scale * 144 }));
  const line = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  add("path", { d: `${line} L584,174 L36,174 Z`, class: "deer-chart-area" });
  add("path", { d: line, class: "deer-chart-line" });
  for (let index = 0; index < trend.length; index++) {
    const point = points[index];
    const dot = add("circle", { cx: String(point.x), cy: String(point.y), r: index === trend.length - 1 ? "4" : "3", class: "deer-chart-dot" });
    const title = parent.ownerDocument.createElementNS(ns, "title");
    title.textContent = t("{0} · 新增 {1} · 累计 {2}", trend[index].date, trend[index].added, trend[index].total); dot.append(title);
  }
  for (const index of [0, Math.floor((trend.length - 1) / 2), trend.length - 1]) {
    add("text", { x: String(points[index].x), y: "202", "text-anchor": index === 0 ? "start" : index === trend.length - 1 ? "end" : "middle" }, trend[index].date.slice(5).replace("-", "/"));
  }
  parent.append(svg);
}
