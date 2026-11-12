import { describe, expect, it, vi } from "vitest";
import { runWithTimeout, TaskTimeoutError } from "../task-timeout";

describe("runWithTimeout", () => {
  it("在超时前完成时返回结果", async () => {
    await expect(runWithTimeout(async () => "ok", 1000)).resolves.toBe("ok");
  });

  it("超时后抛出 TaskTimeoutError", async () => {
    vi.useFakeTimers();
    try {
      const promise = runWithTimeout(
        () =>
          new Promise<string>((resolve) => {
            setTimeout(() => resolve("late"), 60_000);
          }),
        1000
      );
      const assertion = expect(promise).rejects.toBeInstanceOf(TaskTimeoutError);
      await vi.advanceTimersByTimeAsync(1000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("action 自身异常原样抛出", async () => {
    const error = new Error("boom");
    await expect(runWithTimeout(async () => Promise.reject(error), 1000)).rejects.toBe(error);
  });
});
