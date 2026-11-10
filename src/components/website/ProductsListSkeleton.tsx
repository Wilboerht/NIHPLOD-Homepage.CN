"use client";

import { Skeleton } from "@/components/ui/Skeleton";

interface ProductsListSkeletonProps {
  mobileView: "products" | "categories";
}

export function ProductsListSkeleton({ mobileView }: ProductsListSkeletonProps) {
  return (
    <div
      data-testid="products-list-skeleton"
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="h-full min-h-0 overflow-hidden"
    >
      <span className="sr-only">正在加载产品列表…</span>

      <div
        aria-hidden="true"
        className="flex h-full flex-col overflow-hidden bg-brand-cream lg:hidden"
      >
        <div className="flex shrink-0 items-center justify-center gap-3 px-6 pt-4">
          <Skeleton animation="breathe" className="h-9 w-28 rounded-full bg-brand-beige/50" />
          <Skeleton animation="breathe" className="h-9 w-28 rounded-full bg-brand-beige/50" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6">
          <div className="mb-8 flex flex-col items-center pt-7">
            <Skeleton animation="breathe" className="h-5 w-28 bg-brand-beige/50" />
            <div className="mt-2 h-px w-[70px] bg-brand-primary/20" />
          </div>

          {mobileView === "products" ? (
            <div className="flex flex-col gap-5">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="border border-brand-charcoal/[0.06] bg-brand-warm-white"
                >
                  <Skeleton
                    animation="breathe"
                    className="aspect-[4/5] w-full rounded-none bg-brand-beige/50"
                  />
                  <div className="px-5 pb-5 pt-4">
                    <Skeleton animation="breathe" className="h-4 w-3/4 bg-brand-beige/50" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3 px-3 py-4">
                  <Skeleton animation="breathe" className="h-8 w-8 rounded-lg bg-brand-beige/50" />
                  <Skeleton animation="breathe" className="h-4 w-2/3 bg-brand-beige/50" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        aria-hidden="true"
        className="mx-auto hidden h-full w-full max-w-[1920px] flex-col overflow-hidden lg:flex"
      >
        <div className="flex-1 overflow-hidden px-16 pb-6 pt-4 xl:px-[12%]">
          <div className="flex h-full flex-col">
            <div className="flex flex-1 flex-col justify-center">
              <Skeleton animation="breathe" className="mb-6 h-7 w-32 bg-brand-beige/50" />
              <div className="grid min-h-0 grid-cols-3 gap-8">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className={index === 1 ? "mt-12" : undefined}>
                    <Skeleton
                      animation="breathe"
                      className={
                        index === 1
                          ? "aspect-[4/5.2] w-full bg-brand-beige/50"
                          : "aspect-[4/4.5] w-full bg-brand-beige/50"
                      }
                    />
                    <Skeleton animation="breathe" className="mt-3 h-4 w-2/3 bg-brand-beige/50" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
