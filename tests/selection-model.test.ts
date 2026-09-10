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
});
