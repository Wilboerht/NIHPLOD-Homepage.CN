import Link from "next/link";
import { PolicyDocument } from "@/components/ui/PolicyDocument";
import type { LegalDocumentContent } from "@/types/legal";

interface TermsArticleProps {
  content: LegalDocumentContent;
}

/** 服务条款正文（公开页与嵌入页共用） */
export function TermsArticle({ content }: TermsArticleProps) {
  return (
    <main className="w-full max-w-3xl flex-1 break-words font-sans text-brand-charcoal/80">
      <PolicyDocument
        content={content}
        afterFirstSection={
          <div className="mt-6 rounded-xl border border-brand-charcoal/10 bg-brand-charcoal/[0.03] p-4 md:p-5">
            <p className="text-[14px] leading-relaxed text-brand-charcoal/70">
              有关我们如何收集、使用和保护您的个人信息的详细说明，请参阅我们的{" "}
              <Link
                href="/privacy"
                className="font-light text-brand-charcoal underline decoration-brand-charcoal/20 underline-offset-4 transition-all hover:text-brand-charcoal hover:decoration-brand-charcoal/50"
              >
                隐私政策
              </Link>
              。
            </p>
          </div>
        }
      />
    </main>
  );
}
