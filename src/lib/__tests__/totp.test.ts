import { describe, it, expect } from "vitest";
import {
  generateTOTPSecret,
  generateTOTPQRCodeUrl,
  verifyTOTP,
  generateTOTPCode,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
  encryptTOTPSecret,
  decryptTOTPSecret,
} from "@/lib/totp";

describe("totp", () => {
  it("应能生成有效的 TOTP secret", () => {
    const secret = generateTOTPSecret();
    expect(secret).toBeDefined();
    expect(secret.length).toBeGreaterThan(0);
  });

  it("应能生成 otpauth URL", () => {
    const secret = generateTOTPSecret();
    const url = generateTOTPQRCodeUrl("test@example.com", secret, "TestApp");
    expect(url).toContain("otpauth://totp/");
    expect(url).toContain(secret);
  });

  it("应能生成并验证 TOTP code", () => {
    const secret = generateTOTPSecret();
    const token = generateTOTPCode(secret);
    expect(token).toHaveLength(6);
    expect(verifyTOTP(token, secret)).toBe(true);
  });

  it("应拒绝错误的 TOTP code", () => {
    const secret = generateTOTPSecret();
    expect(verifyTOTP("000000", secret)).toBe(false);
  });

  it("备用码应能正确验证并使用一次后失效", () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(10);

    const hashedCodes = codes.map(hashBackupCode);
    const codeToUse = codes[0];

    const result = verifyBackupCode(codeToUse, JSON.stringify(hashedCodes));
    expect(result).not.toBeNull();
    expect(result?.valid).toBe(true);
    expect(result?.remainingCodes).toHaveLength(9);

    // 再次使用应失效
    expect(verifyBackupCode(codeToUse, JSON.stringify(result?.remainingCodes))).toBeNull();
  });

  it("应能加密和解密 TOTP secret", () => {
    const secret = generateTOTPSecret();
    const encrypted = encryptTOTPSecret(secret);
    expect(encrypted).not.toBe(secret);

    const decrypted = decryptTOTPSecret(encrypted);
    expect(decrypted).toBe(secret);
  });
});
