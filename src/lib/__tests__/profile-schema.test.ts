import { describe, expect, it } from "vitest";
import { isAllowedAvatarUrl } from "@/lib/profile-schema";

describe("isAllowedAvatarUrl", () => {
  it("允许站内相对路径（本地存储模式）", () => {
    expect(isAllowedAvatarUrl("/uploads/avatars/a.webp")).toBe(true);
    expect(isAllowedAvatarUrl("/images/default-avatar-warm.svg")).toBe(true);
  });

  it("允许官网域与自有 OSS 的 https 地址", () => {
    expect(isAllowedAvatarUrl("https://nihplod.cn/uploads/a.webp")).toBe(true);
    expect(isAllowedAvatarUrl("https://www.nihplod.cn/uploads/a.webp")).toBe(true);
  });

  it("拒绝未登记在配置中的第三方 aliyuncs bucket", () => {
    expect(isAllowedAvatarUrl("https://bucket.oss-cn-hangzhou.aliyuncs.com/a.webp")).toBe(false);
  });

  it("拒绝 http、任意外链与协议相对 URL", () => {
    expect(isAllowedAvatarUrl("http://nihplod.cn/a.webp")).toBe(false);
    expect(isAllowedAvatarUrl("https://evil.com/a.webp")).toBe(false);
    expect(isAllowedAvatarUrl("http://thirdwx.qlogo.cn/a.png")).toBe(false);
    expect(isAllowedAvatarUrl("//evil.com/a.png")).toBe(false);
  });
});
