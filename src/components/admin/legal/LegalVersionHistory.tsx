"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { History, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPost, getApiErrorMessage } from "@/lib/api-client";
import { deferInEffect } from "@/hooks/deferInEffect";
import { LegalVersionDiff } from "./LegalVersionDiff";
import type {
  LegalAdminDocumentDetail,
  LegalDocumentContent,
  LegalDocumentSlug,
  LegalVersionDetail,
  LegalVersionSummary,
} from "@/types/legal";

interface LegalVersionHistoryProps {
  open: boolean;
  onClose: () => void;
  slug: LegalDocumentSlug;
  currentContent: LegalDocumentContent;
  revision: number;
  readOnly: boolean;
  onRestored: (document: LegalAdminDocumentDetail) => void;
}

interface DiffState {
  baseContent: LegalDocumentContent;
  targetContent: LegalDocumentContent;
  baseLabel: string;
  targetLabel: string;
  baseMeta: LegalVersionDetail | null;
  targetMeta: LegalVersionDetail | null;
}

interface ResolvedSelection {
  content: LegalDocumentContent;
  label: string;
  meta: LegalVersionDetail | null;
}

export function LegalVersionHistory({
  open,
  onClose,
  slug,
  currentContent,
  revision,
  readOnly,
  onRestored,
}: LegalVersionHistoryProps) {
  const toast = useToast();
  const [versions, setVersions] = useState<LegalVersionSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [diffState, setDiffState] = useState<DiffState | null>(null);
  const [diffLoadingId, setDiffLoadingId] = useState<string | null>(null);
  const [baseSelection, setBaseSelection] = useState("current");
  const [targetSelection, setTargetSelection] = useState("");
  const [comparing, setComparing] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<LegalVersionSummary | null>(null);
  const [restoring, setRestoring] = useState(false);
  const versionCacheRef = useRef(new Map<string, LegalVersionDetail>());

  const fetchVersions = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiGet<{
        versions: LegalVersionSummary[];
        nextCursor: number | null;
      }>(`/api/admin/legal/${slug}/versions`, { limit: 20 });
      setVersions(data.versions);
      setNextCursor(data.nextCursor);
      setTargetSelection((previous) =>
        previous === "current" || data.versions.some((version) => version.id === previous)
          ? previous
          : (data.versions[0]?.id ?? "")
      );
    } catch (error) {
      setLoadError(getApiErrorMessage(error, "加载历史版本失败"));
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (!open) return;
    deferInEffect(fetchVersions);
  }, [fetchVersions, open]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await apiGet<{
        versions: LegalVersionSummary[];
        nextCursor: number | null;
      }>(`/api/admin/legal/${slug}/versions`, { limit: 20, cursor: nextCursor });
      setVersions((previous) => [...previous, ...data.versions]);
      setNextCursor(data.nextCursor);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "加载更多版本失败"));
    } finally {
      setLoadingMore(false);
    }
  };

  const getVersionDetail = async (versionId: string): Promise<LegalVersionDetail> => {
    const cached = versionCacheRef.current.get(versionId);
    if (cached) return cached;
    const detail = await apiGet<LegalVersionDetail>(
      `/api/admin/legal/${slug}/versions/${versionId}`
    );
    versionCacheRef.current.set(versionId, detail);
    return detail;
  };

  const resolveSelection = async (selection: string): Promise<ResolvedSelection> => {
    if (selection === "current") {
      return { content: currentContent, label: "当前编辑内容", meta: null };
    }
    const detail = await getVersionDetail(selection);
    return { content: detail.content, label: `v${detail.version}`, meta: detail };
  };

  const openDiff = async (version: LegalVersionSummary) => {
    setDiffLoadingId(version.id);
    try {
      const detail = await getVersionDetail(version.id);
      setDiffState({
        baseContent: detail.content,
        targetContent: currentContent,
        baseLabel: `v${detail.version}`,
        targetLabel: "当前编辑内容",
        baseMeta: detail,
        targetMeta: null,
      });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "加载版本内容失败"));
    } finally {
      setDiffLoadingId(null);
    }
  };

  const handleCompare = async () => {
    if (!baseSelection || !targetSelection || baseSelection === targetSelection) return;
    setComparing(true);
    try {
      const [base, target] = await Promise.all([
        resolveSelection(baseSelection),
        resolveSelection(targetSelection),
      ]);
      setDiffState({
        baseContent: base.content,
        targetContent: target.content,
        baseLabel: base.label,
        targetLabel: target.label,
        baseMeta: base.meta,
        targetMeta: target.meta,
      });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "加载对比内容失败"));
    } finally {
      setComparing(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      const document = await apiPost<LegalAdminDocumentDetail>(`/api/admin/legal/${slug}/restore`, {
        versionId: restoreTarget.id,
        expectedRevision: revision,
      });
      onRestored(document);
      setRestoreTarget(null);
      toast.success(`已恢复 v${restoreTarget.version} 为草稿，请确认后重新发布`);
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "恢复历史版本失败"));
    } finally {
      setRestoring(false);
    }
  };

  const selectionOptions = [
    { value: "current", label: "当前编辑内容" },
    ...versions.map((version) => ({
      value: version.id,
      label: `v${version.version}${version.isCurrentPublished ? "（当前线上）" : ""}`,
    })),
  ];
  const compareDisabled =
    comparing ||
    !baseSelection ||
    !targetSelection ||
    baseSelection === targetSelection ||
    versions.length === 0;

  return (
    <>
      <Modal open={open} onClose={onClose} title="版本历史" size="lg">
        <div className="space-y-4">
          <p className="text-xs text-brand-charcoal/50">
            版本永久保留。恢复旧版只会写入草稿，不会直接修改线上内容。
          </p>

          {versions.length > 0 ? (
            <div className="rounded-xl border border-brand-charcoal/10 bg-brand-charcoal/[0.02] p-3">
              <p className="text-xs font-medium text-brand-charcoal/70">对比任意两个版本</p>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="text-[11px] text-brand-charcoal/55">
                  基准
                  <select
                    value={baseSelection}
                    onChange={(event) => setBaseSelection(event.target.value)}
                    className="mt-1 block h-9 min-w-[9rem] rounded-lg border border-brand-charcoal/20 bg-white px-2 text-xs text-brand-charcoal focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                  >
                    {selectionOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[11px] text-brand-charcoal/55">
                  对比
                  <select
                    value={targetSelection}
                    onChange={(event) => setTargetSelection(event.target.value)}
                    className="mt-1 block h-9 min-w-[9rem] rounded-lg border border-brand-charcoal/20 bg-white px-2 text-xs text-brand-charcoal focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                  >
                    {selectionOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Button size="sm" onClick={() => void handleCompare()} disabled={compareDisabled}>
                  {comparing ? "加载中..." : "对比"}
                </Button>
              </div>
            </div>
          ) : null}

          {loading ? (
            <div className="flex items-center justify-center py-10 text-brand-charcoal/50">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载中...
            </div>
          ) : loadError ? (
            <div className="space-y-3 py-6 text-center">
              <p className="text-sm text-red-500">{loadError}</p>
              <Button variant="outline" size="sm" onClick={() => void fetchVersions()}>
                重试
              </Button>
            </div>
          ) : versions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-brand-charcoal/55">
              <History className="h-8 w-8 text-brand-charcoal/25" aria-hidden="true" />
              <p className="text-sm">还没有发布记录</p>
              <p className="text-xs">首次发布会自动生成 v1。</p>
            </div>
          ) : (
            <div className="space-y-2">
              {versions.map((version) => (
                <div
                  key={version.id}
                  className="rounded-xl border border-brand-charcoal/10 bg-white p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-brand-charcoal">
                      v{version.version}
                    </span>
                    {version.isCurrentPublished ? (
                      <Badge variant="success" size="sm">
                        当前线上
                      </Badge>
                    ) : null}
                    <span className="text-xs text-brand-charcoal/50">
                      {new Date(version.createdAt).toLocaleString("zh-CN")}
                    </span>
                    <span className="text-xs text-brand-charcoal/50">
                      {version.createdBy ?? "系统导入"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-brand-charcoal/55">
                    {version.sectionCount} 个章节
                    {version.note ? ` · ${version.note}` : ""}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void openDiff(version)}
                      disabled={diffLoadingId === version.id}
                    >
                      {diffLoadingId === version.id ? "加载中..." : "查看对比"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRestoreTarget(version)}
                      disabled={readOnly || version.isCurrentPublished}
                      title={
                        version.isCurrentPublished ? "当前线上版本，无需恢复为草稿" : undefined
                      }
                    >
                      恢复为草稿
                    </Button>
                  </div>
                </div>
              ))}

              {nextCursor ? (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                  >
                    {loadingMore ? "加载中..." : "加载更多"}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </Modal>

      <LegalVersionDiff
        open={Boolean(diffState)}
        onClose={() => setDiffState(null)}
        baseContent={diffState?.baseContent ?? null}
        targetContent={diffState?.targetContent ?? null}
        baseLabel={diffState?.baseLabel ?? ""}
        targetLabel={diffState?.targetLabel ?? ""}
        baseMeta={diffState?.baseMeta ?? null}
        targetMeta={diffState?.targetMeta ?? null}
      />

      <ConfirmDialog
        open={Boolean(restoreTarget)}
        onClose={() => setRestoreTarget(null)}
        onConfirm={handleRestore}
        title={`恢复 v${restoreTarget?.version ?? ""} 为草稿？`}
        description="当前草稿会被覆盖（不会影响线上内容）。恢复后需要重新发布才会生效。"
        confirmText="恢复为草稿"
        loading={restoring}
      />
    </>
  );
}
