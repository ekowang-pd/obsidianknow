export interface SelectionAnchor {
  excerpt: string;
  rect: { left: number; bottom: number };
}

export function selectionFromRange(range: Range, container: HTMLElement): SelectionAnchor | null {
  if (range.collapsed || !container.contains(range.startContainer) ||
      !container.contains(range.endContainer) || !container.contains(range.commonAncestorContainer)) return null;
  const excerpt = selectedText(range.cloneContents()).trim();
  if (!excerpt) return null;
  const { left, bottom } = range.getBoundingClientRect();
  return { excerpt, rect: { left, bottom } };
}

function selectedText(fragment: DocumentFragment): string {
  let text = "";
  let pendingBreaks = 0;
  const paragraphs = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "PRE", "BLOCKQUOTE"]);
  const blocks = new Set(["DIV", "SECTION", "ARTICLE", "UL", "OL", "LI", "TABLE", "TR", "HR"]);
  const visit = (node: Node): void => {
    if (node.nodeType === 3) {
      const value = (node.nodeValue ?? "").replace(/\r\n?/g, "\n");
      // Whitespace between blocks is HTML formatting, not another paragraph.
      if (pendingBreaks && !value.trim()) return;
      if (text && pendingBreaks) {
        const existing = (text.match(/\n*$/)?.[0].length ?? 0) + (value.match(/^\n*/)?.[0].length ?? 0);
        text += "\n".repeat(Math.max(0, pendingBreaks - existing));
      }
      pendingBreaks = 0; text += value;
      return;
    }
    if (node.nodeType !== 1 && node.nodeType !== 11) return;
    const tag = node.nodeType === 1 ? (node as Element).tagName : "";
    if (tag === "BR") { text += "\n"; return; }
    const breaks = paragraphs.has(tag) ? 2 : blocks.has(tag) ? 1 : 0;
    pendingBreaks = Math.max(pendingBreaks, breaks);
    node.childNodes.forEach(visit);
    pendingBreaks = Math.max(pendingBreaks, breaks);
  };
  visit(fragment);
  return text;
}
