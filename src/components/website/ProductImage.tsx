"use client";

import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import Image, { type ImageProps } from "next/image";
import { cn } from "@/lib/utils";

interface ProductImageProps extends Omit<ImageProps, "onLoad" | "onError"> {
  onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void;
  onError?: (event: SyntheticEvent<HTMLImageElement>) => void;
  skeletonClassName?: string;
}

export function ProductImage({
  className,
  skeletonClassName,
  onLoad,
  onError,
  src,
  ...props
}: ProductImageProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;

    if (image.complete) {
      setLoaded(true);
      setFailed(image.naturalWidth === 0);
      return;
    }

    setLoaded(false);
    setFailed(false);
  }, [src]);

  const handleLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    setLoaded(true);
    setFailed(false);
    onLoad?.(event);
  };

  const handleError = (event: SyntheticEvent<HTMLImageElement>) => {
    setLoaded(true);
    setFailed(true);
    onError?.(event);
  };

  const showSkeleton = !loaded || failed;

  return (
    <>
      {showSkeleton && (
        <div
          data-testid="product-image-skeleton"
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 bg-brand-beige/40 motion-reduce:animate-none",
            failed ? "bg-brand-beige/50" : "shimmer-skeleton animate-shimmer",
            skeletonClassName
          )}
        />
      )}
      <Image
        {...props}
        ref={imageRef}
        src={src}
        className={cn(className, failed && "opacity-0")}
        onLoad={handleLoad}
        onError={handleError}
      />
    </>
  );
}
