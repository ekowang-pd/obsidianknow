// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { selectionFromRange } from "../src/views/selection-model";

function fixture(text = "  first\r\n\r\nsecond  ") {
  const container = document.createElement("article");
  const node = document.createTextNode(text);
  container.append(node);
  document.body.replaceChildren(container);
  const range = document.createRange();
  range.selectNodeContents(node);
  range.getBoundingClientRect = () => ({ left: 24, bottom: 60 } as DOMRect);
  return { container, node, range };
}

describe("selectionFromRange", () => {
  it("captures contained text and coordinates, normalizing CRLF and edges but retaining paragraphs", () => {
    const { range, container } = fixture();
    expect(selectionFromRange(range, container)).toEqual({ excerpt: "first\n\nsecond", rect: { left: 24, bottom: 60 } });
  });
  it("rejects collapsed ranges", () => {
    const { range, container } = fixture();
    range.collapse(true);
    expect(selectionFromRange(range, container)).toBeNull();
  });
  it("rejects whitespace-only ranges", () => {
    const { range, container } = fixture(" \r\n \t ");
    expect(selectionFromRange(range, container)).toBeNull();
  });
  it.each(["start", "end"])("rejects selections with their %s outside the reader", edge => {
    const { range, container } = fixture();
    const outside = document.createTextNode("outside");
    if (edge === "start") { container.before(outside); range.setStart(outside, 0); }
    else { container.after(outside); range.setEnd(outside, 7); }
    expect(selectionFromRange(range, container)).toBeNull();
  });
  it("rejects ranges around the reader even when they contain its whole text", () => {
    const { range, container } = fixture();
    range.selectNode(container);
    expect(selectionFromRange(range, container)).toBeNull();
  });
  it("preserves paragraph boundaries between sibling paragraphs with inline formatting and partial endpoints", () => {
    const { container, range } = fixture("");
    const first = document.createElement("p"); first.textContent = "skip first";
    const second = document.createElement("p");
    const emphasis = document.createElement("em"); emphasis.textContent = "second";
    second.append(emphasis, " tail"); container.replaceChildren(first, second);
    range.setStart(first.firstChild!, 5); range.setEnd(second.lastChild!, 0);
    expect(selectionFromRange(range, container)?.excerpt).toBe("first\n\nsecond");
  });
  it("preserves single and repeated BR boundaries without inserting breaks around inline elements", () => {
    const { container, range } = fixture("");
    const paragraph = document.createElement("p");
    const strong = document.createElement("strong"); strong.textContent = "bold";
    paragraph.append("first ", strong, document.createElement("br"), "second", document.createElement("br"), document.createElement("br"), "third");
    container.replaceChildren(paragraph); range.selectNodeContents(paragraph);
    expect(selectionFromRange(range, container)?.excerpt).toBe("first bold\nsecond\n\nthird");
  });
});
