import { PolicyDocument } from "@/components/ui/PolicyDocument";
import type { LegalDocumentContent } from "@/types/legal";

interface PrivacyArticleProps {
  content: LegalDocumentContent;
}

/**
 * 隐私政策正文（公开页与嵌入页共用）
 */
export function PrivacyArticle({ content }: PrivacyArticleProps) {
  return (
    <main className="w-full max-w-3xl flex-1 break-words font-sans text-brand-charcoal/80">
      <PolicyDocument content={content} />
    </main>
  );
}
