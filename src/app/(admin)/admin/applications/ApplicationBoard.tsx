"use client";

import { useCallback, useEffect, useState } from "react";
import { GripVertical, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPatch, ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { deferInEffect } from "@/hooks/deferInEffect";

const STAGE_LABELS: Record<string, string> = {
  pending: "待处理",
  reviewed: "初筛通过",
  interview_scheduled: "待面试",
  interviewed: "已面试",
  offer: "Offer",
  hired: "已录用",
  rejected: "已拒绝",
  withdrawn: "已放弃",
};

interface BoardCard {
  id: string;
  name: string;
  phone: string;
  status: string;
  rating: number | null;
  tags: string[];
  updatedAt: string;
  job: { id: string; title: string };
  folder: { id: string; name: string } | null;
  nextInterviewAt: string | null;
  nextInterviewMode: string | null;
}

interface BoardColumn {
  status: string;
  count: number;
  items: BoardCard[];
}

export function ApplicationBoard({
  filters,
  canWrite,
  onOpen,
  reloadKey,
}: {
  filters: Record<string, string | undefined>;
  canWrite: boolean;
  onOpen: (id: string) => void;
  reloadKey: number;
}) {
  const toast = useToast();
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const filterKey = JSON.stringify(filters);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ columns: BoardColumn[] }>("/api/admin/applications/board", {
        ...filters,
      });
      setColumns(data.columns);
      setError(false);
    } catch {
      setError(true);
      toast.error("加载招聘看板失败");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, toast]);

  useEffect(() => {
    deferInEffect(load);
  }, [load, reloadKey]);

  const moveCard = async (card: BoardCard, targetStatus: string) => {
    if (!canWrite || card.status === targetStatus || movingId) return;
    setMovingId(card.id);
    try {
      await apiPatch(`/api/admin/applications/${card.id}`, {
        status: targetStatus,
        expectedStatus: card.status,
        expectedUpdatedAt: card.updatedAt,
      });
      toast.success(`已移动到「${STAGE_LABELS[targetStatus] ?? targetStatus}」`);
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.code === "STATUS_CONFLICT"
          ? "候选人状态已被其他管理员更新，已刷新看板"
          : err instanceof Error
            ? err.message
            : "移动失败"
      );
      await load();
    } finally {
      setMovingId(null);
      setDraggingId(null);
    }
  };

  if (loading && columns.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-brand-charcoal/65">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载招聘看板...
      </div>
    );
  }
  if (error && columns.length === 0) {
    return (
      <div className="rounded-2xl border border-brand-charcoal/10 bg-white py-12 text-center">
        <p className="text-sm text-red-500">招聘看板加载失败</p>
        <button
          type="button"
          className="mt-3 text-xs text-brand-primary hover:underline"
          onClick={() => void load()}
        >
          重新加载
        </button>
      </div>
    );
  }

  return (
    <div className="scrollbar-hide -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      {columns.map((column) => (
        <section
          key={column.status}
          className="flex w-72 shrink-0 snap-start flex-col rounded-2xl border border-brand-charcoal/10 bg-brand-charcoal/[0.015]"
          onDragOver={(event) => {
            if (canWrite) event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            const cardId = event.dataTransfer.getData("text/plain");
            const card = columns
              .flatMap((item) => item.items)
              .find((item) => item.id === cardId);
            if (card) void moveCard(card, column.status);
          }}
        >
          <header className="flex items-center justify-between gap-2 border-b border-brand-charcoal/10 px-3 py-2.5">
            <h3 className="text-sm font-semibold text-brand-charcoal">
              {STAGE_LABELS[column.status] ?? column.status}
            </h3>
            <span className="rounded-full bg-brand-charcoal/[0.06] px-2 py-0.5 text-xs tabular-nums text-brand-charcoal/65">
              {column.count}
            </span>
          </header>
          <div className="flex flex-1 flex-col gap-2 p-2">
            {column.items.length === 0 ? (
              <p className="py-6 text-center text-xs text-brand-charcoal/65">暂无候选人</p>
            ) : (
              column.items.map((card) => (
                <article
                  key={card.id}
                  draggable={canWrite && movingId !== card.id}
                  onDragStart={(event) => {
                    setDraggingId(card.id);
                    event.dataTransfer.setData("text/plain", card.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => setDraggingId(null)}
                  className={`rounded-xl border bg-white p-3 shadow-sm transition-opacity ${
                    draggingId === card.id ? "opacity-50" : ""
                  } ${movingId === card.id ? "pointer-events-none opacity-60" : ""} border-brand-charcoal/10`}
                >
                  <div className="flex items-start gap-2">
                    {canWrite && (
                      <GripVertical
                        className="mt-0.5 h-4 w-4 shrink-0 cursor-grab text-brand-charcoal/35"
                        aria-hidden="true"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => onOpen(card.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-brand-charcoal">
                          {card.name}
                        </span>
                        {card.rating ? (
                          <span className="text-xs text-amber-600" aria-label={`${card.rating} 星`}>
                            {"★".repeat(card.rating)}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-brand-charcoal/65">
                        {card.job.title}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-brand-charcoal/65">
                        {card.phone}
                      </p>
                      {card.tags.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {card.tags.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-[10px]">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {card.nextInterviewAt && (
                        <p className="mt-1.5 text-[11px] text-brand-primary">
                          面试 {formatDateTime(card.nextInterviewAt)}
                        </p>
                      )}
                      <p className="mt-1 text-[10px] text-brand-charcoal/65">
                        更新 {formatDateTime(card.updatedAt)}
                      </p>
                    </button>
                  </div>
                </article>
              ))
            )}
            {column.count > column.items.length && (
              <p className="pb-1 text-center text-[11px] text-brand-charcoal/65">
                仅显示前 {column.items.length} 条，请在列表中查看全部
              </p>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
