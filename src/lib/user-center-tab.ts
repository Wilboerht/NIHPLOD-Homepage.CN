/**
 * 用户中心 tab 标识（共享常量）
 *
 * 弹窗菜单、/account 重定向（/?account=<tab>）、首页 account query 处理
 * 三处共用的 tab 白名单，避免字符串散落各处产生漂移。
 * 注意：此模块不依赖 React/客户端 API，服务端组件（如 /account 重定向页）也可安全引用。
 *
 * 一级菜单：个人信息 / 会员中心 / 积分商城 / 安全中心。
 * 安全类面板（设备管理/授权管理/登录历史）已合并为「安全中心」单一菜单项，
 * 内部以 SECURITY_SECTIONS 分段展示；devices/authorizations/history 保留在
 * 白名单中仅用于旧链接兼容（/?account=devices 等自动定位到安全中心对应分段）。
 */

export const USER_CENTER_TABS = [
  "profile",
  "vip",
  "mall",
  "security",
  "devices",
  "authorizations",
  "history",
] as const;

export type UserCenterTab = (typeof USER_CENTER_TABS)[number];

// 安全中心内部的三个分段（与旧菜单项同名，保持 URL 兼容）
export const SECURITY_SECTIONS = ["devices", "authorizations", "history"] as const;

export type SecuritySection = (typeof SECURITY_SECTIONS)[number];

/** 旧的安全类 tab 标识 → 安全中心分段映射 */
export function toSecuritySection(view: string): SecuritySection | null {
  return (SECURITY_SECTIONS as readonly string[]).includes(view)
    ? (view as SecuritySection)
    : null;
}

/** 校验字符串是否为合法的用户中心 tab */
export function isUserCenterTab(value: string | null | undefined): value is UserCenterTab {
  return !!value && (USER_CENTER_TABS as readonly string[]).includes(value);
}
