/**
 * 用户中心 tab 标识（共享常量）
 *
 * 弹窗菜单、/account 重定向（/?account=<tab>）、首页 account query 处理
 * 三处共用的 tab 白名单，避免字符串散落各处产生漂移。
 * 注意：此模块不依赖 React/客户端 API，服务端组件（如 /account 重定向页）也可安全引用。
 */

export const USER_CENTER_TABS = [
  "profile",
  "vip",
  "devices",
  "authorizations",
  "history",
] as const;

export type UserCenterTab = (typeof USER_CENTER_TABS)[number];

/** 校验字符串是否为合法的用户中心 tab */
export function isUserCenterTab(value: string | null | undefined): value is UserCenterTab {
  return !!value && (USER_CENTER_TABS as readonly string[]).includes(value);
}
