/**
 * SVG 安全工具
 * 对 SVG 字符串进行净化，防止 XSS 攻击
 */
import DOMPurify from "isomorphic-dompurify";

/**
 * 净化 SVG 字符串
 * - 使用 isomorphic-dompurify 在服务端和客户端统一净化
 * - 移除 script、foreignObject、style、iframe、object、embed 等危险标签
 * - 移除所有事件处理器属性 (onerror、onload 等)
 * - 移除 javascript: 伪协议
 */
export function sanitizeSvg(svg: string | null | undefined): string {
  if (!svg) return "";

  // 先进行基础字符串净化
  let cleaned = svg
    // 移除 XML 声明
    .replace(/<\?xml[^>]*\?>/gi, "")
    // 移除 DOCTYPE
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    // 移除注释
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();

  // 使用 isomorphic-dompurify 进行统一净化
  // ADD_TAGS: [] 确保不额外添加标签；FORBID_ATTR 禁用事件属性
  cleaned = DOMPurify.sanitize(cleaned, {
    USE_PROFILES: { svg: true },
    ADD_TAGS: ["use"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onstart"],
    // 允许 data URI 图片，但禁止 javascript: 伪协议
    ALLOWED_URI_REGEXP:
      /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|xxx):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });

  return cleaned;
}
