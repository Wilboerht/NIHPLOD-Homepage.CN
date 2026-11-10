import { afterEach, describe, expect, it } from "vitest";
import { PURCHASE_PLATFORM_APP_IDS, buildPurchaseJump } from "@/lib/purchase-jump";

describe("purchase-jump", () => {
  afterEach(() => {
    PURCHASE_PLATFORM_APP_IDS.tmall = "";
    PURCHASE_PLATFORM_APP_IDS.xiaohongshu = "";
    PURCHASE_PLATFORM_APP_IDS.douyin = "";
    PURCHASE_PLATFORM_APP_IDS["wechat-shop"] = "";
  });

  it("短链优先", () => {
    PURCHASE_PLATFORM_APP_IDS.tmall = "wx0000000000000000";
    expect(
      buildPurchaseJump({
        platformKey: "tmall",
        miniProgramShortLink: "#小程序://tmall/abc",
        miniProgramPath: "pages/product/index?id=1",
      })
    ).toEqual({ type: "miniprogram", shortLink: "#小程序://tmall/abc" });
  });

  it("短链缺失时使用 appId + path", () => {
    PURCHASE_PLATFORM_APP_IDS.tmall = "wx0000000000000000";
    expect(
      buildPurchaseJump({
        platformKey: "tmall",
        miniProgramPath: "/pages/product/index?id=1",
      })
    ).toEqual({
      type: "miniprogram",
      appId: "wx0000000000000000",
      path: "pages/product/index?id=1",
    });
  });

  it("拒绝把普通文本、URL Link 或 Scheme 当作 shortLink", () => {
    for (const miniProgramShortLink of [
      "not-a-link",
      "https://wxaurl.cn/TICKET",
      "weixin://dl/business/?t=abc",
    ]) {
      expect(buildPurchaseJump({ platformKey: "wechat-shop", miniProgramShortLink })).toEqual({
        type: "copy",
      });
    }
  });

  it("非法 AppID 或路径不生成跳转参数", () => {
    PURCHASE_PLATFORM_APP_IDS["wechat-shop"] = "invalid-app-id";
    expect(
      buildPurchaseJump({
        platformKey: "wechat-shop",
        miniProgramPath: "page/index/index?id=123",
      })
    ).toEqual({ type: "copy" });

    PURCHASE_PLATFORM_APP_IDS["wechat-shop"] = "wx0000000000000000";
    expect(buildPurchaseJump({ platformKey: "wechat-shop", miniProgramPath: "pages/" })).toEqual({
      type: "copy",
    });
  });

  it("都没有时回退复制链接", () => {
    expect(
      buildPurchaseJump({
        platformKey: "tmall",
        miniProgramPath: "pages/product/index?id=1",
      })
    ).toEqual({ type: "copy" });
  });

  it("其他非四类平台有短链时仍可跳转", () => {
    expect(
      buildPurchaseJump({
        platformKey: null,
        miniProgramShortLink: "#小程序://other/abc",
      })
    ).toEqual({ type: "miniprogram", shortLink: "#小程序://other/abc" });
  });
});
