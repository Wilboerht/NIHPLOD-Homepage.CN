/**
 * 富文本 HTML 服务端消毒
 * 用于管理员提交 description、requirements 等 HTML 字段入库前净化
 */
import DOMPurify from "isomorphic-dompurify";

// 仅保留基本格式标签
const ALLOWED_TAGS = [
  "p",
  "br",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "u",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "a",
];

// a 标签只允许 href
const ALLOWED_ATTR = ["href"];

// 仅允许 http/https/mailto/tel 协议以及相对路径/锚点
const ALLOWED_URI_REGEXP = /^(?:(?:(?:f|ht)tps?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

/**
 * 消毒 HTML 字符串
 * - 仅保留基本格式标签
 * - 禁用 script/style/iframe/object/embed 等危险标签
 * - 禁用所有事件处理器属性
 * - a 标签 href 仅允许 http/https/mailto/tel，禁止 javascript:/data:/vbscript:
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return "";

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_ATTR: [
      "style",
      "class",
      "id",
      "onclick",
      "onload",
      "onerror",
      "onmouseover",
      "onfocus",
      "onstart",
      "onabort",
      "onactivate",
      "onafterprint",
      "onafterscriptexecute",
      "onbeforeactivate",
      "onbeforecopy",
      "onbeforecut",
      "onbeforedeactivate",
      "onbeforepaste",
      "onbeforeprint",
      "onbeforescriptexecute",
      "onbeforeunload",
      "onblur",
      "onbounce",
      "oncanplay",
      "oncanplaythrough",
      "onchange",
      "oncontextmenu",
      "oncopy",
      "oncuechange",
      "oncut",
      "ondblclick",
      "ondeactivate",
      "ondrag",
      "ondragend",
      "ondragenter",
      "ondragleave",
      "ondragover",
      "ondragstart",
      "ondrop",
      "ondurationchange",
      "onemptied",
      "onended",
      "onformchange",
      "onforminput",
      "onhashchange",
      "oninput",
      "oninvalid",
      "onkeydown",
      "onkeypress",
      "onkeyup",
      "onlanguagechange",
      "onmessage",
      "onmousedown",
      "onmouseenter",
      "onmouseleave",
      "onmousemove",
      "onmouseout",
      "onmouseup",
      "onmousewheel",
      "onoffline",
      "ononline",
      "onpageshow",
      "onpaste",
      "onpause",
      "onplay",
      "onplaying",
      "onpopstate",
      "onprogress",
      "onratechange",
      "onreadystatechange",
      "onreset",
      "onresize",
      "onscroll",
      "onsearch",
      "onseeked",
      "onseeking",
      "onselect",
      "onselectionchange",
      "onselectstart",
      "onshow",
      "onstalled",
      "onstorage",
      "onsubmit",
      "onsuspend",
      "ontimeupdate",
      "ontoggle",
      "ontransitioncancel",
      "ontransitionend",
      "ontransitionrun",
      "ontransitionstart",
      "onunload",
      "onvolumechange",
      "onwaiting",
      "onwebkitanimationend",
      "onwebkitanimationiteration",
      "onwebkitanimationstart",
      "onwebkittransitionend",
      "onwheel",
    ],
    ALLOWED_URI_REGEXP,
    KEEP_CONTENT: true,
  });
}

/**
 * 富文本 HTML → 纯文本（保留段落与列表结构）
 *
 * 供纯文本消费方使用（如微信小程序的 <view> 渲染，不支持 HTML 标签）。
 * 输入已由 sanitizeHtml 消毒（标签集受限：p/br/ul/ol/li/strong/em/u/h/a），
 * 此处按结构转换：块级闭合与 <br> → 换行；<li> → "• " 项目符号；
 * <a> 保留链接文字丢弃地址；并解码常见 HTML 实体、压缩多余空白。
 */
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return "";

  let text = html;
  // 链接保留文字（丢弃地址；[\s\S] 兼容多行内容，避免依赖 dotAll 标志）
  text = text.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1");
  // 列表项前缀
  text = text.replace(/<li\b[^>]*>/gi, "• ");
  // 块级闭合 → 换行
  text = text.replace(/<\/(p|div|h[1-6]|li|ul|ol|blockquote|tr|table)>/gi, "\n");
  // <br> → 换行
  text = text.replace(/<br\b[^>]*\/?>/gi, "\n");
  // 其余标签整体移除
  text = text.replace(/<[^>]*>/g, "");
  // 解码常见实体（&amp; 最后处理，避免二次解码）
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&");

  // 逐行规范化空白并折叠连续空行
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
