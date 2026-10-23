/**
 * 审计日志详情脱敏
 *
 * - 留言正文、内部备注、候选人备注/简历文本属于高敏自由文本，对所有查看者
 *   一律隐藏（含 audit:sensitive:read），避免这些内容进入通用审计查询/导出。
 * - 对不具备 audit:sensitive:read 的查看者，再递归遮盖手机号、邮箱、地址、
 *   IP/UA 等 PII。两层处理相互独立，敏感权限不会让自由文本重新可见。
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
// 留言正文、内部备注、候选人备注/简历文本与简历路径：
// 对所有查看者整体隐藏，避免仅靠正则漏掉姓名、经历等非结构化 PII。
// 注意不要放通用的 fileName/filePath/message，否则会误伤导入文件名、错误信息等审计上下文。
const SENSITIVE_TEXT_KEYS = new Set([
  "notes",
  "content",
  "reply",
  "messageContent",
  "coverLetter",
  "selfIntroduction",
  "resumeText",
  "resumePath",
  "resumeFileName",
]);
const REDACTED_TEXT = "[已脱敏]";

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

/**
 * 对所有查看者隐藏审计中的高敏自由文本。
 * 历史数据可能仍包含 notes/content/reply/resumePath，需要在读取时强制剥离。
 */
export function redactSensitiveAuditDetail(detail: unknown): unknown {
  if (detail === null || detail === undefined) return detail;
  if (Array.isArray(detail)) return detail.map((item) => redactSensitiveAuditDetail(item));
  if (typeof detail !== "object") return detail;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail as Record<string, unknown>)) {
    if (SENSITIVE_TEXT_KEYS.has(key)) {
      if (typeof value === "string") result[key] = value ? REDACTED_TEXT : value;
      else result[key] = value === null || value === undefined ? value : REDACTED_TEXT;
    } else {
      result[key] = redactSensitiveAuditDetail(value);
    }
  }
  return result;
}

export function maskAuditDetail(detail: unknown): unknown {
  const safeDetail = redactSensitiveAuditDetail(detail);
  if (safeDetail === null || safeDetail === undefined) return safeDetail;
  if (Array.isArray(safeDetail)) return safeDetail.map((item) => maskAuditDetail(item));
  if (typeof safeDetail !== "object") {
    return typeof safeDetail === "string" ? maskAuditText(safeDetail) : safeDetail;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(safeDetail as Record<string, unknown>)) {
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
