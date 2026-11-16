import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AVATAR_PATH, resolveSsoAvatar } from "@/lib/default-avatar";

describe("resolveSsoAvatar", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://nihplod.cn");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("未设置头像时返回默认头像绝对 URL", () => {
    expect(resolveSsoAvatar(null)).toBe(`https://nihplod.cn${DEFAULT_AVATAR_PATH}`);
  });

  it("站内相对路径补全为绝对 URL（本地存储模式）", () => {
    expect(resolveSsoAvatar("/uploads/avatars/a.webp")).toBe(
      "https://nihplod.cn/uploads/avatars/a.webp"
    );
  });

  it("其他 https 绝对地址原样返回（如自有 CDN）", () => {
    const url = "https://cdn.example.com/avatars/a.webp";
    expect(resolveSsoAvatar(url)).toBe(url);
  });

  it("历史社交热链、http 与协议相对 URL 回退默认头像", () => {
    expect(resolveSsoAvatar("http://thirdwx.qlogo.cn/mmopen/a.png")).toBe(
      `https://nihplod.cn${DEFAULT_AVATAR_PATH}`
    );
    expect(resolveSsoAvatar("https://thirdwx.qlogo.cn/mmopen/a.png")).toBe(
      `https://nihplod.cn${DEFAULT_AVATAR_PATH}`
    );
    expect(resolveSsoAvatar("http://nihplod.cn/a.png")).toBe(
      `https://nihplod.cn${DEFAULT_AVATAR_PATH}`
    );
    expect(resolveSsoAvatar("//evil.com/a.png")).toBe(`https://nihplod.cn${DEFAULT_AVATAR_PATH}`);
  });
});
