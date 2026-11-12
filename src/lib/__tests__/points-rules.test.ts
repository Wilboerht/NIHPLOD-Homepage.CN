import { describe, expect, it } from "vitest";
import { getPointsRulesView } from "@/lib/points-rules";

describe("getPointsRulesView", () => {
  it("returns the authoritative earn/expiry/level rules", () => {
    const rules = getPointsRulesView();
    expect(rules.earnYuanPerPoint).toBe(1);
    expect(rules.expiryMonths).toBe(6);
    expect(rules.levels.map((level) => level.level)).toEqual([
      "REGULAR",
      "SILVER",
      "GOLD",
      "DIAMOND",
    ]);
    expect(rules.levels.map((level) => level.minSpent)).toEqual([0, 1000, 5000, 10000]);
    expect(rules.levels.map((level) => level.redeemRate)).toEqual([null, 1, 1.3, 1.5]);
    expect(rules.levels.map((level) => level.birthdayPoints)).toEqual([0, 50, 100, 200]);
  });
});
