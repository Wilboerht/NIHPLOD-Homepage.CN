/**
 * SVG 安全工具
 * 对 SVG 字符串进行净化，防止 XSS 攻击
 */

/**
 * 净化 SVG 字符串
 * - 使用 DOMParser 解析并验证 SVG 结构
 * - 移除 script、foreignObject、style 等危险标签
 * - 移除所有事件处理器属性 (onerror, onload 等)
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

  // 使用 DOMParser 进行结构化解析和净化
  if (typeof window !== "undefined") {
    const parser = new DOMParser();
    const doc = parser.parseFromString(cleaned, "image/svg+xml");
    const svgEl = doc.querySelector("svg");

    // 如果解析失败或不是有效的 SVG，返回空字符串
    if (!svgEl || doc.querySelector("parsererror")) {
      return "";
    }

    // 移除所有危险标签
    const dangerousTags = ["script", "foreignObject", "style", "iframe", "object", "embed"];
    dangerousTags.forEach((tag) => {
      svgEl.querySelectorAll(tag).forEach((el) => el.remove());
    });

    // 移除所有事件处理器属性
    const allElements = svgEl.querySelectorAll("*");
    allElements.forEach((el) => {
      const attrs = Array.from(el.attributes);
      attrs.forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on") || /^xmlns?:/.test(name)) {
          el.removeAttribute(attr.name);
        }
        if (name === "href" || name === "xlink:href") {
          const value = attr.value.trim().toLowerCase();
          if (value.startsWith("javascript:") || value.startsWith("data:")) {
            el.removeAttribute(attr.name);
          }
        }
      });
    });

    cleaned = svgEl.outerHTML;
  } else {
    // SSR 环境下回退到正则净化
    cleaned = cleaned
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/<foreignObject[\s\S]*?>[\s\S]*?<\/foreignObject>/gi, "")
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
      .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "")
      .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href=""')
      .replace(/xlink:href\s*=\s*["']javascript:[^"']*["']/gi, 'xlink:href=""')
      .replace(/\s+eval\s*\(/gi, "");
  }

  return cleaned;
}
