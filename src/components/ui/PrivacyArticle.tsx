import type { ReactNode } from "react";
import { PolicyDocument } from "@/components/ui/PolicyDocument";
import type { LegalDocumentContent } from "@/types/legal";

interface PrivacyArticleProps {
  content: LegalDocumentContent;
  /** 文档头部下方的补充内容（如 Cookie 偏好入口） */
  afterHeader?: ReactNode;
}

/**
 * 隐私政策正文（公开页与嵌入页共用）
 */
export function PrivacyArticle({ content, afterHeader }: PrivacyArticleProps) {
  return (
    <main className="w-full max-w-3xl flex-1 break-words font-sans text-brand-charcoal/80">
      <PolicyDocument content={content} afterHeader={afterHeader} />
    </main>
  );
}
