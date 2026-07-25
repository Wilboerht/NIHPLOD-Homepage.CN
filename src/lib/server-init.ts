import { apiConsole } from "@/lib/logger";
/**
 * Next.js 应用启动初始化
 * 在服务器启动时执行一次性初始化任务
 *
 * 使用方法: 在 src/app/layout.tsx 或其他在服务器端运行的文件中导入
 * import { initializeApp } from "@/lib/server-init";
 * initializeApp(); // 调用即可
 */

let _initialized = false;
let _handlersRegistered = false;

export async function initializeApp(): Promise<void> {
  // 构建阶段跳过初始化（防止 worker 进程重复执行）
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }

  // 防止重复初始化
  if (_initialized) {
    return;
  }

  apiConsole.info("\n========================================");
  apiConsole.info("🚀 应用启动初始化...");
  apiConsole.info("========================================\n");

  try {
    // 初始化定时任务
    const { initializeCronTasks } = await import("./cron-tasks");
    initializeCronTasks();
  } catch (error) {
    apiConsole.error("初始化定时任务失败:", error);
  }

  _initialized = true;

  apiConsole.info("\n✅ 应用初始化完成");
  apiConsole.info("========================================\n");

  // 优雅关闭：仅负责 cron 任务清理，不调用 process.exit
  // prisma.ts 已注册完整的 DB 连接池关闭 + process.exit 逻辑
  if (typeof process !== "undefined" && !_handlersRegistered) {
    _handlersRegistered = true;

    process.on("SIGTERM", async () => {
      apiConsole.info("\n[Server] 收到 SIGTERM，停止定时任务...");
      try {
        const { stopCronTasks } = await import("./cron-tasks");
        stopCronTasks();
      } catch (error) {
        apiConsole.error("[Server] 停止定时任务失败:", error);
      }
    });

    process.on("SIGINT", async () => {
      apiConsole.info("\n[Server] 收到 SIGINT，停止定时任务...");
      try {
        const { stopCronTasks } = await import("./cron-tasks");
        stopCronTasks();
      } catch (error) {
        apiConsole.error("[Server] 停止定时任务失败:", error);
      }
    });
  }
}
