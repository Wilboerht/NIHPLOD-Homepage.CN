import type { ReactNode } from "react";

/** 在中英文/数字之间添加空格 */
export function formatText(text: string) {
  return text
    .replace(/([一-龥])([A-Za-z0-9])/g, "$1 $2")
    .replace(/([A-Za-z0-9])([一-龥])/g, "$1 $2");
}

const INLINE_TOKEN_RE =
  /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const MD_LINK_RE = /^\[([^\]]+)\]\(([^)\s]+)\)$/;
const SAFE_HREF_RE = /^(https?:\/\/|mailto:|\/)/;
const TRAILING_PUNCTUATION_RE = /[，。；、）)\]】"]$/;
const ORDERED_ITEM_RE = /^[（(][0-9]+[）)]\s*/;
const UNORDERED_ITEM_RE = /^(?:•\s*|-\s+)/;
const HIGHLIGHT_PREFIX_RE = /^【重要提示】|^重要提示：/;

const linkClassName =
  "break-all text-brand-charcoal underline decoration-brand-charcoal/30 underline-offset-4 transition-colors hover:decoration-brand-charcoal/70";

/** 行内排版：支持 **粗体**、[文字](url) 及裸链接/邮箱自动链接 */
function renderTextWithLinks(text: string): ReactNode {
  return formatText(text)
    .split(INLINE_TOKEN_RE)
    .map((part, index) => {
      if (!part) return null;

      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={index} className="font-medium text-brand-charcoal">
            {part.slice(2, -2)}
          </strong>
        );
      }

      const mdLink = part.match(MD_LINK_RE);
      if (mdLink) {
        // 仅放行 http(s)/mailto/站内路径，其余（如 javascript:）按纯文本渲染
        if (!SAFE_HREF_RE.test(mdLink[2])) return part;
        const external = mdLink[2].startsWith("http");
        return (
          <a
            key={index}
            href={mdLink[2]}
            target={external ? "_blank" : undefined}
            rel={external ? "noopener noreferrer" : undefined}
            className={linkClassName}
          >
            {mdLink[1]}
          </a>
        );
      }

      if (!/^(https?:\/\/|[^@\s]+@[^@\s]+\.[^@\s]+$)/.test(part)) return part;

      let value = part;
      let trailing = "";
      while (TRAILING_PUNCTUATION_RE.test(value)) {
        trailing = `${value.slice(-1)}${trailing}`;
        value = value.slice(0, -1);
      }
      const href = value.includes("@") && !value.startsWith("http") ? `mailto:${value}` : value;
      const external = value.startsWith("http");
      return (
        <span key={`${value}-${index}`}>
          <a
            href={href}
            target={external ? "_blank" : undefined}
            rel={external ? "noopener noreferrer" : undefined}
            className={linkClassName}
          >
            {value}
          </a>
          {trailing}
        </span>
      );
    });
}

/** 判断是否为子编号标题 (4.1, 5.2 等) */
function isSubNumberedHeading(text: string): boolean {
  return /^\d+\.\d+\s/.test(text);
}

/** 判断是否为章节标题 (1. 2. 一、二、...)，要求编号后紧跟分隔符与空白，避免误伤「15 个工作日内」等正文 */
function isSectionHeading(text: string): boolean {
  return /^(?:[一二三四五六七八九十]+、|\d+[、.]\s)/.test(text);
}

/** 判断是否为子标题 ((一) (二) 等，仅中文数字) */
function isSubHeading(text: string): boolean {
  return /^[（(][一二三四五六七八九十]+[）)]/.test(text);
}

/** 判断是否为重要提示框 */
function isHighlight(text: string): boolean {
  return HIGHLIGHT_PREFIX_RE.test(text);
}

interface ContentParagraphProps {
  text: string;
  isFirst?: boolean;
  /** 是否启用重要提示高亮框，默认 false */
  showHighlights?: boolean;
}

export function ContentParagraph({
  text,
  isFirst = false,
  showHighlights = false,
}: ContentParagraphProps) {
  // 将「介绍： - 项目一 - 项目二」这类行内列表拆成独立行，便于后续按行解析
  const lines: string[] = [];
  text.split(/\r?\n/).forEach((line) => {
    const parts = line.split(/\s+-\s+/);
    if (parts.length > 1) {
      lines.push(parts[0]);
      parts.slice(1).forEach((part) => lines.push(`- ${part}`));
    } else {
      lines.push(line);
    }
  });

  const elements: ReactNode[] = [];
  let listItems: { text: string; index: number; ordered: boolean }[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    const ordered = listItems[0].ordered;
    const ListTag = ordered ? "ol" : "ul";
    elements.push(
      <ListTag
        key={`list-${listItems[0].index}`}
        className={ordered ? "policy-list" : "policy-list policy-list--unordered"}
      >
        {listItems.map((item) => (
          <li key={item.index}>{renderTextWithLinks(item.text)}</li>
        ))}
      </ListTag>
    );
    listItems = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }
    if (isFirst && index === 0 && isSectionHeading(trimmed)) return;

    const ordered = ORDERED_ITEM_RE.test(trimmed);
    const unordered = !ordered && UNORDERED_ITEM_RE.test(trimmed);
    if (ordered || unordered) {
      if (listItems.length > 0 && listItems[0].ordered !== ordered) flushList();
      // 剥离原始编号/符号，列表标记统一由 CSS list-style 生成，避免双重编号
      const itemText = trimmed.replace(ordered ? ORDERED_ITEM_RE : UNORDERED_ITEM_RE, "");
      listItems.push({ text: itemText, index, ordered });
      return;
    }
    flushList();

    if (showHighlights && isHighlight(trimmed)) {
      elements.push(
        <div
          key={index}
          className="rounded-lg border border-brand-charcoal/10 bg-brand-charcoal/[0.03] p-4 text-[15px] text-brand-charcoal/90"
        >
          <strong className="font-bold text-brand-charcoal">重要提示：</strong>
          <span>{renderTextWithLinks(trimmed.replace(HIGHLIGHT_PREFIX_RE, ""))}</span>
        </div>
      );
      return;
    }

    if (isSubNumberedHeading(trimmed)) {
      elements.push(
        <h4 key={index} className="policy-subheading">
          {formatText(trimmed)}
        </h4>
      );
      return;
    }

    if (isSectionHeading(trimmed)) {
      elements.push(
        <h3 key={index} className="policy-section-heading">
          {formatText(trimmed)}
        </h3>
      );
      return;
    }

    if (isSubHeading(trimmed)) {
      elements.push(
        <h4 key={index} className="policy-subheading">
          {formatText(trimmed)}
        </h4>
      );
      return;
    }

    elements.push(
      <p
        key={index}
        className="text-[15px] text-brand-charcoal/90 md:text-base md:text-brand-charcoal/90"
      >
        {renderTextWithLinks(trimmed)}
      </p>
    );
  });
  flushList();

  return <div className="policy-article-body">{elements}</div>;
}
