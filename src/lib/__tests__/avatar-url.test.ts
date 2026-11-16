import { describe, expect, it } from "vitest";
import { isInternalAvatarPath, isRenderableAvatarUrl } from "@/lib/avatar-url";

describe("avatar url 判定", () => {
  it("仅接受 /images 与 /uploads 站内路径", () => {
    expect(isInternalAvatarPath("/images/default-avatar-warm.svg")).toBe(true);
    expect(isInternalAvatarPath("/uploads/avatars/a.webp")).toBe(true);
    expect(isInternalAvatarPath("//evil.com/a.png")).toBe(false);
    expect(isInternalAvatarPath("/images/../secret")).toBe(false);
    expect(isInternalAvatarPath("/api/health")).toBe(false);
    expect(isInternalAvatarPath("https://nihplod.cn/a.png")).toBe(false);
  });

  it("绝对地址仅允许 https 官网域/自有 OSS", () => {
    expect(isRenderableAvatarUrl("https://nihplod.cn/a.png")).toBe(true);
    expect(isRenderableAvatarUrl("https://www.nihplod.cn/a.png")).toBe(true);
    expect(isRenderableAvatarUrl("https://bucket.oss-cn-hangzhou.aliyuncs.com/a.webp")).toBe(true);
    expect(isRenderableAvatarUrl("http://nihplod.cn/a.png")).toBe(false);
    expect(isRenderableAvatarUrl("https://evil.com/a.png")).toBe(false);
    expect(isRenderableAvatarUrl("https://thirdwx.qlogo.cn/a.png")).toBe(false);
    expect(isRenderableAvatarUrl("//evil.com/a.png")).toBe(false);
    expect(isRenderableAvatarUrl(null)).toBe(false);
  });
});
