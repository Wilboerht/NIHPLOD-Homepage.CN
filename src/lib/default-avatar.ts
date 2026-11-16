/**
 * 默认头像与 SSO 头像输出口径
 *
 * 未自定义头像的用户（avatar = null）在全端使用同一默认头像：
 * - 主站 UI：前端兜底渲染 DEFAULT_AVATAR_PATH（相对路径）
 * - SSO 输出：resolveSsoAvatar 统一补全为绝对 URL（子项目与主站不同源，
 *   相对路径无法加载；本地上传模式产生的 /uploads/** 同样需要绝对化）
 */
import { getIssuer } from "./oauth-constants";
import { DEFAULT_AVATAR_PATH } from "./avatar-constants";
import { isInternalAvatarPath, isSocialAvatarUrl } from "./avatar-url";

export { DEFAULT_AVATAR_PATH };

/**
 * SSO 对外输出头像 claim：
 * - 未设置 → 默认头像绝对 URL
 * - 站内相对路径 → 补全绝对 URL（子站跨域可直接加载）
 * - 历史社交热链 / http / 协议相对 URL → 回退默认头像（避免子站渲染不可信外链）
 * - 其他 https 绝对地址（如自有 CDN）原样透传
 */
export function resolveSsoAvatar(avatar: string | null): string {
  const issuer = getIssuer();
  const fallback = `${issuer}${DEFAULT_AVATAR_PATH}`;
  if (!avatar) return fallback;
  if (isInternalAvatarPath(avatar)) return `${issuer}${avatar}`;
  try {
    const url = new URL(avatar);
    if (url.protocol !== "https:") return fallback;
  } catch {
    return fallback;
  }
  if (isSocialAvatarUrl(avatar)) return fallback;
  return avatar;
}
