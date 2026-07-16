"use client";

import Link from "next/link";

export function BackToHome() {
  return (
    <Link
      href="/"
      className="fixed right-6 md:right-8 bottom-8 z-50 flex items-center justify-center w-11 h-11 rounded-full bg-white/90 backdrop-blur-sm border border-[#00263E]/30 text-[#00263E]/60 hover:text-[#00263E] hover:border-[#00263E]/60 shadow-md hover:shadow-lg transition-all duration-200"
      aria-label="返回首页"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 12H5" />
        <path d="M12 19l-7-7 7-7" />
      </svg>
    </Link>
  );
}
