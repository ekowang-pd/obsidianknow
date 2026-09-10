import { describe, expect, it } from "vitest";

import { buildContributions } from "../src/domain/contributions";

describe("contribution summary", () => {
  it("creates 91 local-calendar day cells for empty activity", () => {
    const result = buildContributions([], new Date("2026-09-10T12:00:00+08:00"));

    expect(result.days).toHaveLength(91);
    expect(result.total).toBe(0);
    expect(result.activeDays).toBe(0);
    expect(result.streak).toBe(0);
    expect(result.days[90]).toEqual({ date: "2026-09-10", count: 0 });
  });

  it("aggregates multiple timestamps on the same local day and counts a streak ending today", () => {
    const result = buildContributions([
      new Date("2026-09-09T23:59:59+08:00"),
      new Date("2026-09-10T00:30:00+08:00"),
      new Date("2026-09-10T23:00:00+08:00")
    ], new Date("2026-09-10T12:00:00+08:00"));

    expect(result.days[89]).toEqual({ date: "2026-09-09", count: 1 });
    expect(result.days[90]).toEqual({ date: "2026-09-10", count: 2 });
    expect(result.total).toBe(3);
    expect(result.activeDays).toBe(2);
    expect(result.streak).toBe(2);
  });

  it("keeps dates and a continuous streak correct across a month boundary", () => {
    const result = buildContributions([
      new Date("2026-09-30T09:00:00+08:00"),
      new Date("2026-10-01T09:00:00+08:00"),
      new Date("2026-10-02T09:00:00+08:00")
    ], new Date("2026-10-02T12:00:00+08:00"));

    expect(result.days.slice(-3)).toEqual([
      { date: "2026-09-30", count: 1 },
      { date: "2026-10-01", count: 1 },
      { date: "2026-10-02", count: 1 }
    ]);
    expect(result.streak).toBe(3);
  });
});
