/**
 * 会员等级默认权益文案测试
 * 等级体系（2026-09 四档）：普通(注册) / 银卡(¥1,000) / 金卡(¥5,000) / 钻石(¥10,000)
 * 权益聚焦测肤平台 + 积分（银卡及以上参与）：
 * - 普通会员：10 次测肤体验机会、无档案/顾问/积分
 * - 银卡：每满 ¥1,000 加 20 次、档案终身保留、AI 顾问、兑礼 1:1、生日 50 积分
 * - 金卡：不限次测肤、兑礼 1:1.3、生日 100 积分
 * - 钻石卡：不限次测肤、兑礼 1:1.5、生日 200 积分
 */
import { describe, it, expect } from "vitest";
import {
  LEVEL_DEFAULT_BENEFITS,
  POINT_REDEEM_RATES,
  BIRTHDAY_POINTS,
} from "@/lib/membership";

describe("LEVEL_DEFAULT_BENEFITS 等级权益", () => {
  it("包含普通/银卡/金卡/钻石四档", () => {
    expect(Object.keys(LEVEL_DEFAULT_BENEFITS).sort()).toEqual([
      "DIAMOND",
      "GOLD",
      "REGULAR",
      "SILVER",
    ]);
  });

  it("各档消费门槛：0 / 1000 / 5000 / 10000，钻石无上限", () => {
    expect(LEVEL_DEFAULT_BENEFITS.REGULAR.minSpent).toBe(0);
    expect(LEVEL_DEFAULT_BENEFITS.REGULAR.maxSpent).toBe(999);
    expect(LEVEL_DEFAULT_BENEFITS.SILVER.minSpent).toBe(1000);
    expect(LEVEL_DEFAULT_BENEFITS.SILVER.maxSpent).toBe(4999);
    expect(LEVEL_DEFAULT_BENEFITS.GOLD.minSpent).toBe(5000);
    expect(LEVEL_DEFAULT_BENEFITS.GOLD.maxSpent).toBe(9999);
    expect(LEVEL_DEFAULT_BENEFITS.DIAMOND.minSpent).toBe(10000);
    expect(LEVEL_DEFAULT_BENEFITS.DIAMOND.maxSpent).toBeNull();
  });

  it("普通会员：10 次测肤体验，无档案/顾问/积分权益", () => {
    const texts = LEVEL_DEFAULT_BENEFITS.REGULAR.benefits.map(
      (b) => `${b.title}${b.desc}`
    );
    expect(texts.join()).toContain("10 次");
    const titles = LEVEL_DEFAULT_BENEFITS.REGULAR.benefits.map((b) => b.title);
    expect(titles).not.toContain("档案永久保留");
    expect(titles).not.toContain("专属 AI 护肤顾问");
    expect(titles).not.toContain("积分兑礼");
  });

  it("银卡：每满 ¥1,000 加 20 次测肤权益", () => {
    const texts = LEVEL_DEFAULT_BENEFITS.SILVER.benefits.map(
      (b) => `${b.title}${b.desc}`
    );
    expect(texts.join()).toContain("20 次");
  });

  it("银卡及以上包含档案永久保留与 AI 顾问权益", () => {
    for (const level of ["SILVER", "GOLD", "DIAMOND"] as const) {
      const titles = LEVEL_DEFAULT_BENEFITS[level].benefits.map((b) => b.title);
      expect(titles).toContain("档案永久保留");
      expect(titles).toContain("专属 AI 护肤顾问");
    }
  });

  it("金卡/钻石卡包含不限次测肤权益", () => {
    for (const level of ["GOLD", "DIAMOND"] as const) {
      const titles = LEVEL_DEFAULT_BENEFITS[level].benefits.map((b) => b.title);
      expect(titles).toContain("不限次测肤");
    }
  });

  it("普通会员不参与积分，银/金/钻均含积分兑礼权益", () => {
    const regularTitles = LEVEL_DEFAULT_BENEFITS.REGULAR.benefits.map((b) => b.title);
    expect(regularTitles).not.toContain("积分兑礼");
    for (const level of ["SILVER", "GOLD", "DIAMOND"] as const) {
      const titles = LEVEL_DEFAULT_BENEFITS[level].benefits.map((b) => b.title);
      expect(titles).toContain("积分兑礼");
      expect(titles).toContain("生日礼遇");
    }
  });
});

describe("POINT_REDEEM_RATES 积分兑礼率", () => {
  it("普通档不参与（null），银 1 / 金 1.3 / 钻 1.5", () => {
    expect(POINT_REDEEM_RATES.REGULAR).toBeNull();
    expect(POINT_REDEEM_RATES.SILVER).toBe(1);
    expect(POINT_REDEEM_RATES.GOLD).toBe(1.3);
    expect(POINT_REDEEM_RATES.DIAMOND).toBe(1.5);
  });
});

describe("BIRTHDAY_POINTS 生日积分", () => {
  it("普通 0 / 银 50 / 金 100 / 钻 200", () => {
    expect(BIRTHDAY_POINTS.REGULAR).toBe(0);
    expect(BIRTHDAY_POINTS.SILVER).toBe(50);
    expect(BIRTHDAY_POINTS.GOLD).toBe(100);
    expect(BIRTHDAY_POINTS.DIAMOND).toBe(200);
  });
});
