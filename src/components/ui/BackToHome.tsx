"use client";

import Link from "next/link";

export function BackToHome() {
  return (
    <Link
      href="/"
      className="fixed right-6 md:right-8 bottom-8 z-50 flex items-center justify-center w-10 h-10 rounded-full bg-zinc-900/80 hover:bg-zinc-900 text-white shadow-lg backdrop-blur-sm transition-all hover:scale-105"
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
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </svg>
    </Link>
  );
}
