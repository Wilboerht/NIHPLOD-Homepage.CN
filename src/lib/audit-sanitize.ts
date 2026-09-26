/**
 * 审计日志详情 PII 脱敏
 *
 * 审计 detail 中可能包含手机号、收货地址、外部身份标识等个人信息。
 * 对不具备 users:sensitive:read 权限的查看者，在服务端递归脱敏后再返回/导出。
 */
import { maskPhone, maskAddress, maskIdentifier } from "./mask-phone";

const PHONE_KEYS = new Set(["phone", "newPhone", "oldPhone", "mobile"]);
const ADDRESS_KEYS = new Set(["address", "detail"]);
const IDENTIFIER_KEYS = new Set([
  "recipient",
  "wechatOpenId",
  "wechatUnionId",
  "openid",
  "unionId",
  "subjectId",
]);

export function maskAuditDetail(detail: unknown): unknown {
  if (detail === null || detail === undefined) return detail;
  if (Array.isArray(detail)) return detail.map((item) => maskAuditDetail(item));
  if (typeof detail !== "object") return detail;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail as Record<string, unknown>)) {
    if (typeof value === "string") {
      if (PHONE_KEYS.has(key)) result[key] = value ? maskPhone(value) : value;
      else if (ADDRESS_KEYS.has(key)) result[key] = maskAddress(value);
      else if (IDENTIFIER_KEYS.has(key)) result[key] = maskIdentifier(value);
      else result[key] = value;
    } else {
      result[key] = maskAuditDetail(value);
    }
  }
  return result;
}
