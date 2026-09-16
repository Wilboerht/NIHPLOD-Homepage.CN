"use client";

/**
 * 全局错误页
 * - ChunkLoadError（部署后旧页面引用的路由 chunk 已被替换/清除而 404）：
 *   自动整页刷新一次自愈，用户无感拿到新版本；30 秒冷却防止刷新循环
 * - 其它错误：展示提示，由用户手动重试
 */
import { useEffect } from "react";
import { logger } from "@/lib/logger";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

const CHUNK_RELOAD_KEY = "nihplod_chunk_reload_at";
const CHUNK_RELOAD_COOLDOWN_MS = 30_000;

function isChunkLoadError(error: Error): boolean {
  return (
    error.name === "ChunkLoadError" ||
    /Loading chunk [\w-]+ failed/i.test(error.message) ||
    /Failed to fetch dynamically imported module/i.test(error.message)
  );
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    logger.error("Application error", {
      error,
      digest: error.digest,
      component: "ErrorPage",
    });

    // 部署/静态产物更新导致的 chunk 404：整页刷新一次即可加载新版本
    if (isChunkLoadError(error)) {
      try {
        const lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || "0");
        if (Date.now() - lastReload > CHUNK_RELOAD_COOLDOWN_MS) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
          window.location.reload();
        }
      } catch {
        // sessionStorage 不可用（隐私模式等）：不自动刷新，避免刷新循环
      }
    }
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-xl font-medium text-brand-charcoal">出现了一些问题</h1>
      <p className="text-sm text-brand-charcoal/60">抱歉，页面加载时发生了错误，请稍后再试。</p>
      {process.env.NODE_ENV === "development" && error.message && (
        <p className="max-w-md rounded-lg border border-brand-charcoal/10 bg-brand-charcoal/5 px-4 py-3 font-mono text-xs text-brand-charcoal/60">
          {error.message}
        </p>
      )}
      <button
        onClick={() => reset()}
        className="rounded-full bg-brand-charcoal px-6 py-2.5 text-sm text-white hover:opacity-90"
      >
        重试
      </button>
    </div>
  );
}
