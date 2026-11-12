/**
 * 任务执行超时控制。
 *
 * 说明：Promise.race 无法真正终止仍在执行的异步任务，调用方必须在超时后
 * 停止心跳/续租，并让分布式锁等待 TTL 过期，避免另一实例并发重入。
 */
export class TaskTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`任务执行超过 ${timeoutMs}ms 上限`);
    this.name = "TaskTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export async function runWithTimeout<T>(action: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      action(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TaskTimeoutError(timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
