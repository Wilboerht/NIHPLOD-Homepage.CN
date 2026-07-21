/**
 * Next.js Instrumentation Hook
 * 在服务器启动时执行一次性初始化（不阻塞请求处理）。
 *
 * 替代在 layout.tsx 中每次请求调用 initializeApp() 的模式，
 * instrumentation 钩子仅在服务器启动时运行一次。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initializeApp } = await import("@/lib/server-init");
    await initializeApp();
  }
}
