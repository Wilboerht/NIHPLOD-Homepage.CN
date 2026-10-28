/**
 * 主站 → 测肤子站（smart.nihplod.cn）产品同步
 *
 * 主站是产品基础信息的唯一数据源；保存产品后推送一次全量快照，子站按
 * sourceProductId 做幂等 upsert。子站推荐属性（active/featured/肤质/禁忌/
 * 推荐理由/核心成分/主要功效）不会被覆盖。
 *
 * 推送失败不影响主站保存；每日脚本和产品列表手动按钮会兜底。
 */
import { after } from "next/server";
import prisma from "@/lib/prisma";
import { advisorRequest } from "@/lib/advisor-internal";
import { apiConsole } from "@/lib/logger";
import { htmlToPlainText } from "@/lib/html-sanitize";
import {
  getPurchasePlatformLabel,
  isPurchasePlatformKey,
  resolvePurchasePlatformKey,
  type PurchasePlatformKey,
} from "@/lib/purchase-platforms";

const SYNC_PATH = "/api/internal/admin/products/sync";
const SYNC_TIMEOUT_MS = 15_000;
const MAX_IMAGES = 5;
const MAX_IMAGE_URL_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_HOW_TO_USE_LENGTH = 2000;

export interface AdvisorSnapshotPurchaseLink {
  platformKey: PurchasePlatformKey;
  platform: string;
  url?: string;
  miniProgramShortLink?: string;
  miniProgramPath?: string;
}

export interface AdvisorProductSnapshotItem {
  sourceProductId: string;
  name: string;
  category: string;
  price: string;
  description: string;
  published: boolean;
  updatedAt: string;
  capacity: string | null;
  howToUse: string | null;
  origin: string | null;
  benefits: string[];
  images: string[];
  purchaseLinks: AdvisorSnapshotPurchaseLink[];
  purchaseLinksTotal: number;
}

export interface AdvisorProductSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  products: AdvisorProductSnapshotItem[];
}

export type AdvisorProductSyncTrigger = "save" | "manual" | "daily";

export interface AdvisorProductPushOptions {
  trigger: AdvisorProductSyncTrigger;
  bindByName?: boolean;
  force?: boolean;
  dryRun?: boolean;
}

export interface AdvisorProductPushResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  code?: string;
  message?: string;
  status?: number;
  data?: unknown;
  productCount?: number;
}

interface AdvisorSyncResponse {
  success?: boolean;
  data?: unknown;
  error?:
    | string
    | {
        code?: string;
        message?: string;
      };
}

const MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function publicBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://nihplod.cn").replace(/\/+$/, "");
}

function toAbsoluteAssetUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      // 子站 Next/CSP 只放行 https 的裸域 nihplod.cn；www/http 统一收敛
      if (parsed.hostname === "www.nihplod.cn" || parsed.hostname === "nihplod.cn") {
        parsed.hostname = "nihplod.cn";
        parsed.protocol = "https:";
      }
      return parsed.toString();
    } catch {
      return null;
    }
  }
  if (url.startsWith("/")) return `${publicBaseUrl()}${url}`;
  return null;
}

function buildImages(
  images: Array<{ url: string; order: number }>
): { images: string[]; skipped: number; truncated: boolean } {
  const sorted = [...images].sort((a, b) => a.order - b.order);
  const result: string[] = [];
  let skipped = 0;
  let truncated = false;
  for (const image of sorted) {
    const absolute = toAbsoluteAssetUrl(image.url);
    if (!absolute || absolute.length > MAX_IMAGE_URL_LENGTH) {
      skipped += 1;
      continue;
    }
    if (!result.includes(absolute)) result.push(absolute);
    if (result.length >= MAX_IMAGES) {
      truncated = sorted.length > result.length;
      break;
    }
  }
  return { images: result, skipped, truncated };
}

