import type { ReactNode } from "react";

/** 在中英文/数字之间添加空格 */
export function formatText(text: string) {
  return text
    .replace(/([\u4e00-\u9fa5])([A-Za-z0-9])/g, "$1 $2")
    .replace(/([A-Za-z0-9])([\u4e00-\u9fa5])/g, "$1 $2");
}

const LINK_RE = /(https?:\/\/[^\s]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const TRAILING_PUNCTUATION_RE = /[，。；、）)\]】"]$/;

function renderTextWithLinks(text: string): ReactNode {
  return formatText(text)
    .split(LINK_RE)
    .map((part, index) => {
      if (!part) return null;
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
            className="break-all text-brand-charcoal underline decoration-brand-charcoal/30 underline-offset-4 transition-colors hover:decoration-brand-charcoal/70"
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

/** 判断是否为章节标题 (1. 2. 一、二、...) */
function isSectionHeading(text: string): boolean {
  return /^[一二三四五六七八九十0-9]+[、.\s]/.test(text);
}

/** 判断是否为子标题 ((一) (二) 等，仅中文数字) */
function isSubHeading(text: string): boolean {
  return /^[（(][一二三四五六七八九十]+[）)]/.test(text);
}

/** 判断是否为重要提示框 */
function isHighlight(text: string): boolean {
  return text.startsWith("【重要提示】");
}

interface ContentParagraphProps {
  text: string;
  isFirst?: boolean;
  /** 是否启用【重要提示】高亮框，默认 false */
  showHighlights?: boolean;
}

export function ContentParagraph({
  text,
  isFirst = false,
  showHighlights = false,
}: ContentParagraphProps) {
  const lines = text.split(/\r?\n/);
  const elements: ReactNode[] = [];
  let listItems: { text: string; index: number }[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    elements.push(
      <ul key={`list-${listItems[0].index}`} className="policy-list">
        {listItems.map((item) => (
          <li key={item.index}>{renderTextWithLinks(item.text)}</li>
        ))}
      </ul>
    );
    listItems = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (isFirst && index === 0 && isSectionHeading(trimmed)) return;

    const isListItem =
      /^[（(][0-9]+[）)]/.test(trimmed) || trimmed.startsWith("•") || /^\-[\s]/.test(trimmed);
    if (isListItem) {
      listItems.push({ text: trimmed, index });
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
          <span>{renderTextWithLinks(trimmed.replace("【重要提示】", ""))}</span>
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
        className="text-[15px] text-brand-charcoal/90 md:text-base md:text-brand-charcoal/80"
      >
        {renderTextWithLinks(trimmed)}
      </p>
    );
  });
  flushList();

  return <div className="policy-article-body">{elements}</div>;
}
