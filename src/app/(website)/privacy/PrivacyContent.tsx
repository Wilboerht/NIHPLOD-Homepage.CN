import { StandaloneNav } from "@/components/ui/StandaloneNav";
import { PrivacyArticle } from "@/components/ui/PrivacyArticle";
import { CookieSettingsButton } from "@/components/website/CookieSettingsButton";
import Link from "next/link";
import Image from "next/image";
import type { LegalDocumentContent } from "@/types/legal";

interface PrivacyContentProps {
  content: LegalDocumentContent;
}

export function PrivacyContent({ content }: PrivacyContentProps) {
  return (
    <div className="policy-page-shell mb-[-7rem] flex min-h-dvh animate-fade-in flex-col bg-[#fefcf8] pt-[100px] md:pt-32 lg:mb-[-6rem]">
      <StandaloneNav
        title="隐私政策"
        links={[
          { href: "/contact", label: "联系我们" },
          { href: "/terms", label: "服务条款" },
        ]}
      />

      <div className="policy-print-main flex-1 px-6 md:px-10">
        <div className="mx-auto flex w-full max-w-3xl flex-col">
          <PrivacyArticle
            content={content}
            afterHeader={
              <div className="mt-8 flex flex-col gap-3 rounded-2xl border border-brand-charcoal/10 bg-white/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-brand-charcoal">管理 Cookie 偏好</p>
                  <p className="mt-1 text-xs leading-5 text-brand-charcoal/60">
                    您可以随时选择仅使用必要 Cookie，或允许分析 Cookie。
                  </p>
                </div>
                <CookieSettingsButton className="shrink-0 self-start rounded-full border border-brand-charcoal/25 px-4 py-2 text-xs tracking-[0.08em] text-brand-charcoal transition-colors hover:bg-brand-charcoal/[0.04] sm:self-auto" />
              </div>
            }
          />
        </div>
      </div>

      <footer className="mt-12 md:mt-24 md:border-t md:border-brand-charcoal/10">
        <div className="container mx-auto px-6 py-6 text-center md:px-8 md:py-10 lg:px-12 xl:px-16">
          <p className="text-[11px] font-light tracking-[0.08em] text-brand-charcoal/70 md:text-xs md:tracking-[0.12em]">
            &copy; {new Date().getFullYear()} 旎柏（上海）商贸有限公司 版权所有
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs font-light text-brand-charcoal/70">
            <Link
              href="https://beian.miit.gov.cn/"
              target="_blank"
              className="transition-colors hover:text-brand-charcoal"
            >
              沪ICP备2026014764号-1
            </Link>
            <span className="text-brand-charcoal/30">|</span>
            <Link
              href="http://www.beian.gov.cn/portal/registerSystemInfo"
              target="_blank"
              className="inline-flex items-center gap-1 transition-colors hover:text-brand-charcoal"
            >
              <Image
                src="/images/beian.webp"
                alt="公安备案"
                width={12}
                height={12}
                className="opacity-60"
              />
              <span>沪公网安备31010702010178号</span>
            </Link>
            <span className="text-brand-charcoal/30">|</span>
            <CookieSettingsButton />
          </div>
        </div>
      </footer>
    </div>
  );
}
