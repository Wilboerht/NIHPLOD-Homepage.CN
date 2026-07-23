import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// 固定时区为 Asia/Shanghai，避免日期相关测试因时区不同而失败
process.env.TZ = "Asia/Shanghai";

// 全局 fetch mock（避免测试中意外发出真实网络请求）
if (!globalThis.fetch) {
  globalThis.fetch = vi.fn().mockRejectedValue(new Error("fetch not mocked"));
}

// 抑制测试中的 console.log 噪音（保留 error/warn 便于排查）
const originalLog = console.log;
console.log = (...args: unknown[]) => {
  // 允许带 [Order]、[Refund] 等前缀的日志通过（便于调试）
  const msg = String(args[0] || "");
  if (msg.startsWith("[") || msg.includes("ℹ️")) return;
  originalLog(...args);
};
