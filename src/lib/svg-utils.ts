/**
 * SVG 安全工具
 * 对 SVG 字符串进行净化，防止 XSS 攻击
 */

/**
 * 净化 SVG 字符串
 * - 移除 XML 声明、DOCTYPE、注释
 * - 移除 <script> 标签
 * - 移除所有事件处理器属性 (onerror, onload 等)
 * - 移除 javascript: 伪协议
 * - 移除 <foreignObject> 和 <style> 标签
 */
export function sanitizeSvg(svg: string | null | undefined): string {
  if (!svg) return "";

  const cleaned = svg
    // 移除 XML 声明
    .replace(/<\?xml[^>]*\?>/gi, "")
    // 移除 DOCTYPE
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    // 移除注释
    .replace(/<!--[\s\S]*?-->/g, "")
    // 移除 script 标签及其内容
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    // 移除所有事件处理器属性 (onerror, onload, onclick 等)
    .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "")
    // 移除 javascript: 伪协议
    .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href=""')
    // 移除 xlink:href 中的 javascript:
    .replace(/xlink:href\s*=\s*["']javascript:[^"']*["']/gi, 'xlink:href=""')
    // 移除 foreignObject（可能嵌入 HTML）
    .replace(/<foreignObject[\s\S]*?>[\s\S]*?<\/foreignObject>/gi, "")
    // 移除 style 标签（防止 CSS 表达式攻击）
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    // 移除 eval 相关的属性
    .replace(/\s+eval\s*\(/gi, "")
    .trim();

  return cleaned;
}
