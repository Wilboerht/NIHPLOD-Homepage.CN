import type { Metadata } from "next";
import { TermsArticle } from "@/components/ui/TermsArticle";
import { getPublishedLegalDocument } from "@/lib/legal-document-content";

/**
 * 服务条款嵌入页（/terms/embed）
 * 供子站（如 smart.nihplod.cn）在模态框中以 iframe 嵌入展示。
 * 位于 (website) 路由组之外，与 /account/embed 同理，天然无全局 chrome
 * （无 StandaloneNav/目录/页脚）；正文与 /terms 页面共用 TermsArticle
 * 及同一份已发布内容，保持完全一致。
 * CSP frame-ancestors 白名单见 src/proxy.ts（EMBED_ALLOWED_ORIGINS）。
 */

// 与 /terms 页面保持一致：动态读取数据库已发布内容
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "服务条款",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function TermsEmbedPage() {
  const content = await getPublishedLegalDocument("terms");

  return (
    <div className="min-h-dvh bg-[#fefcf8] px-6 py-8 md:px-10 md:py-12">
      <TermsArticle content={content} />
    </div>
  );
}
