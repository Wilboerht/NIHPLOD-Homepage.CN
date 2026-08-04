import { headers } from "next/headers";

/**
 * 从请求头读取 CSP nonce。
 * 中间件（src/middleware.ts）会为每个 HTML 请求生成随机 nonce 并写入 x-nonce 头，
 * 服务端组件调用此方法即可将 nonce 注入 <script> / next/script 组件。
 *
 * 注意：调用此函数会导致页面进入动态渲染，以支持 per-request nonce。
 */
export async function getNonce(): Promise<string | undefined> {
  return (await headers()).get("x-nonce") ?? undefined;
}
