import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
  Plugin: class {}
}));

import { VIEW_TYPE_DEER_NOTES } from "../src/main";

describe("Deer Notes plugin", () => {
  it("exports the dashboard view type", () => {
    expect(VIEW_TYPE_DEER_NOTES).toBe("deer-notes-dashboard");
  });
});
