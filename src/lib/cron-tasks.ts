/**
 * 定时任务管理器
 * 自托管服务器上运行周期性任务
 * 使用 node-cron 替代 Vercel Cron
 */
import cron from "node-cron";
import { autoCancelExpiredOrders, autoCompleteShippedOrders } from "./order";

interface ScheduledTask {
  name: string;
  cronExpression: string;
  handler: () => Promise<void>;
}

// 定义所有定时任务
const tasks: ScheduledTask[] = [
  {
    name: "Auto Cancel Expired Orders",
    cronExpression: "*/30 * * * *", // 每30分钟执行一次
    handler: async () => {
      try {
        console.log("[Cron] 开始执行订单取消任务...");
        const result = await autoCancelExpiredOrders(30);
        console.log(`[Cron] 订单取消完成: ${result.canceledCount} 个订单被取消`);
      } catch (error) {
        console.error("[Cron] 订单取消任务失败:", error);
      }
    },
  },
  {
    name: "Auto Complete Shipped Orders",
    cronExpression: "0 0 * * *", // 每天午夜执行一次
    handler: async () => {
      try {
        console.log("[Cron] 开始执行订单完成任务...");
        const result = await autoCompleteShippedOrders(15);
        console.log(`[Cron] 订单完成处理: ${result.completedCount} 个订单自动完成`);
      } catch (error) {
        console.error("[Cron] 订单完成任务失败:", error);
      }
    },
  },
];

let scheduledTasks: ReturnType<typeof cron.schedule>[] = [];
let isInitialized = false;

/**
 * 初始化所有定时任务
 * 在应用启动时调用
 */
export function initializeCronTasks(): void {
  if (isInitialized) {
    console.log("[Cron] 定时任务已初始化，跳过重复初始化");
    return;
  }

  console.log("[Cron] 初始化定时任务...");

  for (const task of tasks) {
    try {
      // runOnInit: false 表示不在启动时立即执行，而是在下一个定时周期执行
      const job = cron.schedule(task.cronExpression, task.handler, {
        runOnInit: false,
      });

      scheduledTasks.push(job);
      console.log(`[Cron] ✓ 任务已注册: ${task.name} (${task.cronExpression})`);
    } catch (error) {
      console.error(`[Cron] ✗ 任务注册失败: ${task.name}`, error);
    }
  }

  isInitialized = true;
  console.log(`[Cron] 共注册 ${scheduledTasks.length} 个定时任务`);
}

/**
 * 停止所有定时任务
 * 在应用关闭时调用
 */
export function stopCronTasks(): void {
  console.log("[Cron] 停止所有定时任务...");

  for (const task of scheduledTasks) {
    task.stop();
  }

  scheduledTasks = [];
  isInitialized = false;
  console.log("[Cron] 所有定时任务已停止");
}

/**
 * 获取任务状态
 */
export function getCronTasksStatus(): Array<{
  name: string;
  schedule: string;
  running: boolean;
}> {
  return tasks.map((task, index) => ({
    name: task.name,
    schedule: task.cronExpression,
    running: isInitialized && index < scheduledTasks.length,
  }));
}

/**
 * 手动执行某个任务（用于测试）
 */
export async function runCronTaskManually(taskName: string): Promise<{ success: boolean; message: string }> {
  const task = tasks.find((t) => t.name === taskName);

  if (!task) {
    return {
      success: false,
      message: `未找到任务: ${taskName}`,
    };
  }

  try {
    console.log(`[Cron] 手动执行任务: ${taskName}`);
    await task.handler();
    return {
      success: true,
      message: `任务 ${taskName} 执行成功`,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `任务 ${taskName} 执行失败: ${error.message}`,
    };
  }
}
