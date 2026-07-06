import { describe, it, expect } from "vitest";
import { rateLimit, dualRateLimit } from "../ratelimit";

describe("rateLimit", () => {
  it("应在限制内允许请求", async () => {
    const result = await rateLimit("ip-1", "default", { maxRequests: 3, windowMs: 60000 });
    expect(result.success).toBe(true);
  });

  it("超过限制后应拒绝请求", async () => {
    const options = { maxRequests: 2, windowMs: 60000 };

    await rateLimit("ip-2", "default", options);
    await rateLimit("ip-2", "default", options);
    const result = await rateLimit("ip-2", "default", options);

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("不同标识符应独立计数", async () => {
    const options = { maxRequests: 1, windowMs: 60000 };

    await rateLimit("ip-a", "default", options);
    const result = await rateLimit("ip-b", "default", options);

    expect(result.success).toBe(true);
  });
});

describe("dualRateLimit", () => {
  it("应同时检查 IP 和用户级限制", async () => {
    // 使用 chat / chat-user 预设，maxRequests 分别为 10 和 15，这里不会触发限制
    const first = await dualRateLimit("ip-3", "user-1");
    expect(first.success).toBe(true);
    expect(first.limitedBy).toBeNull();
  });
});
