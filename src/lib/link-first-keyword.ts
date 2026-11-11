/**
 * 在富文本 HTML 中，将关键词的首次出现包装为链接。
 * - 仅处理文本节点，不会包进已有的 <a> 内（避免嵌套链接）
 * - 关键词跨标签（如被 <strong> 切开）时不处理，保持原样
 * 输入需已经过 sanitizeHtml 消毒；href 应为站内路径或可信地址。
 */
export function linkFirstKeyword(html: string, keyword: string, href: string): string {
  if (!html || !keyword || !html.includes(keyword)) return html;

  let anchorDepth = 0;
  let linked = false;

  return html
    .split(/(<[^>]+>)/g)
    .map((part) => {
      if (part.startsWith("<")) {
        if (/^<a\b/i.test(part)) anchorDepth += 1;
        else if (/^<\/a\s*>/i.test(part)) anchorDepth = Math.max(0, anchorDepth - 1);
        return part;
      }
      if (linked || anchorDepth > 0 || !part.includes(keyword)) return part;
      linked = true;
      return part.replace(keyword, `<a href="${href}">${keyword}</a>`);
    })
    .join("");
}