function buildPurchaseLinks(
  links: Array<{
    platform: string;
    platformKey: string | null;
    url: string;
    miniProgramShortLink: string | null;
    miniProgramPath: string | null;
    order: number;
  }>
): { links: AdvisorSnapshotPurchaseLink[]; total: number; skipped: number } {
  const sorted = [...links].sort((a, b) => a.order - b.order);
  const result: AdvisorSnapshotPurchaseLink[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (const link of sorted) {
    const platformKey = isPurchasePlatformKey(link.platformKey)
      ? link.platformKey
      : resolvePurchasePlatformKey(link.platform);
    if (!platformKey) {
      // 官方商城、京东等子站未支持的平台：不写入，由 advisor 侧/日志提示
      skipped += 1;
      continue;
    }
    if (seen.has(platformKey)) {
      skipped += 1;
      continue;
    }
    const url = link.url?.trim() || "";
    const miniProgramShortLink = link.miniProgramShortLink?.trim() || "";
    const miniProgramPath = link.miniProgramPath?.trim() || "";
    if (!url && !miniProgramShortLink) {
      skipped += 1;
      continue;
    }
    if (platformKey === "wechat-shop" && !miniProgramShortLink) {
      skipped += 1;
      continue;
    }
    result.push({
      platformKey,
      platform: getPurchasePlatformLabel(platformKey),
      ...(url ? { url } : {}),
      ...(miniProgramShortLink ? { miniProgramShortLink } : {}),
      ...(miniProgramPath ? { miniProgramPath } : {}),
    });
    seen.add(platformKey);
  }

  return { links: result, total: sorted.length, skipped };
}

/** 构建主站全量产品快照（只读） */
export async function buildAdvisorProductSnapshot(): Promise<AdvisorProductSnapshot> {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      price: true,
      capacity: true,
      description: true,
      usage: true,
      origin: true,
      benefits: true,
      published: true,
      updatedAt: true,
      category: { select: { name: true, visible: true } },
      images: { orderBy: { order: "asc" }, select: { url: true, order: true } },
      purchaseLinks: {
        orderBy: { order: "asc" },
        select: {
          platform: true,
          platformKey: true,
          url: true,
          miniProgramShortLink: true,
          miniProgramPath: true,
          order: true,
        },
      },
    },
  });

  let skippedImages = 0;
  let truncatedImages = 0;
  let skippedLinks = 0;

  const snapshotProducts: AdvisorProductSnapshotItem[] = products.map((product) => {
    const imageResult = buildImages(product.images);
    const linkResult = buildPurchaseLinks(product.purchaseLinks);
    skippedImages += imageResult.skipped;
    if (imageResult.truncated) truncatedImages += 1;
    skippedLinks += linkResult.skipped;

    const priceNumber = Number(product.price);
    return {
      sourceProductId: product.id,
      name: product.name,
      category: product.category.name,
      price: Number.isFinite(priceNumber) ? String(priceNumber) : "0",
      description: htmlToPlainText(product.description).slice(0, MAX_DESCRIPTION_LENGTH),
      published: product.published && product.category.visible,
      updatedAt: product.updatedAt.toISOString(),
      capacity: product.capacity?.trim() || null,
      howToUse:
        htmlToPlainText(product.usage).slice(0, MAX_HOW_TO_USE_LENGTH).trim() || null,
      origin: product.origin?.trim() || null,
      benefits: Array.isArray(product.benefits) ? product.benefits : [],
      images: imageResult.images,
      purchaseLinks: linkResult.links,
      purchaseLinksTotal: linkResult.total,
    };
  });

  if (skippedLinks > 0) {
    apiConsole.warn("[AdvisorProductSync] 部分购买链接平台子站不支持，已跳过", {
      skippedLinks,
    });
  }
  if (skippedImages > 0 || truncatedImages > 0) {
    apiConsole.warn("[AdvisorProductSync] 部分产品图片被跳过或截断", {
      skippedImages,
      truncatedImages,
    });
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    products: snapshotProducts,
  };
}

