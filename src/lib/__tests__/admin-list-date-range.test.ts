import { describe, expect, it } from "vitest";
import { parseAdminDateRange } from "@/lib/admin-list-date-range";

describe("parseAdminDateRange", () => {
  it("按 UTC+8 解析日期边界", () => {
    const result = parseAdminDateRange("2026-11-01", "2026-11-02");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.from?.toISOString()).toBe("2026-10-31T16:00:00.000Z");
    expect(result.to?.toISOString()).toBe("2026-11-02T15:59:59.999Z");
  });

  it("拒绝倒置日期", () => {
    const result = parseAdminDateRange("2026-11-03", "2026-11-01");
    expect(result.ok).toBe(false);
  });

  it("拒绝超过 366 天", () => {
    const result = parseAdminDateRange("2024-01-01", "2026-01-02");
    expect(result.ok).toBe(false);
  });
});
