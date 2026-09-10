export interface SelectionAnchor {
  excerpt: string;
  rect: { left: number; bottom: number };
}

export function selectionFromRange(range: Range, container: HTMLElement): SelectionAnchor | null {
  if (range.collapsed || !container.contains(range.startContainer) ||
      !container.contains(range.endContainer) || !container.contains(range.commonAncestorContainer)) return null;
  const excerpt = range.toString().replace(/\r\n?/g, "\n").trim();
  if (!excerpt) return null;
  const { left, bottom } = range.getBoundingClientRect();
  return { excerpt, rect: { left, bottom } };
}