function shouldRetry(result: {
  status: number;
  code: string;
}): boolean {
  if (result.code === "NOT_CONFIGURED" || result.code === "SYNC_DISABLED") return false;
  if (result.code === "SYNC_IN_PROGRESS") return true;
  if (result.status === 0 || result.status === 429 || result.status >= 500) return true;
  return false;
}

function extractAdvisorError(payload: AdvisorSyncResponse | null): {
  code: string;
  message: string;
} {
  if (payload?.error && typeof payload.error === "object") {
    return {
      code: payload.error.code || "UPSTREAM_ERROR",
      message: payload.error.message || "测肤子站同步失败",
    };
  }
  if (typeof payload?.error === "string" && payload.error) {
    return { code: "UPSTREAM_ERROR", message: payload.error };
  }
  return { code: "UPSTREAM_ERROR", message: "测肤子站同步失败" };
}

/** 推送全量快照到子站；供保存钩子、手动按钮、每日脚本共用 */
export async function pushAdvisorProductSnapshot(
  options: AdvisorProductPushOptions
): Promise<AdvisorProductPushResult> {
  if (process.env.ADVISOR_PRODUCT_SYNC_ENABLED === "false") {
    return { ok: true, skipped: true, reason: "disabled" };
  }

  let snapshot: AdvisorProductSnapshot;
  try {
    snapshot = await buildAdvisorProductSnapshot();
  } catch (error) {
    apiConsole.error("[AdvisorProductSync] 构建产品快照失败", error);
    return { ok: false, code: "SNAPSHOT_BUILD_FAILED", message: "构建产品快照失败" };
  }

  const payload = {
    ...snapshot,
    options: {
      trigger: options.trigger,
      bindByName: options.bindByName === true,
      force: options.force === true,
      dryRun: options.dryRun === true,
    },
  };

  let lastError: { code: string; message: string; status: number } = {
    code: "UPSTREAM_ERROR",
    message: "测肤子站同步失败",
    status: 0,
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const result = await advisorRequest<AdvisorSyncResponse>(SYNC_PATH, {
      method: "POST",
      body: payload,
      timeoutMs: SYNC_TIMEOUT_MS,
    });

    if (result.ok) {
      if (result.data?.success === false) {
        const error = extractAdvisorError(result.data);
        return {
          ok: false,
          code: error.code,
          message: error.message,
          status: result.status,
          productCount: snapshot.products.length,
        };
      }
      const data = result.data?.data ?? result.data;
      apiConsole.info("[AdvisorProductSync] 推送完成", {
        trigger: options.trigger,
        dryRun: options.dryRun === true,
        productCount: snapshot.products.length,
        result: data,
      });
      return {
        ok: true,
        data,
        productCount: snapshot.products.length,
      };
    }

    lastError = {
      code: result.code,
      message: result.message,
      status: result.status,
    };

    if (attempt < MAX_ATTEMPTS && shouldRetry(result)) {
      await sleep(attempt === 1 ? 400 : 1200);
      continue;
    }
    break;
  }

  apiConsole.warn("[AdvisorProductSync] 推送失败", {
    trigger: options.trigger,
    code: lastError.code,
    status: lastError.status,
    message: lastError.message,
  });
  return {
    ok: false,
    code: lastError.code,
    message: lastError.message,
    status: lastError.status,
    productCount: snapshot.products.length,
  };
}

/**
 * 保存产品后的后台推送：Next after() 在响应返回后执行，不阻塞保存。
 * 失败只记日志，由每日脚本/手动按钮兜底。
 */
export function scheduleAdvisorProductSync(trigger: AdvisorProductSyncTrigger = "save"): void {
  if (process.env.ADVISOR_PRODUCT_SYNC_ENABLED === "false") return;
  try {
    after(async () => {
      try {
        await pushAdvisorProductSnapshot({ trigger });
      } catch (error) {
        apiConsole.error("[AdvisorProductSync] 后台推送异常", error);
      }
    });
  } catch (error) {
    apiConsole.error("[AdvisorProductSync] 无法注册后台推送", error);
  }
}
