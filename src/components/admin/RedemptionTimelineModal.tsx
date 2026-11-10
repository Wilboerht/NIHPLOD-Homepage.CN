"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { apiGet } from "@/lib/api-client";
import { formatDateTimeSeconds } from "@/lib/format";
import { receiptImageSrc } from "@/lib/spent-adjustment-meta";
import { deferInEffect } from "@/hooks/deferInEffect";

interface TimelineEvent {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  actorType: string;
  reasonCode: string | null;
  reasonText: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface RedemptionTimeline {
  id: string;
  productName: string;
  priceYuan: string | number;
  points: number;
  status: string;
  recipient: string | null;
  phone: string | null;
  address: string | null;
  waybillNo: string | null;
  afterSalesImages: string[];
  createdAt: string;
  events: TimelineEvent[];
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "待履约",
  FULFILLED: "已发货",
  COMPLETED: "已完成",
  AFTER_SALES_REQUESTED: "售后待审核",
  AFTER_SALES_APPROVED: "售后待寄回",
  AFTER_SALES_REJECTED: "售后已驳回",
  RETURNING: "退货中",
  RETURNED: "待退款",
  REFUNDED: "已退款",
  AFTER_SALES_CLOSED: "售后已关闭",
  CANCELLED: "已取消",
};

function eventLabel(event: TimelineEvent): string {
  if (event.reasonCode === "waybill_updated") return "运单信息更新";
  return STATUS_LABELS[event.toStatus] ?? event.toStatus;
}

export function RedemptionTimelineModal({
  redemptionId,
  onClose,
}: {
  redemptionId: string | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<RedemptionTimeline | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!redemptionId) return;
    setLoading(true);
    setError(false);
    try {
      const result = await apiGet<RedemptionTimeline>(
        `/api/admin/point-redemptions/${redemptionId}`
      );
      setData(result);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [redemptionId]);

  useEffect(() => {
    deferInEffect(() => {
      setData(null);
      setError(false);
      void load();
    });
  }, [load]);

  return (
    <Modal
      open={Boolean(redemptionId)}
      onClose={onClose}
      title="兑换详情与处理时间线"
      size="lg"
      footer={
        <Button variant="outline" onClick={onClose}>
          关闭
        </Button>
      }
    >
      {loading ? (
        <p className="py-8 text-center text-sm text-brand-charcoal/65">正在加载兑换详情...</p>
      ) : error ? (
        <div className="py-6 text-center">
          <p className="text-sm text-red-600">兑换详情加载失败</p>
          <Button className="mt-3" variant="outline" onClick={() => void load()}>
            重试
          </Button>
        </div>
      ) : data ? (
        <div className="space-y-5">
          <div className="rounded-lg bg-brand-charcoal/[0.03] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-brand-charcoal">{data.productName}</p>
              <Badge>{STATUS_LABELS[data.status] ?? data.status}</Badge>
            </div>
            <p className="mt-2 text-sm text-brand-charcoal/70">
              ¥{Number(data.priceYuan).toLocaleString()} · {data.points.toLocaleString()} 积分
            </p>
            <p className="mt-1 break-all text-xs text-brand-charcoal/60">兑换单号：{data.id}</p>
            <p className="mt-1 text-xs text-brand-charcoal/60">
              创建时间：{formatDateTimeSeconds(data.createdAt)}
            </p>
            {(data.recipient || data.phone || data.address) && (
              <p className="mt-2 text-xs text-brand-charcoal/65">
                收货信息：{[data.recipient, data.phone, data.address].filter(Boolean).join(" · ")}
              </p>
            )}
            {data.waybillNo && (
              <p className="mt-1 text-xs text-brand-charcoal/65">运单号：{data.waybillNo}</p>
            )}
          </div>

          {data.afterSalesImages.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-brand-charcoal">售后凭证</h3>
              <div className="flex flex-wrap gap-2">
                {data.afterSalesImages.map((image, index) => (
                  <a
                    key={image}
                    href={receiptImageSrc(image, "admin")}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={receiptImageSrc(image, "admin")}
                      alt={`售后凭证 ${index + 1}`}
                      className="h-24 w-24 rounded-lg border border-brand-charcoal/15 object-cover"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="mb-3 text-sm font-medium text-brand-charcoal">处理时间线</h3>
            {data.events.length === 0 ? (
              <p className="text-xs text-brand-charcoal/60">
                暂无历史事件（可能为功能上线前的历史单）
              </p>
            ) : (
              <ol className="space-y-3">
                {data.events.map((event) => (
                  <li key={event.id} className="border-l-2 border-brand-charcoal/15 pl-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-brand-charcoal">{eventLabel(event)}</span>
                      <time className="text-xs text-brand-charcoal/55">
                        {formatDateTimeSeconds(event.createdAt)}
                      </time>
                    </div>
                    <p className="mt-0.5 text-xs text-brand-charcoal/60">
                      操作方：{event.actorType}
                      {event.reasonCode ? ` · ${event.reasonCode}` : ""}
                    </p>
                    {event.reasonText && (
                      <p className="mt-1 whitespace-pre-wrap text-xs text-brand-charcoal/70">
                        {event.reasonText}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
