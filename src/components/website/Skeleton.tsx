"use client";

import { cn } from "@/lib/utils";

/**
 * 基础骨架屏组件
 */
interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-brand-beige/60",
        className
      )}
    />
  );
}

/**
 * 产品卡片骨架屏
 */
export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-brand-beige bg-white">
      {/* 图片区域 */}
      <Skeleton className="aspect-square w-full" />
      {/* 内容区域 */}
      <div className="p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="mt-2 h-3 w-1/2" />
        <Skeleton className="mt-3 h-5 w-1/3" />
      </div>
    </div>
  );
}

/**
 * 产品网格骨架屏
 */
interface ProductGridSkeletonProps {
  count?: number;
}

export function ProductGridSkeleton({ count = 6 }: ProductGridSkeletonProps) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * 产品详情骨架屏
 */
export function ProductDetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* 图片区域 */}
      <Skeleton className="aspect-square w-full rounded-xl" />
      
      {/* 缩略图 */}
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-16 rounded-lg" />
        ))}
      </div>

      {/* 产品信息 */}
      <div className="space-y-4">
        <Skeleton className="h-6 w-1/4" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-5 w-1/3" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      </div>

      {/* 描述 */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>

      {/* 按钮 */}
      <Skeleton className="h-12 w-full rounded-full" />
    </div>
  );
}

/**
 * 文章/内容卡片骨架屏
 */
export function ContentCardSkeleton() {
  return (
    <div className="rounded-xl border border-brand-beige bg-white p-5">
      <div className="flex items-start gap-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}

/**
 * 列表项骨架屏
 */
export function ListItemSkeleton() {
  return (
    <div className="flex items-center gap-4 border-b border-brand-beige py-4">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-8 w-20 rounded-md" />
    </div>
  );
}

/**
 * 列表骨架屏
 */
interface ListSkeletonProps {
  count?: number;
}

export function ListSkeleton({ count = 5 }: ListSkeletonProps) {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <ListItemSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * 页面标题骨架屏
 */
export function PageHeaderSkeleton() {
  return (
    <div className="mb-8 text-center">
      <Skeleton className="mx-auto h-4 w-24" />
      <Skeleton className="mx-auto mt-2 h-8 w-48" />
      <Skeleton className="mx-auto mt-4 h-4 w-72" />
    </div>
  );
}

/**
 * 职位卡片骨架屏
 */
export function JobCardSkeleton() {
  return (
    <div className="rounded-xl border border-brand-beige bg-white p-5">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-12 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
      <Skeleton className="mt-4 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-3/4" />
    </div>
  );
}

/**
 * 表单骨架屏
 */
export function FormSkeleton() {
  return (
    <div className="space-y-6">
      {/* 输入框 */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ))}
      {/* 文本域 */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
      {/* 提交按钮 */}
      <Skeleton className="h-12 w-full rounded-full" />
    </div>
  );
}

/**
 * 时间线骨架屏
 */
export function TimelineSkeleton() {
  return (
    <div className="relative space-y-6 pl-8">
      <div className="absolute left-3 top-0 h-full w-0.5 bg-brand-beige" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="relative">
          <Skeleton className="absolute -left-5 top-1 h-4 w-4 rounded-full" />
          <div className="rounded-xl border border-brand-beige bg-white p-4">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="mt-2 h-4 w-24" />
            <Skeleton className="mt-2 h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

