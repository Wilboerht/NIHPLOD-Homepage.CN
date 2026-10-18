import { describe, expect, it } from "vitest";
import {
  getUtc8DateKey,
  getUtc8DayStart,
  getUtc8MonthStart,
  getUtc8WeekStartMonday,
  parseUtc8DateBoundary,
} from "@/lib/timezone";

const local = (date: Date) =>
  new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().replace("Z", "+08:00");

describe("timezone（UTC+8 业务日）", () => {
  it("当天 00:30 仍取当天零点", () => {
    const now = new Date("2026-10-18T00:30:00+08:00");
    expect(local(getUtc8DayStart(now))).toBe("2026-10-18T00:00:00.000+08:00");
    expect(getUtc8DateKey(now)).toBe("2026-10-18");
  });

  it("07:59 与 08:00 边界一致", () => {
    expect(local(getUtc8DayStart(new Date("2026-10-18T07:59:00+08:00")))).toBe(
      "2026-10-18T00:00:00.000+08:00"
    );
    expect(local(getUtc8DayStart(new Date("2026-10-18T08:00:00+08:00")))).toBe(
      "2026-10-18T00:00:00.000+08:00"
    );
  });

  it("周一取当天零点作为周首", () => {
    const monday = new Date("2026-10-19T00:30:00+08:00");
    expect(local(getUtc8WeekStartMonday(monday))).toBe("2026-10-19T00:00:00.000+08:00");
  });

  it("周日取本周一", () => {
    const sunday = new Date("2026-10-18T12:00:00+08:00");
    expect(local(getUtc8WeekStartMonday(sunday))).toBe("2026-10-12T00:00:00.000+08:00");
  });

  it("每月 1 日 00:30 取当月月初", () => {
    const first = new Date("2026-11-01T00:30:00+08:00");
    expect(local(getUtc8MonthStart(first))).toBe("2026-11-01T00:00:00.000+08:00");
  });

  it("日期边界按 UTC+8 解析", () => {
    expect(parseUtc8DateBoundary("2026-10-18", false)?.toISOString()).toBe(
      "2026-10-17T16:00:00.000Z"
    );
    expect(parseUtc8DateBoundary("2026-10-18", true)?.toISOString()).toBe(
      "2026-10-18T15:59:59.999Z"
    );
  });
});
