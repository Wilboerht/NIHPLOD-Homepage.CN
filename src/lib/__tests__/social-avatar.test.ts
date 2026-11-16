import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  validate: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@/lib/upload", () => ({
  validateFileBuffer: mocks.validate,
  processAndSaveImage: mocks.save,
}));
vi.mock("@/lib/avatar-assets", () => ({ cleanupAvatarUpload: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  apiConsole: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import {
  isSocialAvatarUrl,
  mirrorSocialAvatarForLogin,
  shouldAdoptMirroredAvatar,
} from "@/lib/social-avatar";

describe("social avatar 镜像", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validate.mockResolvedValue({ valid: true, detectedType: "image/png" });
    mocks.save.mockResolvedValue({
      url: "/uploads/avatars/mirrored.webp",
      thumbnailUrl: "/uploads/avatars/thumbnail/mirrored.webp",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("仅识别微信/抖音头像域", () => {
    expect(isSocialAvatarUrl("http://thirdwx.qlogo.cn/mmopen/a.png")).toBe(true);
    expect(isSocialAvatarUrl("https://wx.qlogo.cn/a.png")).toBe(true);
    expect(isSocialAvatarUrl("https://p3.douyinpic.com/a.png")).toBe(true);
    expect(isSocialAvatarUrl("https://p9.byteimg.com/a.png")).toBe(true);
    expect(isSocialAvatarUrl("https://evil.com/a.png")).toBe(false);
    expect(isSocialAvatarUrl(null)).toBe(false);
  });

  it("无头像或历史社交外链才采用镜像结果", () => {
    expect(shouldAdoptMirroredAvatar(null)).toBe(true);
    expect(shouldAdoptMirroredAvatar("http://thirdwx.qlogo.cn/a.png")).toBe(true);
    expect(shouldAdoptMirroredAvatar("/uploads/avatars/own.webp")).toBe(false);
    expect(shouldAdoptMirroredAvatar("https://nihplod.cn/own.webp")).toBe(false);
  });

  it("非社交域不发起请求", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      mirrorSocialAvatarForLogin("https://evil.com/a.png", null, "wechat")
    ).resolves.toBe(null);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("已有自有头像时不再镜像", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      mirrorSocialAvatarForLogin(
        "https://p3.douyinpic.com/a.png",
        "/uploads/avatars/own.webp",
        "douyin"
      )
    ).resolves.toBe(null);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("下载并转存成功后返回自有 URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      })
    );

    const upload = await mirrorSocialAvatarForLogin(
      "http://thirdwx.qlogo.cn/mmopen/a.png",
      null,
      "wechat"
    );
    expect(upload?.url).toBe("/uploads/avatars/mirrored.webp");
    expect(mocks.validate).toHaveBeenCalled();
    expect(mocks.save).toHaveBeenCalled();
  });

  it("非图片响应或异常时 fail-soft 返回 null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("not an image", { status: 200, headers: { "content-type": "text/html" } })
      )
    );
    await expect(
      mirrorSocialAvatarForLogin("https://p3.douyinpic.com/a.png", null, "douyin")
    ).resolves.toBe(null);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("timeout");
      })
    );
    await expect(
      mirrorSocialAvatarForLogin("https://p3.douyinpic.com/a.png", null, "douyin")
    ).resolves.toBe(null);
  });
});
