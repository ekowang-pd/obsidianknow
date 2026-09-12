/** Pick a raster image embed, never an external URL or executable resource. */
export function noteCover(markdown: string): { path: string; alt: string } | undefined {
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "")
    .replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, "")
    .replace(/`[^`\n]*`/g, "");
  const embeds = /!\[\[([^\]\n]+)\]\]|!\[([^\]\n]*)\]\(\s*(?:<([^>\n]+)>|([^\s)]+))(?:\s+["'][^\n]*?["'])?\s*\)/g;
  for (const match of body.matchAll(embeds)) {
    let path = (match[1]?.split("|")[0] ?? match[3] ?? match[4]).trim();
    try { path = decodeURIComponent(path); } catch { continue; }
    if (/^(?:[a-z][a-z\d+.-]*:|[\\/]{2})/i.test(path) || !/\.(?:png|jpe?g|gif|webp|avif)$/i.test(path)) continue;
    return { path, alt: match[2] || "" };
  }
  return undefined;
}
