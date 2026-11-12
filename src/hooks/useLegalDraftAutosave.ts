"use client";

import { useEffect, useRef } from "react";
import { writeLegalLocalDraft } from "@/lib/legal-local-draft";
import type { LegalDocumentContent, LegalDocumentSlug } from "@/types/legal";

interface UseLegalDraftAutosaveInput {
  slug: LegalDocumentSlug;
  content: LegalDocumentContent | null;
  isDirty: boolean;
  enabled: boolean;
}

const AUTOSAVE_DELAY_MS = 600;

/**
 * 将未保存的法务文档内容写入 localStorage。
 *
 * - 编辑停止 600ms 后落盘；
 * - 页面隐藏/关闭时同步 flush，避免 debounce 窗口内丢失；
 * - 仅用于本地兜底，不取代「保存草稿」。
 */
export function useLegalDraftAutosave({
  slug,
  content,
  isDirty,
  enabled,
}: UseLegalDraftAutosaveInput): void {
  const latestRef = useRef({ content, isDirty, enabled });

  useEffect(() => {
    latestRef.current = { content, isDirty, enabled };
  }, [content, isDirty, enabled]);

  useEffect(() => {
    if (!enabled || !isDirty || !content) return;
    const timer = window.setTimeout(() => {
      writeLegalLocalDraft(slug, content);
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [content, enabled, isDirty, slug]);

  useEffect(() => {
    if (!enabled) return;

    const flush = () => {
      const latest = latestRef.current;
      if (latest.enabled && latest.isDirty && latest.content) {
        writeLegalLocalDraft(slug, latest.content);
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };

    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, slug]);

  // 站内跳转导致组件卸载时，也把最新修改写入本地，避免 debounce 被取消。
  useEffect(() => {
    return () => {
      const latest = latestRef.current;
      if (latest.enabled && latest.isDirty && latest.content) {
        writeLegalLocalDraft(slug, latest.content);
      }
    };
  }, [slug]);
}
