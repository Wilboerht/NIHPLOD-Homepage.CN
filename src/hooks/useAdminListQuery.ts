"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGet, getApiErrorMessage } from "@/lib/api-client";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useLatestRequest } from "@/hooks/useLatestRequest";

interface UseAdminListQueryOptions {
  path: string;
  params: Record<string, string | number | undefined>;
  enabled?: boolean;
  /** 查询失败回调；错误文案同时通过 error 返回，便于内联展示。 */
  onError?: (message: string) => void;
}

/**
 * 管理端列表统一数据层：请求去重、竞态保护、abort、loading/error 四态。
 * 页面只负责维护筛选参数与渲染，不再各自实现 fetch/useEffect/错误分支。
 */
export function useAdminListQuery<T>({
  path,
  params,
  enabled = true,
  onError,
}: UseAdminListQueryOptions) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const takeLatest = useLatestRequest();
  const abortRef = useRef<AbortController | null>(null);
  const onErrorRef = useRef(onError);
  const paramsKey = JSON.stringify(params);
  // 参数对象通常由页面内联创建；按序列化结果稳定引用，避免每次渲染重新请求。
  const stableParams = useMemo(
    () => JSON.parse(paramsKey) as Record<string, string | number | undefined>,
    [paramsKey]
  );

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const refresh = useCallback(async () => {
    const isLatest = takeLatest();
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const result = await apiGet<T>(path, stableParams, { signal: controller.signal });
      if (!isLatest()) return;
      setData(result);
    } catch (err) {
      if (!isLatest() || controller.signal.aborted) return;
      const message = getApiErrorMessage(err, "加载失败，请稍后重试");
      setError(message);
      onErrorRef.current?.(message);
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [path, stableParams, takeLatest]);

  useEffect(() => {
    if (!enabled) return;
    deferInEffect(refresh);
    return () => abortRef.current?.abort();
  }, [enabled, refresh]);

  return { data, loading: enabled ? loading : false, error, refresh, setData };
}
