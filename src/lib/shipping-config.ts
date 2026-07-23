/**
 * 运费配置服务
 * 从 Setting 表读取运费策略，支持后台动态配置
 *
 * Setting key: "shipping_config"
 * Setting value (JSON):
 * {
 *   "mode": "free" | "threshold" | "fixed",
 *   "freeThreshold": number,   // threshold 模式：满此金额免运费
 *   "baseFee": number          // threshold/fixed 模式：基础运费
 * }
 *
 * 默认策略：免运费（mode = "free"）
 */
import { prisma } from "./prisma";
import { apiConsole } from "@/lib/logger";
import type { Prisma } from "@/generated/prisma/client";

export type ShippingMode = "free" | "threshold" | "fixed";

export interface ShippingConfig {
  /** 运费模式：free=全场免运费, threshold=满额免运费, fixed=固定运费 */
  mode: ShippingMode;
  /** 满额免运费门槛（仅 threshold 模式有效） */
  freeThreshold: number;
  /** 基础运费金额（threshold 未达门槛时 / fixed 模式） */
  baseFee: number;
}

const SETTING_KEY = "shipping_config";

/** 默认配置：全场免运费 */
const DEFAULT_CONFIG: ShippingConfig = {
  mode: "free",
  freeThreshold: 0,
  baseFee: 0,
};

/** 内存缓存，避免每次请求都查库 */
let cachedConfig: ShippingConfig | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 缓存 60 秒

/**
 * 获取运费配置
 * 带 60 秒内存缓存，后台修改后最多 60 秒生效
 */
export async function getShippingConfig(): Promise<ShippingConfig> {
  const now = Date.now();
  if (cachedConfig && now - cacheTime < CACHE_TTL_MS) {
    return cachedConfig;
  }

  try {
    const setting = await prisma.setting.findUnique({
      where: { key: SETTING_KEY },
    });

    if (!setting) {
      cachedConfig = DEFAULT_CONFIG;
      cacheTime = now;
      return DEFAULT_CONFIG;
    }

    const value = setting.value as Record<string, unknown>;
    const config: ShippingConfig = {
      mode: (["free", "threshold", "fixed"].includes(value.mode as string)
        ? value.mode
        : "free") as ShippingMode,
      freeThreshold: typeof value.freeThreshold === "number" ? value.freeThreshold : 0,
      baseFee: typeof value.baseFee === "number" ? value.baseFee : 0,
    };

    cachedConfig = config;
    cacheTime = now;
    return config;
  } catch (error) {
    apiConsole.error("[ShippingConfig] 读取运费配置失败，使用默认免运费:", error);
    return DEFAULT_CONFIG;
  }
}

/**
 * 计算运费
 * @param totalAmount 商品总金额（优惠前）
 * @returns 运费金额（元）
 */
export async function calculateShippingFee(totalAmount: number): Promise<number> {
  const config = await getShippingConfig();

  switch (config.mode) {
    case "free":
      return 0;
    case "threshold":
      return totalAmount >= config.freeThreshold ? 0 : config.baseFee;
    case "fixed":
      return config.baseFee;
    default:
      return 0;
  }
}

/**
 * 更新运费配置（管理端调用）
 * 更新后清除内存缓存，立即生效
 */
export async function updateShippingConfig(config: ShippingConfig): Promise<void> {
  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    update: { value: config as unknown as Prisma.InputJsonValue },
    create: { key: SETTING_KEY, value: config as unknown as Prisma.InputJsonValue },
  });

  // 清除缓存，立即生效
  cachedConfig = null;
  cacheTime = 0;
}

/**
 * 清除运费配置缓存（管理端修改后调用）
 */
export function invalidateShippingConfigCache(): void {
  cachedConfig = null;
  cacheTime = 0;
}
