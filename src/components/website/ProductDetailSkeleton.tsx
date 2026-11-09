"use client";

import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

const TEXT_WIDTHS = ["w-full", "w-11/12", "w-full", "w-10/12"];

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
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Skeleton animation="wave" className="h-3 w-8 bg-brand-beige/50" />
          <Skeleton animation="wave" variant="circular" className="h-2 w-2 bg-brand-beige/50" />
          <Skeleton animation="wave" className="h-3 w-14 bg-brand-beige/50" />
          <Skeleton animation="wave" variant="circular" className="h-2 w-2 bg-brand-beige/50" />
          <Skeleton animation="wave" className="h-3 w-24 bg-brand-beige/50" />
        </div>

        <div className="lg:grid lg:grid-cols-[4fr_6fr] lg:gap-12 xl:gap-16">
          <div className="lg:sticky lg:top-2 lg:self-start">
            <div className="w-full lg:max-w-lg lg:pt-[3px]">
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
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <Skeleton animation="wave" className="h-3 w-16 bg-brand-beige/50" />
                    <Skeleton animation="wave" className="h-3 w-12 bg-brand-beige/50" />
                    <Skeleton animation="wave" className="h-3 w-20 bg-brand-beige/50" />
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Skeleton
                    animation="wave"
                    variant="circular"
                    className="h-9 w-9 bg-brand-beige/50 md:h-11 md:w-11"
                  />
                  <Skeleton
                    animation="wave"
                    variant="circular"
                    className="h-9 w-9 bg-brand-beige/50 md:h-11 md:w-11"
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {["w-16", "w-20", "w-14"].map((width, index) => (
                  <Skeleton
                    key={index}
                    animation="wave"
                    className={cn("h-6 rounded-full bg-brand-beige/50", width)}
                  />
                ))}
              </div>

              <Skeleton animation="wave" className="mt-4 h-8 w-28 bg-brand-beige/50" />

              <div className="mt-6 rounded-2xl border border-brand-charcoal/[0.06] bg-[#FFFDF9] p-4 md:p-5 lg:p-6">
                <div className="flex items-center gap-6 border-b border-brand-beige pb-3">
                  {["w-14", "w-14", "w-14"].map((width, index) => (
                    <Skeleton
                      key={index}
                      animation="wave"
                      className={cn("h-4 bg-brand-beige/50", width)}
                    />
                  ))}
                </div>
                <div className="mt-5 space-y-2.5">
                  {TEXT_WIDTHS.map((width, index) => (
                    <Skeleton
                      key={index}
                      animation="wave"
                      className={cn("h-3.5 bg-brand-beige/50", width)}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-6 flex items-center gap-4">
                {Array.from({ length: 4 }).map((_, index) => (
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
