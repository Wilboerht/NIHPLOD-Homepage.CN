"use client";

import { Skeleton } from "@/components/ui/Skeleton";

export function ProductDetailSkeleton() {
  return (
    <div
      data-testid="product-detail-skeleton"
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="h-full min-h-0 overflow-y-auto overscroll-contain"
    >
      <span className="sr-only">正在加载产品详情…</span>
      <div
        aria-hidden="true"
        className="mx-auto w-full max-w-[1920px] px-6 pb-6 pt-6 lg:pl-[51px] lg:pr-10 xl:pl-[calc(8%_+_11px)] xl:pr-[8%]"
      >
        <Skeleton animation="wave" className="mb-5 hidden h-3 w-40 bg-brand-beige/50 lg:block" />

        <div className="lg:grid lg:grid-cols-[4fr_6fr] lg:gap-12 xl:gap-16">
          <div className="lg:sticky lg:top-6 lg:self-start">
            <div className="w-full lg:max-w-lg lg:pt-[3px] xl:max-w-xl">
              <div className="flex flex-col gap-4 lg:flex-row lg:gap-4">
                <div className="hidden flex-col gap-2 lg:flex">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton
                      key={index}
                      animation="wave"
                      className="h-20 w-16 rounded-lg bg-brand-beige/50"
                    />
                  ))}
                </div>
                <div className="lg:flex-1">
                  <Skeleton
                    animation="wave"
                    className="aspect-[3/4] w-full rounded-2xl bg-brand-beige/50"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-8 lg:min-w-0 lg:pt-0">
            <div className="mx-auto max-w-2xl lg:mx-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-3">
                  <Skeleton
                    animation="wave"
                    className="h-7 w-2/3 bg-brand-beige/50 sm:h-8 lg:h-9"
                  />
                  <Skeleton animation="wave" className="h-3 w-24 bg-brand-beige/50" />
                </div>
                <Skeleton
                  animation="wave"
                  variant="circular"
                  className="h-11 w-11 bg-brand-beige/50"
                />
              </div>

              <Skeleton animation="wave" className="mt-5 h-7 w-24 bg-brand-beige/50" />

              <div className="mt-7 rounded-2xl border border-brand-charcoal/[0.06] bg-brand-warm-white p-4 md:p-5 lg:p-6">
                <div className="flex items-center gap-6 border-b border-brand-beige pb-3">
                  {["w-14", "w-14", "w-14"].map((width, index) => (
                    <Skeleton
                      key={index}
                      animation="wave"
                      className={`h-4 ${width} bg-brand-beige/50`}
                    />
                  ))}
                </div>
                <div className="mt-5 space-y-3">
                  <Skeleton animation="wave" className="h-3.5 w-full bg-brand-beige/50" />
                  <Skeleton animation="wave" className="h-3.5 w-11/12 bg-brand-beige/50" />
                  <Skeleton animation="wave" className="h-3.5 w-4/5 bg-brand-beige/50" />
                </div>
              </div>

              <div className="mt-8 flex items-center gap-4">
                {Array.from({ length: 2 }).map((_, index) => (
                  <Skeleton
                    key={index}
                    animation="wave"
                    variant="circular"
                    className="h-10 w-10 bg-brand-beige/50"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
