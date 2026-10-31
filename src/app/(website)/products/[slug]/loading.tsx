export default function ProductDetailLoading() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-6 pb-6 pt-6 lg:px-10">
        <div className="mb-5 h-3 w-40 animate-pulse rounded bg-brand-beige/60" />
        <div className="lg:grid lg:grid-cols-[4fr_6fr] lg:gap-12 xl:gap-16">
          <div className="aspect-[3/4] w-full animate-pulse rounded-2xl bg-brand-beige/40 lg:max-w-lg" />
          <div className="space-y-4 pt-8 lg:pt-0">
            <div className="h-7 w-2/3 animate-pulse rounded bg-brand-beige/60" />
            <div className="h-3 w-36 animate-pulse rounded bg-brand-beige/50" />
            <div className="h-5 w-24 animate-pulse rounded bg-brand-beige/50" />
            <div className="flex gap-2 pt-2">
              <div className="h-7 w-20 animate-pulse rounded-full bg-brand-beige/50" />
              <div className="h-7 w-24 animate-pulse rounded-full bg-brand-beige/50" />
              <div className="h-7 w-16 animate-pulse rounded-full bg-brand-beige/50" />
            </div>
            <div className="mt-6 h-4 w-full animate-pulse rounded bg-brand-beige/40" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-brand-beige/40" />
            <div className="h-4 w-4/6 animate-pulse rounded bg-brand-beige/40" />
          </div>
        </div>
      </div>
    </div>
  );
}
