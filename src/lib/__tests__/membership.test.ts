/**
 * 会员等级默认权益文案测试
 * 等级体系（2026-09 简化）：普通会员(注册) / 高级会员(消费满 ¥1,000)
 * 权益聚焦测肤平台：
 * - 普通会员：12 次测肤体验机会、数据留存 365 天
 * - 高级会员：无限总次数（每日上限 3 次）、肌肤档案永久保留、专属 AI 护肤顾问
 */
import { describe, it, expect } from "vitest";
import { LEVEL_DEFAULT_BENEFITS } from "@/lib/membership";

describe("LEVEL_DEFAULT_BENEFITS 等级权益", () => {
  it("仅包含普通会员与高级会员两档", () => {
    expect(Object.keys(LEVEL_DEFAULT_BENEFITS).sort()).toEqual(["ADVANCED", "REGULAR"]);
  });

  it("高级会员门槛为消费满 ¥1,000（无上限）", () => {
    expect(LEVEL_DEFAULT_BENEFITS.ADVANCED.minSpent).toBe(1000);
    expect(LEVEL_DEFAULT_BENEFITS.ADVANCED.maxSpent).toBeNull();
  });

  it("普通会员包含 12 次测肤体验机会权益", () => {
    const texts = LEVEL_DEFAULT_BENEFITS.REGULAR.benefits.map(
      (b) => `${b.title}${b.desc}`
    );
    expect(texts.join()).toContain("12");
    expect(texts.join()).toContain("测肤");
  });

  it("普通会员包含数据留存 365 天权益", () => {
    const texts = LEVEL_DEFAULT_BENEFITS.REGULAR.benefits.map(
      (b) => `${b.title}${b.desc}`
    );
    expect(texts.join()).toContain("365");
  });

  it("高级会员包含无限测肤（每日上限 3 次）权益", () => {
    const texts = LEVEL_DEFAULT_BENEFITS.ADVANCED.benefits.map(
      (b) => `${b.title}${b.desc}`
    );
    expect(texts.join()).toContain("3 次");
  });

  it("高级会员包含肌肤档案永久保留权益", () => {
    const titles = LEVEL_DEFAULT_BENEFITS.ADVANCED.benefits.map((b) => b.title);
    expect(titles).toContain("档案永久保留");
  });

  it("高级会员包含专属 AI 护肤顾问权益", () => {
    const titles = LEVEL_DEFAULT_BENEFITS.ADVANCED.benefits.map((b) => b.title);
    expect(titles).toContain("专属 AI 护肤顾问");
  });

  it("所有等级权益均无积分/生日礼/倍率类文案（积分与生日礼已移除）", () => {
    for (const level of Object.values(LEVEL_DEFAULT_BENEFITS)) {
      for (const benefit of level.benefits) {
        const text = `${benefit.title}${benefit.desc}`;
        expect(text).not.toMatch(/积分/);
        expect(text).not.toMatch(/生日/);
        expect(text).not.toMatch(/\d+\s*倍/);
      }
    }
  });
});
