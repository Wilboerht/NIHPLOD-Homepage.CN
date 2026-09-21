import type { Metadata } from "next";
import { PrivacyArticle } from "@/components/ui/PrivacyArticle";

/**
 * 隐私政策嵌入页（/privacy/embed）
 * 供子站（如 advisor.nihplod.cn）在模态框中以 iframe 嵌入展示。
 * 位于 (website) 路由组之外，与 /account/embed 同理，天然无全局 chrome
 * （无 StandaloneNav/目录/页脚）；正文与 /privacy 页面共用 PrivacyArticle，
 * 内容与样式保持完全一致。内容由父窗口模态框内部滚动，无需 postMessage 高度上报。
 * CSP frame-ancestors 白名单见 src/middleware.ts（EMBED_ALLOWED_ORIGINS）。
 */

// ISR: 与 /privacy 页面保持一致，每天重新验证一次
export const revalidate = 86400; // 24小时

export const metadata: Metadata = {
  title: "隐私政策",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PrivacyEmbedPage() {
  return (
    <div className="min-h-dvh bg-[#fefcf8] px-6 py-8 md:px-10 md:py-12">
      <PrivacyArticle />
    </div>
  );
}
