/**
 * auth-utils 测试：密码强度前后端一致性 + 登录失败剩余次数提示
 */
import { describe, it, expect } from "vitest";
import {
  isWeakPassword,
  validatePasswordStrength,
  getErrorMessage,
} from "@/components/website/auth/auth-utils";
import { ApiError } from "@/lib/api-client";

describe("isWeakPassword / validatePasswordStrength（与后端同口径）", () => {
  it("拒绝常见弱密码", () => {
    expect(isWeakPassword("password1")).toBe(true);
    expect(validatePasswordStrength("Password1").valid).toBe(false);
  });

  it("拒绝连续数字/字母", () => {
    expect(isWeakPassword("Abcdef12")).toBe(true);
    expect(validatePasswordStrength("123456Aa").valid).toBe(false);
  });

  it("拒绝全相同字符", () => {
    expect(isWeakPassword("Aaaa1111")).toBe(false); // 非全相同，属于正常密码
    expect(isWeakPassword("aaaaaaaaaaaaaaaa")).toBe(true);
  });

  it("接受符合规则的强密码", () => {
    expect(validatePasswordStrength("Nihplod2026X").valid).toBe(true);
  });

  it("长度上限与后端一致（32 位）", () => {
    expect(validatePasswordStrength("Aa1" + "x".repeat(29)).valid).toBe(true); // 32 位
    expect(validatePasswordStrength("Aa1" + "x".repeat(30)).valid).toBe(false); // 33 位
  });
});

describe("getErrorMessage 剩余次数提示", () => {
  it("LOGIN_FAILED + remainingAttempts 时追加提示", () => {
    const err = new ApiError("LOGIN_FAILED", "登录失败，请检查手机号和密码", 400, {
      remainingAttempts: 2,
    });
    expect(getErrorMessage(err, "兜底")).toBe("登录失败，请检查手机号和密码（还可尝试 2 次）");
  });

  it("无 remainingAttempts 时保持原样", () => {
    const err = new ApiError("LOGIN_FAILED", "登录失败，请检查手机号和密码", 400);
    expect(getErrorMessage(err, "兜底")).toBe("登录失败，请检查手机号和密码");
  });

  it("非 ApiError 使用兜底文案", () => {
    expect(getErrorMessage(new Error("boom"), "兜底")).toBe("兜底");
  });
});
