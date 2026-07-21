"use client";

import { useEffect, useState } from "react";

interface XiaohongshuLinkProps {
  categoryName: string;
  className?: string;
}

export function XiaohongshuLink({ categoryName, className }: XiaohongshuLinkProps) {
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  useEffect(() => {
    setIsMobileDevice(window.innerWidth <= 768);
  }, []);

  const keyword = `NIHPLOD ${categoryName}`;
  const encodedKeyword = encodeURIComponent(keyword);
  const webUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodedKeyword}`;
  const schemeUrl = `xhsdiscover://search/result?keyword=${encodedKeyword}`;

  return (
    <div className={className ?? "flex flex-col gap-1"}>
      <a
        href={isMobileDevice ? schemeUrl : webUrl}
        target={isMobileDevice ? undefined : "_blank"}
        rel="noopener noreferrer"
        className="group inline-flex h-7 min-h-0 min-w-0 items-center gap-1 text-[12px] font-normal text-[#00263E] !transition-opacity hover:opacity-70"
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
