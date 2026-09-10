export interface DeerNoteMeta {
  title: string;
  created: string;
  updated: string;
  source: string;
  tags: string[];
}

export interface CreateNoteInput {
  title: string;
  body: string;
  source?: string;
  excerpt?: string;
  date: Date;
}

export interface AppendNoteInput {
  body: string;
  excerpt: string;
  date: Date;
}

export interface FrontmatterCodec {
  parse(this: void, yaml: string): unknown;
  stringify(properties: Record<string, unknown>): string;
}

const FALLBACK_TITLE = "未命名笔记";
const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n(?:\r?\n)?/;
const TAG_PATTERN = /#([\p{L}\p{N}_/-]+)/gu;

export function noteTitle(body: string): string {
  const paragraph = body
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .find(Boolean);

  if (!paragraph) {
    return FALLBACK_TITLE;
  }

  const cleaned = paragraph
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/[`*_~]/g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  const title = [...cleaned].slice(0, 60).join("").trim();

  if (!title) {
    return FALLBACK_TITLE;
  }

  return RESERVED_WINDOWS_NAMES.test(title) ? `笔记-${title}` : title;
}

export function uniqueNotePath(
  folder: string,
  title: string,
  existingPaths: Iterable<string>
): string {
  const normalizedFolder = folder.replace(/\\/g, "/").trim().replace(/^\/+|\/+$/g, "");
  const normalizedTitle = noteTitle(title);
  const prefix = normalizedFolder ? `${normalizedFolder}/` : "";
  const used = new Set(
    Array.from(existingPaths, (path) => path.replace(/\\/g, "/").toLowerCase())
  );

  for (let number = 1; ; number += 1) {
    const suffix = number === 1 ? "" : ` (${number})`;
    const candidate = `${prefix}${normalizedTitle}${suffix}.md`;
    if (!used.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
}

export function createNoteMarkdown(input: CreateNoteInput): string {
  const date = localDate(input.date);
  const source = input.source ?? "";
  const tags = extractTags(input.body);
  const frontmatter = [
    "---",
    "type: deer-note",
    `created: ${JSON.stringify(date)}`,
    `updated: ${JSON.stringify(date)}`,
    ...(source ? [`source: ${JSON.stringify(source)}`] : []),
    `tags: ${JSON.stringify(tags)}`,
    "---"
  ].join("\n");

  return `${frontmatter}\n\n# ${input.title}\n\n${noteSection(input.body, input.excerpt, input.date, source)}`;
}

export function appendNoteMarkdown(existing: string, entry: AppendNoteInput, yaml: FrontmatterCodec): string {
  const meta = parseDeerNote(existing, yaml.parse);
  const match = existing.match(FRONTMATTER);
  if (!meta || !match) {
    throw new Error("Cannot append to content that is not a deer-note");
  }

  const updated = localDate(entry.date);
  const tags = distinctTags([...meta.tags, ...extractTags(existing.slice(match[0].length)), ...extractTags(entry.body)]);
  const properties = parseProperties(match[1], yaml.parse)!;
  const newline = existing.startsWith("---\r\n") ? "\r\n" : "\n";
  const frontmatter = yaml.stringify({ ...properties, updated, tags })
    .replace(/\r?\n$/, "").replace(/\r?\n/g, newline);
  const headerStart = existing.indexOf("\n") + 1;
  const updatedExisting = existing.slice(0, headerStart) + frontmatter + existing.slice(headerStart + match[1].length);
  const separator = existing.endsWith("\n") ? "\n" : "\n\n";

  return `${updatedExisting}${separator}${timestampSection(entry.body, entry.excerpt, entry.date)}`;
}

export function parseDeerNote(content: string, parseYaml: FrontmatterCodec["parse"]): DeerNoteMeta | null {
  const match = content.match(FRONTMATTER);
  if (!match) {
    return null;
  }

  const fields = parseProperties(match[1], parseYaml);
  if (fields?.type !== "deer-note") {
    return null;
  }

  const created = parsedDate(fields.created);
  const updated = parsedDate(fields.updated);
  const source = fields.source == null ? "" : typeof fields.source === "string" ? fields.source : null;
  const tags = parsedTags(fields.tags);
  const title = content.slice(match[0].length).match(/^# (.+?)(?:\r?\n|$)/)?.[1];

  if (!created || !updated || source === null || !tags || !title) {
    return null;
  }

  return { title, created, updated, source, tags };
}

function noteSection(body: string, excerpt: string | undefined, date: Date, source: string): string {
  const sourceLine = source ? `来源：[[${source.replace(/\.md$/i, "")}]]\n\n` : "";
  return `${sourceLine}${timestampSection(body, excerpt, date)}`;
}

function timestampSection(body: string, excerpt: string | undefined, date: Date): string {
  const excerptBlock = excerpt === undefined ? "" : `${blockquote(excerpt)}\n\n`;
  return `## ${localTime(date)}\n\n${excerptBlock}${body}\n`;
}

function blockquote(value: string): string {
  return value.replace(/\r\n?/g, "\n").split("\n").map((line) => `> ${line}`).join("\n");
}

function extractTags(content: string): string[] {
  const withoutCode = content.replace(/```[\s\S]*?```|`[^`\n]*`/g, "");
  const tags: string[] = [];

  for (const match of withoutCode.matchAll(TAG_PATTERN)) {
    const tag = normalizedTag(match[1]);
    if (tag) {
      tags.push(tag);
    }
  }

  return distinctTags(tags);
}

function distinctTags(tags: string[]): string[] {
  const seen = new Set<string>();
  return tags.flatMap((tag) => {
    const normalized = normalizedTag(tag);
    if (!normalized) {
      return [];
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      return [];
    }
    seen.add(key);
    return [normalized];
  });
}

function normalizedTag(tag: string): string | null {
  const normalized = tag.replace(/[/-]+$/, "");
  return normalized && /\p{L}/u.test(normalized) ? normalized : null;
}

function parseProperties(yaml: string, parse: FrontmatterCodec["parse"]): Record<string, unknown> | null {
  try {
    const parsed = parse(yaml);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function parsedDate(value: unknown): string | null {
  // YAML timestamp scalars describe calendar dates, independently of the local timezone.
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function parsedTags(value: unknown): string[] | null {
  if (value == null || value === "") return [];
  if (typeof value === "string") return [value];
  return Array.isArray(value) && value.every(tag => typeof tag === "string") ? value : null;
}

function localDate(date: Date): string {
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
}

function localTime(date: Date): string {
  return `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}:${twoDigits(date.getSeconds())}`;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}
