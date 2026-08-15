/**
 * security.ts 测试：returnUrl 开放重定向校验 + 常量时间字符串比较
 */
import { describe, it, expect } from "vitest";
import { isTrustedReturnUrl, timingSafeEqualString } from "../core/security";

const ORIGIN = "https://myapp.com";

describe("isTrustedReturnUrl", () => {
  it("正常相对路径放行", () => {
    expect(isTrustedReturnUrl("/dashboard", ORIGIN)).toBe(true);
    expect(isTrustedReturnUrl("/a/b?x=1#frag", ORIGIN)).toBe(true);
    expect(isTrustedReturnUrl("/", ORIGIN)).toBe(true);
  });

  it("同源绝对 URL 放行", () => {
    expect(isTrustedReturnUrl("https://myapp.com/dashboard", ORIGIN)).toBe(true);
    expect(isTrustedReturnUrl("https://myapp.com:443/x", ORIGIN)).toBe(true);
  });

  it("跨域绝对 URL 拒绝", () => {
    expect(isTrustedReturnUrl("https://evil.com/phish", ORIGIN)).toBe(false);
    expect(isTrustedReturnUrl("http://myapp.com/dashboard", ORIGIN)).toBe(false);
  });

  it("空值与非 URL 字符串拒绝", () => {
    expect(isTrustedReturnUrl("", ORIGIN)).toBe(false);
    expect(isTrustedReturnUrl("not-a-url", ORIGIN)).toBe(false);
  });

  it("协议相对 URL（//evil.com）拒绝", () => {
    expect(isTrustedReturnUrl("//evil.com/phish", ORIGIN)).toBe(false);
  });

  it("反斜杠路径拒绝（浏览器会把 /\\evil.com 归一化为 //evil.com）", () => {
    expect(isTrustedReturnUrl("/\\evil.com", ORIGIN)).toBe(false);
    expect(isTrustedReturnUrl("/\\evil.com\\phish", ORIGIN)).toBe(false);
    expect(isTrustedReturnUrl("/foo\\bar", ORIGIN)).toBe(false);
    expect(isTrustedReturnUrl("\\evil.com", ORIGIN)).toBe(false);
    expect(isTrustedReturnUrl("https://myapp.com/\\@evil.com", ORIGIN)).toBe(false);
  });

  it("javascript: 等危险 scheme 拒绝", () => {
    expect(isTrustedReturnUrl("javascript:alert(1)", ORIGIN)).toBe(false);
    expect(isTrustedReturnUrl("data:text/html,<script>alert(1)</script>", ORIGIN)).toBe(false);
    expect(isTrustedReturnUrl("vbscript:msgbox(1)", ORIGIN)).toBe(false);
  });
});

describe("timingSafeEqualString", () => {
  it("相同字符串返回 true", () => {
    expect(timingSafeEqualString("abc123", "abc123")).toBe(true);
    expect(timingSafeEqualString("", "")).toBe(true);
  });

  it("不同字符串返回 false", () => {
    expect(timingSafeEqualString("abc123", "abc124")).toBe(false);
    expect(timingSafeEqualString("abc", "abcd")).toBe(false);
    expect(timingSafeEqualString("", "a")).toBe(false);
    expect(timingSafeEqualString("a", "")).toBe(false);
  });

  it("多字节字符按 UTF-8 字节比较", () => {
    expect(timingSafeEqualString("状态", "状态")).toBe(true);
    expect(timingSafeEqualString("状态", "状泰")).toBe(false);
  });
});
