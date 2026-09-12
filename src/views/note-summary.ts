/** Plain-text list excerpt. Source Markdown is never changed or executed. */
export function noteSummary(markdown: string, title: string, tags: readonly string[] = []): string {
  let text = markdown
    .replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "")
    .replace(/^## \d{2}:\d{2}:\d{2}\s*$/gm, "")
    .replace(/^来源：\[\[.*?\]\]\s*$/gm, "")
    .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1")
    .replace(/!\[\[[^\]\n]+\]\]/g, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_all: string, path: string, label: string | undefined) => label ?? path)
    .replace(/^[ \t]{0,3}(?:#{1,6}[ \t]+|>[ \t]?)/gm, "")
    .replace(/[*`~]/g, "")
    .replace(/<[^>]*>/g, "");
  for (const tag of tags) {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`(^|\\s)#${escaped}(?=\\s|$)`, "g"), "$1");
  }
  const paragraphs = text.split(/\n\s*\n/).map(part => part.trim()).filter(part => part && part !== title.trim());
  return paragraphs.join("\n\n").slice(0, 480);
}
