import { describe, it, expect } from "vitest";
import { getBrandRedirectTarget } from "@/config/brand-redirects";

describe("getBrandRedirectTarget", () => {
  it("匹配中文品牌错拼", () => {
    expect(getBrandRedirectTarget("/旎白")).toBe("/");
    expect(getBrandRedirectTarget("/旎珀")).toBe("/");
    expect(getBrandRedirectTarget("/旎泊")).toBe("/");
    expect(getBrandRedirectTarget("/尼柏")).toBe("/");
    expect(getBrandRedirectTarget("/你播")).toBe("/");
  });

  it("匹配 URL 编码路径", () => {
    expect(getBrandRedirectTarget("/%E6%97%8E%E7%99%BD")).toBe("/");
  });

  it("不匹配正常路径", () => {
    expect(getBrandRedirectTarget("/products")).toBeNull();
    expect(getBrandRedirectTarget("/")).toBeNull();
  });
});
