/**
 * @nihplod/sso-react
 *
 * NIHPLOD 一网通 SSO React SDK
 *
 * 提供 React Hook 和组件用于子项目快速接入 SSO：
 * - useSSO：获取用户登录状态和信息
 * - LoginButton：一键登录按钮
 * - UserCenterModal：嵌入式用户中心弹窗
 *
 * 安装：npm install @nihplod/sso-react
 *
 * 使用：
 * ```tsx
 * import { SSOProvider, useSSO, LoginButton } from "@nihplod/sso-react";
 *
 * function App() {
 *   return (
 *     <SSOProvider
 *       config={{
 *         providerUrl: "https://nihplod.cn",
 *         clientId: "advisor",
 *         redirectUri: "https://advisor.nihplod.cn/callback",
 *       }}
 *     >
 *       <MyComponent />
 *     </SSOProvider>
 *   );
 * }
 * ```
 */

export { SSOProvider, useSSOContext } from "./useSSO";
export type { SSOConfig, SSOUser, UseSSOReturn } from "./useSSO";

export { LoginButton } from "./LoginButton";
export type { LoginButtonProps } from "./LoginButton";

export { UserCenterModal } from "./UserCenterModal";
export type { UserCenterModalProps } from "./UserCenterModal";
