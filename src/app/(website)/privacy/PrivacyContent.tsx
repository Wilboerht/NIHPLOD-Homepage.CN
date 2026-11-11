import ScrollSpySidebar from "@/components/ui/ScrollSpySidebar";
import { StandaloneNav } from "@/components/ui/StandaloneNav";
import { PrivacyArticle, privacySections } from "@/components/ui/PrivacyArticle";
import Link from "next/link";
import Image from "next/image";

export function PrivacyContent() {
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
        <div className="mx-auto grid w-full max-w-[90rem] gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,42rem)_minmax(0,1fr)] xl:gap-0">
          <div className="mx-auto flex w-full max-w-2xl flex-col xl:col-start-2 xl:mx-0 xl:max-w-none">
            <PrivacyArticle />
          </div>
          <ScrollSpySidebar sections={privacySections} label="隐私政策目录导航" />
        </div>
      </div>

      <footer className="mt-12 md:mt-24 md:border-t md:border-brand-charcoal/10">
        <div className="container mx-auto px-6 py-6 text-center md:px-8 md:py-10 lg:px-12 xl:px-16">
          <p className="text-xs font-light tracking-[0.08em] text-brand-charcoal/70 md:tracking-[0.12em]">
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
          </div>
        </div>
      </footer>
    </div>
  );
}
