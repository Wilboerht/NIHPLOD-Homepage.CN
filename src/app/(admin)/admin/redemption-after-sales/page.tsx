"use client";

/**
 * 兑换售后处理页
 * 审核售后、确认收到退货、执行退分、关闭售后。
 */
import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { formatDateTimeNumeric } from "@/lib/format";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";
import { DataTable, PageHeader, RequirePermission, type Column } from "@/components/admin";
import { ApprovalRequestAction } from "@/components/admin/ApprovalRequestAction";
import { RedemptionTimelineModal } from "@/components/admin/RedemptionTimelineModal";
import { APPROVAL_THRESHOLDS } from "@/lib/admin-approval-policy";

type Status =
  | "AFTER_SALES_REQUESTED"
  | "AFTER_SALES_APPROVED"
  | "RETURNING"
  | "RETURNED"
  | "AFTER_SALES_REJECTED"
  | "AFTER_SALES_CLOSED"
  | "REFUNDED";

interface Item {
  id: string;
  productName: string;
  points: number;
  status: Status;
  createdAt: string;
  afterSalesRequestedAt: string | null;
  afterSalesReason: string | null;
  afterSalesReviewNote: string | null;
  afterSalesApprovedAt: string | null;
  returnWaybillNo: string | null;
  returnCarrier: string | null;
  returnReceivedAt: string | null;
  refundedPoints: number;
  refundedAt: string | null;
  user: { id: string; phone: string; nickname: string | null; status: string };
}

