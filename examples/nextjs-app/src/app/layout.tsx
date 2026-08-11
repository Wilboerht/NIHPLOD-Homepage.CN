import type { ReactNode } from "react";

export const metadata = {
  title: "Next.js SSO 接入示例",
  description: "NIHPLOD SSO 接入示例 — Next.js App Router（Middleware 方式）",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
