import type { Metadata } from "next";
import { TermsArticle, buildTermsSections } from "@/components/ui/TermsArticle";
import { defaultTermsContent } from "@/lib/terms-default-content";

/**
 * 服务条款嵌入页（/terms/embed）
 * 供子站（如 advisor.nihplod.cn）在模态框中以 iframe 嵌入展示。
 * 位于 (website) 路由组之外，与 /account/embed 同理，天然无全局 chrome
 * （无 StandaloneNav/目录/页脚）；正文与 /terms 页面共用 TermsArticle
 * 及同一内容来源 defaultTermsContent，保持完全一致。
 * CSP frame-ancestors 白名单见 src/middleware.ts（EMBED_ALLOWED_ORIGINS）。
 */

// ISR: 与 /terms 页面保持一致，每天重新验证一次
export const revalidate = 86400; // 24小时

export const metadata: Metadata = {
  title: "服务条款",
  robots: {
    index: false,
    follow: false,
  },
};

export default function TermsEmbedPage() {
  const sections = buildTermsSections(defaultTermsContent.tabs?.general?.content || []);

  return (
    <div className="min-h-dvh bg-[#fefcf8] px-6 py-8 md:px-10 md:py-12">
      <TermsArticle sections={sections} />
    </div>
  );
}
