import { describe, it, expect } from "vitest";
import {
  yuanToFen,
  fenToYuan,
  moneyStrictEqual,
  formatMoney,
  ensureMoneyPrecision,
} from "@/lib/money";

describe("money", () => {
  describe("yuanToFen", () => {
    it("应正确转换元为分", () => {
      expect(yuanToFen(1)).toBe(100);
      expect(yuanToFen(0.01)).toBe(1);
      expect(yuanToFen(99.99)).toBe(9999);
    });

    it("应处理浮点精度误差", () => {
      // 0.1 + 0.2 在 JS 中不等于 0.3，但乘以 100 后应正确四舍五入
      expect(yuanToFen(0.29)).toBe(29);
      expect(yuanToFen(1.999)).toBe(200);
    });

    it("应支持字符串和 Decimal-like 对象", () => {
      expect(yuanToFen("12.34")).toBe(1234);
      expect(yuanToFen({ toString: () => "56.78" })).toBe(5678);
    });
  });

  describe("fenToYuan", () => {
    it("应正确转换分为元", () => {
      expect(fenToYuan(100)).toBe(1);
      expect(fenToYuan(1)).toBe(0.01);
      expect(fenToYuan(9999)).toBe(99.99);
    });
  });

  describe("moneyStrictEqual", () => {
    it("应严格比较两个金额是否相等", () => {
      expect(moneyStrictEqual(1.0, 1.0)).toBe(true);
      expect(moneyStrictEqual("1.00", 1)).toBe(true);
      expect(moneyStrictEqual(1.006, 1.0)).toBe(false);
      expect(moneyStrictEqual(0.1 + 0.2, 0.3)).toBe(true);
    });
  });

  describe("formatMoney", () => {
    it("应格式化为保留2位小数的字符串", () => {
      expect(formatMoney(1)).toBe("1.00");
      expect(formatMoney(1.5)).toBe("1.50");
      expect(formatMoney("12.345")).toBe("12.35");
    });
  });

  describe("ensureMoneyPrecision", () => {
    it("应确保金额精确到分", () => {
      expect(ensureMoneyPrecision(1.999)).toBe(2);
      expect(ensureMoneyPrecision(1.001)).toBe(1);
      expect(ensureMoneyPrecision(0.125)).toBe(0.13);
    });
  });
});
