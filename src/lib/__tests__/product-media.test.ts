import { describe, expect, it } from "vitest";
import {
  collectProductImageUrls,
  filterDeletableProductImageUrls,
  isManagedProductImageUrl,
} from "@/lib/product-media";

describe("product-media", () => {
  it("允许站内产品/静态图片路径", () => {
    expect(isManagedProductImageUrl("/uploads/products/a.webp")).toBe(true);
    expect(isManagedProductImageUrl("/uploads/images/a.webp")).toBe(true);
    expect(isManagedProductImageUrl("/images/a.webp")).toBe(true);
  });

  it("拒绝头像、其它上传目录与 blob", () => {
    expect(isManagedProductImageUrl("/uploads/avatars/a.webp")).toBe(false);
    expect(isManagedProductImageUrl("/uploads/files/a.pdf")).toBe(false);
    expect(isManagedProductImageUrl("blob:https://example.com/a")).toBe(false);
  });

  it("拒绝非自有 OSS 域名、协议相对 URL 与路径穿越", () => {
    expect(isManagedProductImageUrl("https://evil.example.com/products/a.webp")).toBe(false);
    expect(isManagedProductImageUrl("//evil.example.com/products/a.webp")).toBe(false);
    expect(isManagedProductImageUrl("/\\evil.example.com/products/a.webp")).toBe(false);
    expect(isManagedProductImageUrl("/uploads/products/../avatars/a.webp")).toBe(false);
  });

  it("静态 /images/ 允许保存但不进入删除队列", () => {
    expect(isManagedProductImageUrl("/images/a.webp")).toBe(true);
    expect(filterDeletableProductImageUrls(["/images/a.webp", "/uploads/products/b.webp"])).toEqual([
      "/uploads/products/b.webp",
    ]);
  });

  it("收集图片主 URL 与派生 URL 并去重", () => {
    expect(
      collectProductImageUrls([
        { url: "/uploads/products/a.webp", derivedUrls: ["/uploads/products/a-thumb.webp"] },
        { url: "/uploads/products/a.webp", derivedUrls: [] },
      ])
    ).toEqual(["/uploads/products/a.webp", "/uploads/products/a-thumb.webp"]);
  });
});