interface ListData {
  redemptions: Item[];
  counts: Record<string, number>;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

type ActionKind = "approve" | "reject" | "receive" | "refund" | "close";

interface ActionState {
  kind: ActionKind;
  item: Item;
  note: string;
  restockApproved: boolean;
}

const ACTION_TITLES: Record<ActionKind, string> = {
  approve: "通过售后申请",
  reject: "驳回售后申请",
  receive: "确认收到退货",
  refund: "执行售后退分",
  close: "关闭售后",
};

const ACTION_CONFIRM_LABELS: Record<ActionKind, string> = {
  approve: "确认通过",
  reject: "确认驳回",
  receive: "确认收货",
  refund: "确认退款",
  close: "确认关闭",
};

const TABS: { key: Status; label: string }[] = [
  { key: "AFTER_SALES_REQUESTED", label: "待审核" },
  { key: "AFTER_SALES_APPROVED", label: "待寄回" },
  { key: "RETURNING", label: "退货中" },
  { key: "RETURNED", label: "待退款" },
  { key: "REFUNDED", label: "已退款" },
  { key: "AFTER_SALES_REJECTED", label: "已驳回" },
  { key: "AFTER_SALES_CLOSED", label: "已关闭" },
];

const STATUS_LABELS: Record<Status, string> = {
  AFTER_SALES_REQUESTED: "待审核",
  AFTER_SALES_APPROVED: "待寄回",
  RETURNING: "退货中",
  RETURNED: "待退款",
  AFTER_SALES_REJECTED: "已驳回",
  AFTER_SALES_CLOSED: "已关闭",
  REFUNDED: "已退款",
};

const columns: Column<Item>[] = [
  {
    key: "productName",
    title: "礼品 / 用户",
    width: "260px",
    render: (_, row) => (
      <div className="min-w-0">
        <p className="truncate font-medium text-brand-charcoal">{row.productName}</p>
        <p className="truncate text-xs text-brand-charcoal/60">
          {row.user.nickname ?? row.user.phone} · {row.user.id}
        </p>
      </div>
    ),
  },
  {
    key: "status",
    title: "状态",
    width: "100px",
    render: (_, row) => <Badge variant="warning">{STATUS_LABELS[row.status]}</Badge>,
  },
  {
    key: "points",
    title: "积分",
    width: "80px",
    align: "right",
    render: (_, row) => row.points,
  },
  {
    key: "afterSalesReason",
    title: "售后原因",
    width: "240px",
    render: (_, row) => (
      <span className="line-clamp-2 text-xs text-brand-charcoal/70">
        {row.afterSalesReason ?? row.afterSalesReviewNote ?? "-"}
      </span>
    ),
  },
  {
    key: "returnWaybillNo",
    title: "退回运单",
    width: "140px",
    render: (_, row) => <span className="font-mono text-xs">{row.returnWaybillNo ?? "-"}</span>,
  },
  {
    key: "createdAt",
    title: "申请时间",
    width: "150px",
    render: (_, row) => (
      <span className="text-xs text-brand-charcoal/65">
        {formatDateTimeNumeric(row.afterSalesRequestedAt ?? row.createdAt)}
      </span>
    ),
  },
];

function AfterSalesContent() {
  const toast = useToast();
  const { can, role } = useAdminPermissions();
  const canReview = can("redemptions:after-sales");
  const canRefund = can("redemptions:cancel");
  const canRequestApproval = can("approvals:request");
  const isOwner = role === "owner";
  const { requireTotp, totpModal } = useTotpConfirm();
  const [tab, setTab] = useState<Status>("AFTER_SALES_REQUESTED");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [action, setAction] = useState<ActionState | null>(null);
  const [submittingAction, setSubmittingAction] = useState(false);
  const [timelineId, setTimelineId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiGet<ListData>("/api/admin/point-redemptions", {
        page,
        pageSize: 20,
        status: tab,
      });
      setData(result);
    } catch {
      toast.error("加载售后列表失败");
    } finally {
      setLoading(false);
    }
  }, [page, tab, toast]);

  useEffect(() => {
    deferInEffect(load);
  }, [load]);

  const post = async (
    id: string,
    endpoint: "review" | "receive" | "refund" | "close",
    body: Record<string, unknown>
  ): Promise<boolean> => {
    setActingId(id);
    try {
      const run = () => apiPost(`/api/admin/point-redemptions/${id}/after-sales/${endpoint}`, body);
      try {
        await run();
      } catch (error) {
        if (!isTotpRequired(error)) throw error;
        const verified = await requireTotp(error instanceof ApiError ? error.code : undefined);
        if (!verified) return false;
        await run();
      }
      toast.success("操作成功");
      await load();
      window.dispatchEvent(new Event("admin:nav-counts-refresh"));
      return true;
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "操作失败");
      return false;
    } finally {
      setActingId(null);
    }
  };

  const openAction = (kind: ActionKind, item: Item) => {
    setAction({ kind, item, note: "", restockApproved: false });
  };

  const submitAction = async () => {
    if (!action) return;
    const note = action.note.trim();
    if (action.kind === "close" && note.length < 2) {
      toast.error("请填写至少 2 个字的关闭原因");
      return;
    }
    setSubmittingAction(true);
    const endpoint =
      action.kind === "approve" || action.kind === "reject"
        ? "review"
        : action.kind === "receive"
          ? "receive"
          : action.kind;
    const body =
      action.kind === "approve" || action.kind === "reject"
        ? { approve: action.kind === "approve", note: note || undefined }
        : action.kind === "receive"
          ? { restockApproved: action.restockApproved, note: note || undefined }
          : action.kind === "refund"
            ? { note: note || undefined }
            : { reason: note };
    const ok = await post(action.item.id, endpoint, body);
    setSubmittingAction(false);
    if (ok) setAction(null);
  };

  const renderActions = (item: Item) => (
    <div className="flex flex-wrap justify-end gap-1">
      <Button size="sm" variant="ghost" onClick={() => setTimelineId(item.id)}>
        详情
      </Button>
      {canReview && item.status === "AFTER_SALES_REQUESTED" && (
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={actingId === item.id}
            onClick={() => openAction("approve", item)}
          >
            通过
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={actingId === item.id}
            onClick={() => openAction("reject", item)}
          >
            驳回
          </Button>
        </>
      )}
      {canReview && item.status === "AFTER_SALES_APPROVED" && (
        <Button
          size="sm"
          variant="outline"
          disabled={actingId === item.id}
          onClick={() => openAction("receive", item)}
        >
          确认收货
        </Button>
      )}
      {canReview && item.status === "RETURNING" && (
        <Button
          size="sm"
          variant="outline"
          disabled={actingId === item.id}
          onClick={() => openAction("receive", item)}
        >
          确认收货
        </Button>
      )}
      {canReview && item.status === "RETURNED" && (
        <>
          {canRefund && (isOwner || item.points < APPROVAL_THRESHOLDS.redemptionRefund) ? (
            <Button
              size="sm"
              disabled={actingId === item.id}
              onClick={() => openAction("refund", item)}
            >
              退款
            </Button>
          ) : item.points >= APPROVAL_THRESHOLDS.redemptionRefund && canRequestApproval ? (
            <ApprovalRequestAction
              policyKey="redemption.refund"
              initialValues={{ redemptionId: item.id }}
              label="申请退分审批"
            />
          ) : null}
        </>
      )}
      {canReview &&
        ["AFTER_SALES_REQUESTED", "AFTER_SALES_APPROVED", "RETURNING"].includes(item.status) && (
          <Button
            size="sm"
            variant="ghost"
            disabled={actingId === item.id}
            onClick={() => openAction("close", item)}
          >
            关闭
          </Button>
        )}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="兑换售后"
        description="审核售后、确认退货、执行退分；所有操作写审计，退分需 TOTP。"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Download className="h-4 w-4" />}
              onClick={() =>
                window.open(
                  `/api/admin/point-redemptions/export?status=${encodeURIComponent(tab)}`,
                  "_blank"
                )
              }
            >
              导出 CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw className="h-4 w-4" />}
              loading={loading}
              onClick={load}
            >
              刷新
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <Button
            key={item.key}
            variant={tab === item.key ? "primary" : "outline"}
            size="sm"
            onClick={() => {
              setPage(1);
              setTab(item.key);
            }}
          >
            {item.label}
            {data?.counts[item.key] ? ` (${data.counts[item.key]})` : ""}
          </Button>
        ))}
      </div>

      <DataTable
        columns={[
          ...columns,
          {
            key: "actions",
            title: "操作",
            width: "260px",
            align: "right",
            render: (_, item) => renderActions(item),
          },
        ]}
        data={data?.redemptions ?? []}
        loading={loading}
        rowKey="id"
        density="compact"
        emptyText="当前状态下暂无售后记录"
        minWidth="1100px"
        mobileCard={(item) => (
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{item.productName}</span>
              <Badge variant="warning">{STATUS_LABELS[item.status]}</Badge>
            </div>
            <p className="text-xs text-brand-charcoal/65">{item.afterSalesReason ?? "-"}</p>
            <p className="text-xs text-brand-charcoal/65">积分：{item.points}</p>
            {renderActions(item)}
          </div>
        )}
      />

      {data && data.pagination.totalPages > 1 && (
        <Pagination
          page={data.pagination.page}
          pageSize={data.pagination.pageSize}
          total={data.pagination.total}
          onChange={setPage}
        />
      )}
      <Modal
        open={!!action}
        onClose={() => {
          if (!submittingAction) setAction(null);
        }}
        title={action ? ACTION_TITLES[action.kind] : ""}
        size="md"
        closeOnBackdrop={!submittingAction}
      >
        {action && (
          <div className="space-y-4">
            <div className="rounded-lg bg-brand-charcoal/[0.03] px-3 py-2 text-sm text-brand-charcoal/70">
              {action.item.productName} · {action.item.points} 积分
              {action.kind === "refund" ? " · 确认后积分将退回用户" : ""}
            </div>
            {action.kind === "receive" && (
              <Checkbox
                checked={action.restockApproved}
                onChange={(checked) =>
                  setAction((current) =>
                    current ? { ...current, restockApproved: checked } : current
                  )
                }
                label="可二次销售并回补库存"
                description="仅在商品验收合格、可再次销售时勾选；不勾选则不回补库存。"
              />
            )}
            <Textarea
              label={
                action.kind === "close"
                  ? "关闭原因"
                  : action.kind === "reject"
                    ? "驳回原因"
                    : action.kind === "refund"
                      ? "退款备注"
                      : "备注"
              }
              value={action.note}
              onChange={(event) =>
                setAction((current) =>
                  current ? { ...current, note: event.target.value } : current
                )
              }
              required={action.kind === "close"}
              maxLength={200}
              placeholder={action.kind === "close" ? "至少 2 个字" : "选填"}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={submittingAction}
                onClick={() => setAction(null)}
              >
                取消
              </Button>
              <Button
                size="sm"
                loading={submittingAction}
                disabled={actingId === action.item.id}
                onClick={() => void submitAction()}
              >
                {ACTION_CONFIRM_LABELS[action.kind]}
              </Button>
            </div>
          </div>
        )}
      </Modal>
      <RedemptionTimelineModal redemptionId={timelineId} onClose={() => setTimelineId(null)} />
      {totpModal}
    </div>
  );
}

export default function RedemptionAfterSalesPage() {
  return (
    <RequirePermission permission="redemptions:after-sales">
      <AfterSalesContent />
    </RequirePermission>
  );
}
