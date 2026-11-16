/**
 * 社交登录头像镜像
 *
 * 微信/抖音返回的头像 URL 属于第三方热链：
 * - 主站 CSP（img-src）不允许第三方域，直接落库会导致首页/用户中心头像裂图
 * - 第三方 URL 可能过期、防盗链，且每次渲染都会向第三方泄露用户 IP/Referer
 *
 * 因此登录/绑定时下载并压缩到自有存储，数据库中只保存站内路径或自有 OSS 地址。
 * 任一环节失败（超时、超大、非图片、非白名单域）都 fail-soft 回退默认头像。
 */
import type { UploadResult } from "@/lib/upload";
import { cleanupAvatarUpload } from "@/lib/avatar-assets";
import { isSocialAvatarHost, isSocialAvatarUrl } from "@/lib/avatar-url";
import { apiConsole } from "@/lib/logger";
import { processAndSaveImage, validateFileBuffer } from "@/lib/upload";

export { isSocialAvatarUrl };

const MAX_REMOTE_AVATAR_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 5000;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** 已有自有头像时保留用户选择；无头像或仍是历史社交外链时才采用镜像结果 */
export function shouldAdoptMirroredAvatar(current: string | null): boolean {
  return !current || isSocialAvatarUrl(current);
}

/**
 * 下载社交头像并转存自有存储。返回 null 表示无需镜像或镜像失败。
 */
export async function mirrorSocialAvatarForLogin(
  remoteUrl: string | null | undefined,
  currentAvatar: string | null,
  label: string
): Promise<UploadResult | null> {
  if (!remoteUrl || !isSocialAvatarUrl(remoteUrl)) return null;
  if (!shouldAdoptMirroredAvatar(currentAvatar)) return null;

  try {
    const response = await fetch(remoteUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        Accept: "image/*",
        "User-Agent": "NIHPLOD-Avatar-Mirror/1.0",
      },
    });
    if (!response.ok) return null;

    // 跟随重定向后再次校验最终域名，避免被重定向到内网/任意外链
    if (response.url) {
      try {
        if (!isSocialAvatarHost(new URL(response.url).hostname)) return null;
      } catch {
        return null;
      }
    }

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_REMOTE_AVATAR_BYTES) return null;

    const contentType = (response.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (contentType && !contentType.startsWith("image/")) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_REMOTE_AVATAR_BYTES) return null;

    const typeCheck = await validateFileBuffer(buffer);
    if (!typeCheck.valid || !ALLOWED_IMAGE_TYPES.has(typeCheck.detectedType ?? "")) return null;

    return await processAndSaveImage(buffer, `${label}-avatar`, "avatars");
  } catch (error) {
    apiConsole.warn(
      `[SocialAvatar] ${label} 头像镜像失败，回退默认头像:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/** 镜像成功但最终未采用（例如并发场景已换成自有头像）时清理新文件 */
export async function discardMirroredAvatar(upload: UploadResult | null): Promise<void> {
  if (!upload) return;
  try {
    await cleanupAvatarUpload(upload);
  } catch (error) {
    apiConsole.warn("[SocialAvatar] 丢弃未使用的镜像头像失败:", error);
  }
}
