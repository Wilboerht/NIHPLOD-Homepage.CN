import Link from "next/link";

/**
 * 404 页面
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-cream px-4">
      <div className="text-center">
        <h1 className="font-serif text-9xl text-brand-gold">404</h1>
        <h2 className="mt-4 font-serif text-2xl text-brand-charcoal">页面未找到</h2>
        <p className="mt-2 text-brand-charcoal/60">抱歉，您访问的页面不存在或已被移除。</p>
        <Link
          href="/"
          className="mt-8 inline-block rounded bg-brand-gold px-6 py-3 text-white transition hover:bg-brand-gold/90"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}
