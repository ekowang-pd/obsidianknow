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
    Array.from(existingPaths, (path) => path.replace(/\\/g, "/").toLocaleLowerCase())
  );

  for (let number = 1; ; number += 1) {
    const suffix = number === 1 ? "" : ` (${number})`;
    const candidate = `${prefix}${normalizedTitle}${suffix}.md`;
    if (!used.has(candidate.toLocaleLowerCase())) {
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

export function appendNoteMarkdown(existing: string, entry: AppendNoteInput): string {
  const meta = parseDeerNote(existing);
  const match = existing.match(FRONTMATTER);
  if (!meta || !match) {
    throw new Error("Cannot append to content that is not a deer-note");
  }

  const updated = localDate(entry.date);
  const tags = distinctTags([...meta.tags, ...extractTags(existing), ...extractTags(entry.body)]);
  const updatedExisting = existing
    .replace(/^updated: [^\r\n]*(?=\r?$)/m, `updated: ${JSON.stringify(updated)}`)
    .replace(/^tags: [^\r\n]*(?=\r?$)/m, `tags: ${JSON.stringify(tags)}`);
  const separator = existing.endsWith("\n") ? "\n" : "\n\n";

  return `${updatedExisting}${separator}${timestampSection(entry.body, entry.excerpt, entry.date)}`;
}

export function parseDeerNote(content: string): DeerNoteMeta | null {
  const match = content.match(FRONTMATTER);
  if (!match) {
    return null;
  }

  const fields = new Map<string, string>();
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(": ");
    if (separator === -1) {
      return null;
    }

    const key = line.slice(0, separator);
    if (fields.has(key)) {
      return null;
    }
    fields.set(key, line.slice(separator + 2));
  }

  if (fields.get("type") !== "deer-note") {
    return null;
  }

  const created = parsedString(fields.get("created"));
  const updated = parsedString(fields.get("updated"));
  const source = fields.has("source") ? parsedString(fields.get("source")) : "";
  const tags = parsedTags(fields.get("tags"));
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
    const tag = match[1].replace(/[/-]+$/, "");
    if (tag && /\p{L}/u.test(tag)) {
      tags.push(tag);
    }
  }

  return distinctTags(tags);
}

function distinctTags(tags: string[]): string[] {
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function parsedString(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function parsedTags(value: string | undefined): string[] | null {
  if (value === undefined) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((tag) => typeof tag === "string")
      ? parsed
      : null;
  } catch {
    return null;
  }
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
