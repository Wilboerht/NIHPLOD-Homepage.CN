/**
 * 产品图片 URL 归属校验。
 *
 * 产品图片只允许来自站内产品上传目录或自有 OSS 的 products/images 前缀，
 * 避免管理员把任意公有对象 URL 写入产品图片后在删除产品时被误删。
 */
import { getOSSPublicDomain } from "@/lib/ali-oss";
import { prisma } from "@/lib/prisma";

// /images/ 为站点静态产品图（不会被 deleteUploadedFile 删除），保留兼容
const LOCAL_PRODUCT_PREFIXES = ["/uploads/products/", "/uploads/images/", "/images/"];
const REMOTE_PRODUCT_PREFIXES = ["/products/", "/images/"];
// 可安全进入媒体删除队列的前缀：站内静态 /images/ 不能删
const DELETABLE_LOCAL_PREFIXES = ["/uploads/products/", "/uploads/images/"];
const DELETABLE_REMOTE_PREFIXES = ["/products/", "/images/"];

function getOssHost(): string | null {
  try {
    return new URL(getOSSPublicDomain()).host;
  } catch {
    return null;
  }
}

function safeDecodePathname(pathname: string): string | null {
  try {
    const decoded = decodeURIComponent(pathname);
    if (decoded.includes("..") || decoded.includes("\\")) return null;
    return decoded;
  } catch {
    return null;
  }
}

function matchesProductImageUrl(
  raw: string,
  localPrefixes: readonly string[],
  remotePrefixes: readonly string[]
): boolean {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return false;
  // blob: 只存在于浏览器内存，不能作为服务端持久化地址
  if (value.startsWith("blob:")) return false;
  // 协议相对 URL（//evil.com/...）不是站内路径，必须拒绝
  if (value.startsWith("//")) return false;

  if (value.startsWith("/")) {
    try {
      const parsed = new URL(value, "http://localhost");
      // 反斜杠/特殊字符可能把相对路径解析成外部 host，必须拒绝
      if (parsed.host !== "localhost") return false;
      const pathname = safeDecodePathname(parsed.pathname);
      if (!pathname) return false;
      return localPrefixes.some((prefix) => pathname.startsWith(prefix));
    } catch {
      return false;
    }
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const ossHost = getOssHost();
    if (!ossHost || url.host !== ossHost) return false;
    const pathname = safeDecodePathname(url.pathname);
    if (!pathname) return false;
    return remotePrefixes.some((prefix) => pathname.startsWith(prefix));
  } catch {
    return false;
  }
}

export function isManagedProductImageUrl(raw: string): boolean {
  return matchesProductImageUrl(raw, LOCAL_PRODUCT_PREFIXES, REMOTE_PRODUCT_PREFIXES);
}

/** 仅用于媒体删除：站内静态 /images/ 不可删除 */
export function isDeletableProductImageUrl(raw: string): boolean {
  return matchesProductImageUrl(raw, DELETABLE_LOCAL_PREFIXES, DELETABLE_REMOTE_PREFIXES);
}

export function collectProductImageUrls(
  images: Array<{ url: string; derivedUrls?: string[] | null }>
): string[] {
  return [
    ...new Set(
      images
        .flatMap((image) => [image.url, ...(image.derivedUrls ?? [])])
        .map((url) => url?.trim())
        .filter((url): url is string => Boolean(url))
    ),
  ];
}

export function filterManagedProductImageUrls(urls: string[]): string[] {
  return urls.filter(isManagedProductImageUrl);
}

export function filterDeletableProductImageUrls(urls: string[]): string[] {
  return urls.filter(isDeletableProductImageUrl);
}

/**
 * 查找是否已有其他产品占用同一图片 URL。
 * 防止通过“把图片 URL 指向其他产品图片”再删除本产品的方式越权删除对象。
 */
export async function findReusedProductImageUrl(
  urls: string[],
  excludeProductId?: string
): Promise<string | null> {
  if (urls.length === 0) return null;
  const match = await prisma.image.findFirst({
    where: {
      ...(excludeProductId ? { productId: { not: excludeProductId } } : {}),
      OR: [{ url: { in: urls } }, { derivedUrls: { hasSome: urls } }],
    },
    select: { url: true, derivedUrls: true },
  });
  if (!match) return null;
  return urls.find((url) => url === match.url || match.derivedUrls.includes(url)) ?? match.url;
}
