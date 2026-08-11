import { describe, it, expect } from "vitest";
import { getParentTargetOrigin } from "../parent-origin";

describe("getParentTargetOrigin", () => {
  it("应从 document.referrer 推导父窗口 origin", () => {
    expect(getParentTargetOrigin("https://app.example.com/page?x=1#y", "")).toBe(
      "https://app.example.com"
    );
  });

  it("referrer 为空或非法时返回 null（不发消息）", () => {
    expect(getParentTargetOrigin("", "")).toBeNull();
    expect(getParentTargetOrigin("not-a-url", "")).toBeNull();
  });

  it("未配置白名单时放行任意合法 referrer origin", () => {
    expect(getParentTargetOrigin("https://any.example.com/", undefined)).toBe(
      "https://any.example.com"
    );
  });

  it("配置白名单后仅放行白名单内 origin", () => {
    const whitelist = "https://a.example.com, https://b.example.com";
    expect(getParentTargetOrigin("https://b.example.com/embed", whitelist)).toBe(
      "https://b.example.com"
    );
    expect(getParentTargetOrigin("https://evil.example.com/embed", whitelist)).toBeNull();
  });

  it("白名单按完整 origin 匹配，而非前缀", () => {
    expect(
      getParentTargetOrigin("https://a.example.com.evil.com/x", "https://a.example.com")
    ).toBeNull();
  });

  it("origin 含端口时按完整 origin 匹配", () => {
    expect(getParentTargetOrigin("http://localhost:3000/x", "http://localhost:3000")).toBe(
      "http://localhost:3000"
    );
    expect(getParentTargetOrigin("http://localhost:4000/x", "http://localhost:3000")).toBeNull();
  });
});
