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

  console.log("\n========================================");
  console.log("🚀 应用启动初始化...");
  console.log("========================================\n");

  try {
    // 初始化定时任务
    const { initializeCronTasks } = await import("./cron-tasks");
    initializeCronTasks();
  } catch (error) {
    console.error("初始化定时任务失败:", error);
  }

  _initialized = true;

  console.log("\n✅ 应用初始化完成");
  console.log("========================================\n");

  // 优雅关闭处理：仅注册一次，防止内存泄漏
  if (typeof process !== "undefined" && !_handlersRegistered) {
    _handlersRegistered = true;

    process.on("SIGTERM", async () => {
      console.log("\n📛 收到 SIGTERM 信号，开始优雅关闭...");
      try {
        const { stopCronTasks } = await import("./cron-tasks");
        stopCronTasks();
      } catch (error) {
        console.error("关闭定时任务失败:", error);
      }
      process.exit(0);
    });

    process.on("SIGINT", async () => {
      console.log("\n📛 收到 SIGINT 信号，开始优雅关闭...");
      try {
        const { stopCronTasks } = await import("./cron-tasks");
        stopCronTasks();
      } catch (error) {
        console.error("关闭定时任务失败:", error);
      }
      process.exit(0);
    });
  }
}

// 自动导出别名用于更方便的导入
export const setupServer = initializeApp;
