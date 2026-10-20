/**
 * 审计日志详情 PII 脱敏
 *
 * 对不具备 audit:sensitive:read 的查看者，在服务端递归脱敏后再返回/导出。
 * 除结构化字段外，还对自由文本中的手机号、邮箱、证件号做模式脱敏。
 */
import { maskPhone, maskAddress, maskIdentifier } from "./mask-phone";

const PHONE_KEYS = new Set([
  "phone",
  "newPhone",
  "oldPhone",
  "mobile",
  "userPhone",
  "contactPhone",
  "recipientPhone",
  "reviewerPhone",
]);
const ADDRESS_KEYS = new Set(["address", "detailAddress"]);
const BIRTHDAY_KEYS = new Set(["birthday", "birthdayBefore", "birthdayAfter"]);
const EMAIL_KEYS = new Set(["email", "adminEmail", "userEmail", "actorEmail", "contactEmail"]);
const IDENTIFIER_KEYS = new Set([
  "recipient",
  "wechatOpenId",
  "wechatUnionId",
  "openid",
  "unionId",
  "subjectId",
]);

function maskEmail(value: string): string {
  const at = value.indexOf("@");
  if (at <= 0) return maskIdentifier(value) ?? "****";
  return `${value.slice(0, Math.min(2, at))}***${value.slice(at)}`;
}

/** 对自由文本做 PII 模式脱敏（手机号、邮箱、18 位身份证号） */
export function maskAuditText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (email) => maskEmail(email))
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, (phone) => maskPhone(phone))
    .replace(/(?<!\d)\d{17}[\dXx](?!\d)/g, "**************");
}

export function maskAuditDetail(detail: unknown): unknown {
  if (detail === null || detail === undefined) return detail;
  if (Array.isArray(detail)) return detail.map((item) => maskAuditDetail(item));
  if (typeof detail !== "object") {
    return typeof detail === "string" ? maskAuditText(detail) : detail;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail as Record<string, unknown>)) {
    if (typeof value === "string") {
      if (PHONE_KEYS.has(key)) result[key] = value ? maskPhone(value) : value;
      else if (ADDRESS_KEYS.has(key)) result[key] = maskAddress(value);
      else if (BIRTHDAY_KEYS.has(key)) result[key] = value ? "****-**-**" : value;
      else if (EMAIL_KEYS.has(key)) result[key] = value ? maskEmail(value) : value;
      else if (IDENTIFIER_KEYS.has(key)) result[key] = maskIdentifier(value);
      else result[key] = maskAuditText(value);
    } else {
      result[key] = maskAuditDetail(value);
    }
  }
  return result;
}
