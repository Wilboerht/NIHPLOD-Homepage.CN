import { describe, expect, it } from "vitest";
import {
  getPurchasePlatformLabel,
  isDuplicateCanonicalPurchasePlatform,
  isOfficialPurchasePlatform,
  normalizePurchaseLink,
  resolvePurchasePlatformKey,
} from "@/lib/purchase-platforms";

describe("purchase-platforms", () => {
  it("归一化四类平台别名", () => {
    expect(resolvePurchasePlatformKey("天猫")).toBe("tmall");
    expect(resolvePurchasePlatformKey("天猫国际")).toBe("tmall");
    expect(resolvePurchasePlatformKey("小红书")).toBe("xiaohongshu");
    expect(resolvePurchasePlatformKey("抖音商城")).toBe("douyin");
    expect(resolvePurchasePlatformKey("微信小铺")).toBe("wechat-shop");
  });

  it("官方商城和未知平台不进入四类", () => {
    expect(isOfficialPurchasePlatform("官方商城")).toBe(true);
    expect(resolvePurchasePlatformKey("官方商城")).toBeNull();
    expect(resolvePurchasePlatformKey("京东")).toBeNull();
  });

  it("规范化后四类使用标准展示名，其他平台保留原值", () => {
    expect(
      normalizePurchaseLink({
        platform: "天猫",
        url: " https://tmall.example.com ",
      })
    ).toEqual({
      id: undefined,
      platformKey: "tmall",
      platform: "天猫国际",
      url: "https://tmall.example.com",
      miniProgramShortLink: null,
      miniProgramPath: null,
      order: 0,
    });

    expect(
      normalizePurchaseLink({
        platform: "京东",
        url: "https://jd.example.com",
        order: 100,
      })
    ).toEqual({
      id: undefined,
      platformKey: null,
      platform: "京东",
      url: "https://jd.example.com",
      miniProgramShortLink: null,
      miniProgramPath: null,
      order: 100,
    });
  });

  it("识别四类平台重复", () => {
    expect(
      isDuplicateCanonicalPurchasePlatform([{ platformKey: "tmall" }, { platform: "天猫国际" }])
    ).toBe(true);
    expect(
      isDuplicateCanonicalPurchasePlatform([{ platformKey: "tmall" }, { platform: "京东" }])
    ).toBe(false);
  });

  it("展示名固定", () => {
    expect(getPurchasePlatformLabel("tmall")).toBe("天猫国际");
    expect(getPurchasePlatformLabel("wechat-shop")).toBe("微信小店");
  });
});
