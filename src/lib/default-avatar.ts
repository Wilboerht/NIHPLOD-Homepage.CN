/**
 * 默认头像统一出处
 *
 * 未自定义头像的用户（avatar = null）在全端使用同一默认头像：
 * - 主站 UI：前端兜底渲染 DEFAULT_AVATAR_PATH（相对路径）
 * - SSO 输出：resolveSsoAvatar 回退为绝对 URL（子项目与主站不同源，相对路径无法加载）
 */
import { getIssuer } from "./oauth-constants";

/** 默认头像站内路径（主站 / 子站 public 下各放一份同名文件） */
export const DEFAULT_AVATAR_PATH = "/images/default-avatar.png";

/**
 * SSO 对外输出头像 claim：未设置时回退为默认头像的绝对 URL。
 * 用于 userinfo、ID Token、profile_update webhook 等所有对子项目的输出口径。
 */
export function resolveSsoAvatar(avatar: string | null): string {
  return avatar || `${getIssuer()}${DEFAULT_AVATAR_PATH}`;
}
