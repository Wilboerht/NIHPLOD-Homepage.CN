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
