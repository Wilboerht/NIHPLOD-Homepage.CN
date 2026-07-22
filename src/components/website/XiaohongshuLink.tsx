interface XiaohongshuLinkProps {
  categoryName: string;
  className?: string;
}

/**
 * 小红书搜索链接
 * 统一使用 Web 搜索 URL：移动端浏览器打开后小红书会自行引导调起 App，
 * 避免根据窗口宽度误判设备、以及自定义 scheme 调起失败无兜底的问题。
 */
export function XiaohongshuLink({ categoryName, className }: XiaohongshuLinkProps) {
  const keyword = `NIHPLOD ${categoryName}`;
  const webUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}`;

  return (
    <div className={className ?? "flex flex-col gap-1"}>
      <a
        href={webUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group inline-flex h-7 min-h-0 min-w-0 items-center gap-1 text-xs font-light leading-[1.8] tracking-[0.12em] text-brand-primary !transition-opacity hover:opacity-70"
      >
        <span>去小红书了解更多</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3 w-3 transition-transform group-hover:translate-x-1"
        >
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      </a>
    </div>
  );
}
