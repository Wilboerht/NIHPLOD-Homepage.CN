"use client";

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Chunk 加载错误边界
 * 当 Next.js 的 JS chunk 加载失败时（通常是部署后缓存不一致），
 * 自动刷新页面以加载最新版本
 */
export class ChunkErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    // 检测是否是 chunk 加载错误
    const isChunkLoadError =
      error.name === "ChunkLoadError" ||
      error.message.includes("Loading chunk") ||
      error.message.includes("Failed to fetch dynamically imported module");

    if (isChunkLoadError) {
      // 检查是否已经重试过（防止无限刷新）
      const lastReload = sessionStorage.getItem("chunk-error-reload");
      const now = Date.now();

      if (!lastReload || now - parseInt(lastReload) > 10000) {
        // 10秒内只刷新一次
        sessionStorage.setItem("chunk-error-reload", now.toString());
        // 强制刷新页面（跳过缓存）
        window.location.reload();
      }
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center bg-brand-cream p-8 text-center">
          <h2 className="text-brand-text mb-4 text-xl font-medium">页面加载出错</h2>
          <p className="text-brand-text/70 mb-6">请刷新页面重试，或清除浏览器缓存</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-full bg-brand-primary px-6 py-2 text-white transition-colors hover:bg-brand-primary/90"
          >
            刷新页面
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
