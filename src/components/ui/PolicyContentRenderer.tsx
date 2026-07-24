/** 在中英文/数字之间添加空格 */
export function formatText(text: string) {
  return text
    .replace(/([\u4e00-\u9fa5])([A-Za-z0-9])/g, "$1 $2")
    .replace(/([A-Za-z0-9])([\u4e00-\u9fa5])/g, "$1 $2");
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

  return (
    <>
      {lines.map((line, lIdx) => {
        const trimmed = line.trim();
        if (!trimmed) return null;

        // 跳过首个段落中的重复章节标题（已由外层 h2 渲染）
        if (isFirst && lIdx === 0 && isSectionHeading(trimmed)) {
          return null;
        }

        // 重要提示框
        if (showHighlights && isHighlight(trimmed)) {
          return (
            <div
              key={trimmed.substring(0, 32)}
              className="rounded-lg border border-brand-charcoal/10 bg-brand-charcoal/[0.03] p-4 text-[14px] leading-[1.8] text-brand-charcoal/90"
            >
              <strong className="font-bold text-brand-charcoal">重要提示：</strong>
              <span>{trimmed.replace("【重要提示】", "")}</span>
            </div>
          );
        }

        // 子编号标题 (4.1, 5.2 等)
        if (isSubNumberedHeading(trimmed)) {
          return (
            <h4
              key={trimmed.substring(0, 32)}
              className="mb-0 mt-8 font-sans text-[15px] font-normal tracking-[0.08em] text-brand-charcoal md:text-lg md:font-light md:tracking-[0.12em]"
            >
              {formatText(trimmed)}
            </h4>
          );
        }

        // 章节标题
        if (isSectionHeading(trimmed)) {
          return (
            <h3
              key={trimmed.substring(0, 32)}
              className="mb-2 mt-10 font-sans text-[17px] font-normal tracking-[0.1em] text-brand-charcoal md:text-xl md:font-light md:tracking-[0.15em]"
            >
              {formatText(trimmed)}
            </h3>
          );
        }

        // 子标题
        if (isSubHeading(trimmed)) {
          return (
            <h4
              key={trimmed.substring(0, 32)}
              className="mb-0 mt-8 font-sans text-[15px] font-normal tracking-[0.08em] text-brand-charcoal md:text-lg md:font-light md:tracking-[0.12em]"
            >
              {formatText(trimmed)}
            </h4>
          );
        }

        // 子列表项 ((1) (2) • -)
        if (
          /^[（(][0-9]+[）)]/.test(trimmed) ||
          trimmed.startsWith("•") ||
          /^\-[\s]/.test(trimmed)
        ) {
          return (
            <p key={trimmed.substring(0, 32)} className="text-[14px] leading-[1.8] text-brand-charcoal/90 md:text-sm md:leading-7 md:text-brand-charcoal/80">
              {formatText(trimmed)}
            </p>
          );
        }

        // 普通段落
        return (
          <p key={trimmed.substring(0, 32)} className="text-[14px] leading-[1.8] text-brand-charcoal/90 md:text-base md:leading-8 md:text-brand-charcoal/80">
            {formatText(trimmed)}
          </p>
        );
      })}
    </>
  );
}
