import { describe, expect, it } from "vitest";

import { buildContributions } from "../src/domain/contributions";

describe("contribution summary", () => {
  it("creates 91 local-calendar day cells for empty activity", () => {
    const result = buildContributions([], new Date(2026, 8, 10, 12));

    expect(result.days).toHaveLength(91);
    expect(result.total).toBe(0);
    expect(result.activeDays).toBe(0);
    expect(result.streak).toBe(0);
    expect(result.days[90]).toEqual({ date: "2026-09-10", count: 0 });
  });

  it("aggregates multiple timestamps on the same local day and counts a streak ending today", () => {
    const result = buildContributions([
      new Date(2026, 8, 9, 23, 59, 59),
      new Date(2026, 8, 10, 0, 30),
      new Date(2026, 8, 10, 23)
    ], new Date(2026, 8, 10, 12));

    expect(result.days[89]).toEqual({ date: "2026-09-09", count: 1 });
    expect(result.days[90]).toEqual({ date: "2026-09-10", count: 2 });
    expect(result.total).toBe(3);
    expect(result.activeDays).toBe(2);
    expect(result.streak).toBe(2);
  });

  it("keeps dates and a continuous streak correct across a month boundary", () => {
    const result = buildContributions([
      new Date(2026, 8, 30, 9),
      new Date(2026, 9, 1, 9),
      new Date(2026, 9, 2, 9)
    ], new Date(2026, 9, 2, 12));

    expect(result.days.slice(-3)).toEqual([
      { date: "2026-09-30", count: 1 },
      { date: "2026-10-01", count: 1 },
      { date: "2026-10-02", count: 1 }
    ]);
    expect(result.streak).toBe(3);
  });
});
