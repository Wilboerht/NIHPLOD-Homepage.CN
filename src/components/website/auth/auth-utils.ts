import { ApiError } from "@/lib/api-client";

/** 密码强度规则（与后端 lib/password.ts 保持一致，客户端内联避免打包 bcryptjs） */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 32;

export function validatePasswordStrength(password: string): { valid: boolean; message?: string } {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, message: `密码至少${PASSWORD_MIN_LENGTH}位` };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return { valid: false, message: `密码最多${PASSWORD_MAX_LENGTH}位` };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: "密码需包含大写字母" };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: "密码需包含小写字母" };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: "密码需包含数字" };
  }
  return { valid: true };
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  return fallback;
}
