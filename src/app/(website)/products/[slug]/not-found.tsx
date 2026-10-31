import Link from "next/link";

/**
 * 产品详情 404
 * 与根级 404 分开，确保 /products/[slug] 的 notFound() 在 ProductsShell 内
 * 渲染品牌化内容，并输出可被爬虫读取的 H1。
 */
export default function ProductNotFound() {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center">
      <p className="font-serif text-[64px] font-light leading-none text-brand-primary/20">404</p>
      <h1 className="mt-4 font-serif text-2xl text-brand-charcoal md:text-3xl">产品未找到</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-brand-charcoal/60">
        该产品可能已下架、链接已失效，或地址输入有误。
        <br />
        你可以返回产品系列继续浏览。
      </p>
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        <Link
          href="/products"
          className="rounded-full bg-brand-primary px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          返回产品系列
        </Link>
        <Link
          href="/"
          className="rounded-full border border-brand-charcoal/20 px-6 py-2.5 text-sm font-medium text-brand-charcoal transition-colors hover:border-brand-charcoal hover:bg-brand-charcoal hover:text-white"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}
