import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock prisma
vi.mock("@/lib/prisma", () => {
  const prisma = {
    setting: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  };
  return { prisma };
});

// Mock logger
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import {
  getShippingConfig,
  calculateShippingFee,
  updateShippingConfig,
  invalidateShippingConfigCache,
  type ShippingConfig,
} from "@/lib/shipping-config";

const mockSetting = prisma.setting as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
};

describe("运费配置服务", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 每个测试前清除缓存
    invalidateShippingConfigCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getShippingConfig", () => {
    it("Setting 表无记录时应返回默认免运费配置", async () => {
      mockSetting.findUnique.mockResolvedValue(null);

      const config = await getShippingConfig();

      expect(config).toEqual({ mode: "free", freeThreshold: 0, baseFee: 0 });
    });

    it("应正确解析 threshold 模式配置", async () => {
      mockSetting.findUnique.mockResolvedValue({
        key: "shipping_config",
        value: { mode: "threshold", freeThreshold: 299, baseFee: 15 },
      });

      const config = await getShippingConfig();

      expect(config).toEqual({ mode: "threshold", freeThreshold: 299, baseFee: 15 });
    });

    it("应正确解析 fixed 模式配置", async () => {
      mockSetting.findUnique.mockResolvedValue({
        key: "shipping_config",
        value: { mode: "fixed", freeThreshold: 0, baseFee: 12 },
      });

      const config = await getShippingConfig();

      expect(config).toEqual({ mode: "fixed", freeThreshold: 0, baseFee: 12 });
    });

    it("无效 mode 值应降级为 free", async () => {
      mockSetting.findUnique.mockResolvedValue({
        key: "shipping_config",
        value: { mode: "invalid_mode", freeThreshold: 100, baseFee: 10 },
      });

      const config = await getShippingConfig();

      expect(config.mode).toBe("free");
    });

    it("缺失字段应使用默认值", async () => {
      mockSetting.findUnique.mockResolvedValue({
        key: "shipping_config",
        value: { mode: "threshold" }, // 缺少 freeThreshold 和 baseFee
      });

      const config = await getShippingConfig();

      expect(config).toEqual({ mode: "threshold", freeThreshold: 0, baseFee: 0 });
    });

    it("DB 异常时应降级为默认免运费", async () => {
      mockSetting.findUnique.mockRejectedValue(new Error("DB connection lost"));

      const config = await getShippingConfig();

      expect(config).toEqual({ mode: "free", freeThreshold: 0, baseFee: 0 });
    });
  });

  describe("缓存 TTL", () => {
    it("60秒内重复调用应使用缓存，不查库", async () => {
      mockSetting.findUnique.mockResolvedValue({
        key: "shipping_config",
        value: { mode: "fixed", freeThreshold: 0, baseFee: 8 },
      });

      const config1 = await getShippingConfig();
      const config2 = await getShippingConfig();

      expect(config1).toEqual(config2);
      expect(mockSetting.findUnique).toHaveBeenCalledTimes(1); // 只查了一次库
    });

    it("缓存过期后应重新查库", async () => {
      vi.useFakeTimers();
      mockSetting.findUnique.mockResolvedValue({
        key: "shipping_config",
        value: { mode: "fixed", freeThreshold: 0, baseFee: 8 },
      });

      await getShippingConfig();
      expect(mockSetting.findUnique).toHaveBeenCalledTimes(1);

      // 推进 61 秒，缓存过期
      vi.advanceTimersByTime(61 * 1000);

      mockSetting.findUnique.mockResolvedValue({
        key: "shipping_config",
        value: { mode: "free", freeThreshold: 0, baseFee: 0 },
      });

      const config = await getShippingConfig();
      expect(mockSetting.findUnique).toHaveBeenCalledTimes(2);
      expect(config.mode).toBe("free");
    });

    it("invalidateShippingConfigCache 应立即清除缓存", async () => {
      mockSetting.findUnique.mockResolvedValue({
        key: "shipping_config",
        value: { mode: "fixed", freeThreshold: 0, baseFee: 8 },
      });

      await getShippingConfig();
      expect(mockSetting.findUnique).toHaveBeenCalledTimes(1);

      invalidateShippingConfigCache();

      mockSetting.findUnique.mockResolvedValue({
        key: "shipping_config",
        value: { mode: "free", freeThreshold: 0, baseFee: 0 },
      });

      const config = await getShippingConfig();
      expect(mockSetting.findUnique).toHaveBeenCalledTimes(2);
      expect(config.mode).toBe("free");
    });
  });

  describe("calculateShippingFee", () => {
    it("free 模式：任何金额都免运费", async () => {
      mockSetting.findUnique.mockResolvedValue(null); // 默认 free

      expect(await calculateShippingFee(0)).toBe(0);
      expect(await calculateShippingFee(100)).toBe(0);
      expect(await calculateShippingFee(9999)).toBe(0);
    });

    it("threshold 模式：未达门槛收取运费", async () => {
      mockSetting.findUnique.mockResolvedValue({
        key: "shipping_config",
        value: { mode: "threshold", freeThreshold: 299, baseFee: 15 },
      });

      expect(await calculateShippingFee(100)).toBe(15);
      expect(await calculateShippingFee(298)).toBe(15);
    });

    it("threshold 模式：达到门槛免运费", async () => {
      mockSetting.findUnique.mockResolvedValue({
        key: "shipping_config",
        value: { mode: "threshold", freeThreshold: 299, baseFee: 15 },
      });
      invalidateShippingConfigCache();

      expect(await calculateShippingFee(299)).toBe(0);
      expect(await calculateShippingFee(500)).toBe(0);
    });

    it("fixed 模式：固定运费不受金额影响", async () => {
      mockSetting.findUnique.mockResolvedValue({
        key: "shipping_config",
        value: { mode: "fixed", freeThreshold: 0, baseFee: 12 },
      });

      expect(await calculateShippingFee(0)).toBe(12);
      expect(await calculateShippingFee(100)).toBe(12);
      expect(await calculateShippingFee(10000)).toBe(12);
    });

    it("DB 异常时降级为免运费", async () => {
      mockSetting.findUnique.mockRejectedValue(new Error("timeout"));

      expect(await calculateShippingFee(50)).toBe(0);
    });
  });

  describe("updateShippingConfig", () => {
    it("应调用 upsert 并清除缓存", async () => {
      mockSetting.upsert.mockResolvedValue({});
      const newConfig: ShippingConfig = { mode: "threshold", freeThreshold: 199, baseFee: 10 };

      await updateShippingConfig(newConfig);

      expect(mockSetting.upsert).toHaveBeenCalledWith({
        where: { key: "shipping_config" },
        update: { value: newConfig },
        create: { key: "shipping_config", value: newConfig },
      });

      // 更新后缓存应被清除，下次 get 会重新查库
      mockSetting.findUnique.mockResolvedValue({
        key: "shipping_config",
        value: newConfig,
      });
      const config = await getShippingConfig();
      expect(mockSetting.findUnique).toHaveBeenCalledTimes(1);
      expect(config).toEqual(newConfig);
    });
  });
});
