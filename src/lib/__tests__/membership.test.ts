/**
 * 会员等级默认权益文案测试
 * 与后端 grantBirthdayGiftIfDue（src/lib/points.ts）对齐：
 * - 生日礼仅 VIP/SVIP 生日当天定额赠分（500/1000）
 * - ADVANCED 无生日礼
 * - 无积分倍率功能
 */
import { describe, it, expect } from "vitest";
import { LEVEL_DEFAULT_BENEFITS } from "@/lib/membership";

describe("LEVEL_DEFAULT_BENEFITS 生日权益文案", () => {
  it("ADVANCED 不包含生日礼遇（后端无此权益）", () => {
    const titles = LEVEL_DEFAULT_BENEFITS.ADVANCED.benefits.map((b) => b.title);
    expect(titles).not.toContain("生日礼遇");
  });

  it("VIP 生日礼遇描述为生日当天赠送 500 积分", () => {
    const benefit = LEVEL_DEFAULT_BENEFITS.VIP.benefits.find((b) => b.title === "生日礼遇");
    expect(benefit?.desc).toContain("生日当天");
    expect(benefit?.desc).toContain("500");
  });

  it("SVIP 生日礼遇描述为生日当天赠送 1000 积分", () => {
    const benefit = LEVEL_DEFAULT_BENEFITS.SVIP.benefits.find((b) => b.title === "生日礼遇");
    expect(benefit?.desc).toContain("生日当天");
    expect(benefit?.desc).toContain("1000");
  });

  it("所有等级权益均无积分倍率类文案（后端无倍率功能）", () => {
    for (const level of Object.values(LEVEL_DEFAULT_BENEFITS)) {
      for (const benefit of level.benefits) {
        expect(`${benefit.title}${benefit.desc}`).not.toMatch(/\d+\s*倍/);
      }
    }
  });
});
