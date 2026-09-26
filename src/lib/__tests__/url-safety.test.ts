/**
 * URL 安全校验单元测试（防开放重定向）
 * src/lib/url-safety.ts
 */
import { describe, it, expect } from "vitest";
import {
  hasUnsafeUrlChars,
  isSafeRelativePath,
  isSafeSameOriginUrlOrPath,
} from "@/lib/url-safety";

const ORIGIN = "https://nihplod.cn";

describe("hasUnsafeUrlChars", () => {
  it("反斜杠与控制字符判定为不安全", () => {
    expect(hasUnsafeUrlChars("/\\evil.com")).toBe(true);
    expect(hasUnsafeUrlChars("/\n//evil.com")).toBe(true);
    expect(hasUnsafeUrlChars("/\r//evil.com")).toBe(true);
    expect(hasUnsafeUrlChars("/\t//evil.com")).toBe(true);
    expect(hasUnsafeUrlChars("/\u0000")).toBe(true);
    expect(hasUnsafeUrlChars("/\u007F")).toBe(true);
  });

  it("正常路径判定为安全", () => {
    expect(hasUnsafeUrlChars("/account?tab=1#x")).toBe(false);
    expect(hasUnsafeUrlChars("https://nihplod.cn/x")).toBe(false);
  });
});

describe("isSafeRelativePath", () => {
  it("站内相对路径放行", () => {
    expect(isSafeRelativePath("/")).toBe(true);
    expect(isSafeRelativePath("/account")).toBe(true);
    expect(isSafeRelativePath("/a/b?x=1#frag")).toBe(true);
  });

  it("空值、协议相对与反斜杠/控制字符路径拒绝", () => {
    expect(isSafeRelativePath("")).toBe(false);
    expect(isSafeRelativePath("//evil.com")).toBe(false);
    expect(isSafeRelativePath("/\\evil.com")).toBe(false);
    expect(isSafeRelativePath("/\n//evil.com")).toBe(false);
    expect(isSafeRelativePath("/\t//evil.com")).toBe(false);
    expect(isSafeRelativePath("account")).toBe(false);
  });
});

describe("isSafeSameOriginUrlOrPath", () => {
  it("站内相对路径与同源绝对 URL 放行", () => {
    expect(isSafeSameOriginUrlOrPath("/account", ORIGIN)).toBe(true);
    expect(isSafeSameOriginUrlOrPath("https://nihplod.cn/account", ORIGIN)).toBe(true);
    expect(isSafeSameOriginUrlOrPath("https://nihplod.cn:443/account", ORIGIN)).toBe(true);
  });

  it("开放重定向向量拒绝（反斜杠/控制字符/协议相对/跨站/危险 scheme）", () => {
    expect(isSafeSameOriginUrlOrPath("/\\evil.com", ORIGIN)).toBe(false);
    expect(isSafeSameOriginUrlOrPath("/\n//evil.com", ORIGIN)).toBe(false);
    expect(isSafeSameOriginUrlOrPath("/\r//evil.com", ORIGIN)).toBe(false);
    expect(isSafeSameOriginUrlOrPath("/\t//evil.com", ORIGIN)).toBe(false);
    expect(isSafeSameOriginUrlOrPath("//evil.com", ORIGIN)).toBe(false);
    expect(isSafeSameOriginUrlOrPath("https://evil.com/x", ORIGIN)).toBe(false);
    expect(isSafeSameOriginUrlOrPath("http://nihplod.cn/x", ORIGIN)).toBe(false);
    expect(isSafeSameOriginUrlOrPath("javascript:alert(1)", ORIGIN)).toBe(false);
    expect(isSafeSameOriginUrlOrPath("data:text/html,<script>alert(1)</script>", ORIGIN)).toBe(
      false
    );
  });

  it("原始百分号编码不二次解码：/%5C 仍是同源字面路径；解码后的 /\\ 必须拒绝", () => {
    // WHATWG URL 不会对 path 做百分号解码，/%5C 不是跨站（调用方若先 decodeURIComponent，则必须走下一行判定）
    expect(isSafeSameOriginUrlOrPath("/%5Cevil.com", ORIGIN)).toBe(true);
    expect(isSafeSameOriginUrlOrPath(decodeURIComponent("/%5Cevil.com"), ORIGIN)).toBe(false);
  });

  it("带 userinfo 的同源 URL 拒绝", () => {
    expect(isSafeSameOriginUrlOrPath("https://user:pass@nihplod.cn/x", ORIGIN)).toBe(false);
  });

  it("空值与非 URL 字符串拒绝", () => {
    expect(isSafeSameOriginUrlOrPath("", ORIGIN)).toBe(false);
    expect(isSafeSameOriginUrlOrPath("not-a-url", ORIGIN)).toBe(false);
  });
});
