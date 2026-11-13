"use client";

/**
 * 管理端对账中心（只读）
 *
 * 将现有巡检脚本中的检查项收敛到一个页面：积分余额/流水、兑换与退分、
 * 累计消费与同步流水、订单退款占用、重复退款行、跨来源订单冲突。
 * 只读，不提供修复按钮；修复仍需走脚本或人工流程。
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, Scale } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { apiGet } from "@/lib/api-client";
import { formatDateTimeSeconds } from "@/lib/format";
import { deferInEffect } from "@/hooks/deferInEffect";
import {
  CollapsiblePanel,
  DataTable,
  PageHeader,
  RequirePermission,
  StatStrip,
  type Column,
} from "@/components/admin";

interface Capped<T> {
  items: T[];
  count: number;
  truncated: boolean;
}

interface PointInvariantIssue {
  userId: string;
  available: number;
  remaining: number;
  kind:
    | "AVAILABLE_EXCEEDS_REMAINING"
    | "AVAILABLE_LESS_THAN_REMAINING"
    | "MISSING_BALANCE"
    | "NEGATIVE_REMAINING";
}

interface PointRedemptionLinkIssue {
  kind:
    | "MISSING_REDEEM"
    | "REDEEM_AMOUNT_MISMATCH"
    | "ORPHAN_REDEEM"
    | "MISSING_CANCEL_REFUND"
    | "CANCEL_REFUND_MISMATCH"
    | "ORPHAN_CANCEL_REFUND"
    | "MISSING_AFTER_SALES_REFUND"
    | "AFTER_SALES_REFUND_MISMATCH"
    | "ORPHAN_AFTER_SALES_REFUND";
  redemptionId: string | null;
  ledgerId: string | null;
  userId: string;
  reference: string;
  status: string | null;
  points: number | null;
  ledgerAmount: number | null;
  happenedAt: string | null;
}

interface SpentTotalMismatch {
  userId: string;
  totalSpent: number;
  ledgerTotal: number;
  diff: number;
  kind: "MISSING_LEDGER" | "AMOUNT_MISMATCH";
}

interface SpentClaimIssue {
  orderNoKey: string;
  userId: string;
  source: string;
  originalAmount: number | null;
  refundedAmount: number;
  syncedRefunded: number;
  importRefunded: number;
  drift: number;
  kind: "OVER_REFUNDED" | "UNLINKED_REFUND" | "REFUND_MISMATCH";
}

interface DuplicateRefundRow {
  userId: string;
  syncReference: string;
  count: number;
  total: number;
}

interface UnlinkedRefundRow {
  id: string;
  userId: string | null;
  orderNoKey: string | null;
  amount: number;
  appliedDelta: number | null;
  createdAt: string;
}

interface SpentOrderConflictItem {
  userId: string;
  userIds?: string[];
  orderNo: string;
  sources: string[];
  importAmount?: number;
  importAppliedDelta?: number | null;
  adjustmentAmount?: number | null;
  mallAmount?: number;
  importedAt?: string;
  reviewedAt?: string | null;
  mallSyncedAt?: string;
}

interface ReconciliationData {
  generatedAt: string;
  scope: { limit: number; sinceDays: number };
  summary: {
    totalIssueCount: number;
    pointIssueCount: number;
    spentIssueCount: number;
    actionableIssueCount: number;
    warningCount: number;
    hasIssues: boolean;
    hasActionableIssues: boolean;
    truncated: boolean;
  };
  points: {
    invariants: {
      checked: number;
      negativeBalances: number;
      deletedUsersWithRemaining: number;
      issues: PointInvariantIssue[];
      truncated: boolean;
    };
    redemptionLinks: Capped<PointRedemptionLinkIssue>;
  };
  spent: {
    totalMismatches: Capped<SpentTotalMismatch>;
    claimIssues: Capped<SpentClaimIssue>;
    duplicateRefundRows: Capped<DuplicateRefundRow>;
    unlinkedRefunds: Capped<UnlinkedRefundRow>;
    crossSourceConflicts: {
      since: string;
      count: number;
      items: SpentOrderConflictItem[];
      truncated: boolean;
    };
  };
}

const KIND_LABELS: Record<string, string> = {
  AVAILABLE_EXCEEDS_REMAINING: "余额大于流水剩余",
  AVAILABLE_LESS_THAN_REMAINING: "余额小于流水剩余",
  MISSING_BALANCE: "缺少余额行",
  NEGATIVE_REMAINING: "流水剩余为负",
  MISSING_REDEEM: "缺少兑换扣分流水",
  REDEEM_AMOUNT_MISMATCH: "兑换扣分金额不一致",
  ORPHAN_REDEEM: "兑换流水无对应兑换单",
  MISSING_CANCEL_REFUND: "取消兑换未退分",
  CANCEL_REFUND_MISMATCH: "取消退分金额不一致",
  ORPHAN_CANCEL_REFUND: "取消退分无对应兑换单",
  MISSING_AFTER_SALES_REFUND: "售后退款未退分",
  AFTER_SALES_REFUND_MISMATCH: "售后退分金额不一致",
  ORPHAN_AFTER_SALES_REFUND: "售后退分无对应兑换单",
  MISSING_LEDGER: "有累计消费但无同步流水",
  AMOUNT_MISMATCH: "累计消费与同步流水不一致",
  OVER_REFUNDED: "退款超过原始金额",
  UNLINKED_REFUND: "退款未绑定原始订单",
  REFUND_MISMATCH: "退款占用与退款行不一致",
};

type BadgeVariant =
  "default" | "primary" | "secondary" | "success" | "warning" | "danger" | "outline";

const KIND_VARIANTS: Record<string, BadgeVariant> = {
  AVAILABLE_EXCEEDS_REMAINING: "danger",
  AVAILABLE_LESS_THAN_REMAINING: "warning",
  MISSING_BALANCE: "danger",
  NEGATIVE_REMAINING: "danger",
  MISSING_REDEEM: "danger",
  REDEEM_AMOUNT_MISMATCH: "danger",
  ORPHAN_REDEEM: "warning",
  MISSING_CANCEL_REFUND: "danger",
  CANCEL_REFUND_MISMATCH: "danger",
  ORPHAN_CANCEL_REFUND: "warning",
  MISSING_AFTER_SALES_REFUND: "danger",
  AFTER_SALES_REFUND_MISMATCH: "danger",
  ORPHAN_AFTER_SALES_REFUND: "warning",
  MISSING_LEDGER: "warning",
  AMOUNT_MISMATCH: "danger",
  OVER_REFUNDED: "danger",
  UNLINKED_REFUND: "warning",
  REFUND_MISMATCH: "danger",
};

const SOURCE_LABELS: Record<string, string> = {
  MALL_SYNC: "商城同步",
  SPENT_IMPORT: "Excel 导入",
  SPENT_ADJUSTMENT: "消费补录",
};

function countLabel(count: number, truncated: boolean): string {
  return truncated ? `${count}+` : String(count);
}

function number(value: number | null | undefined): string {
  return value === null || value === undefined ? "-" : value.toLocaleString("zh-CN");
}

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toLocaleString("zh-CN")}`;
}

const invariantColumns: Column<PointInvariantIssue>[] = [
  {
    key: "userId",
    title: "用户 ID",
    width: "260px",
    render: (_, row) => <span className="break-all font-mono text-xs">{row.userId}</span>,
  },
  {
    key: "available",
    title: "可用余额",
    width: "110px",
    align: "right",
    render: (_, row) => (
      <span className={row.available < 0 ? "font-medium text-red-600" : ""}>
        {number(row.available)}
      </span>
    ),
  },
  {
    key: "remaining",
    title: "流水剩余合计",
    width: "130px",
    align: "right",
    render: (_, row) => number(row.remaining),
  },
  {
    key: "kind",
    title: "问题",
    width: "200px",
    render: (_, row) => (
      <Badge variant={KIND_VARIANTS[row.kind] ?? "warning"}>
        {KIND_LABELS[row.kind] ?? row.kind}
      </Badge>
    ),
  },
];

const redemptionLinkColumns: Column<PointRedemptionLinkIssue>[] = [
  {
    key: "kind",
    title: "问题",
    width: "190px",
    render: (_, row) => (
      <Badge variant={KIND_VARIANTS[row.kind] ?? "warning"}>
        {KIND_LABELS[row.kind] ?? row.kind}
      </Badge>
    ),
  },
  {
    key: "userId",
    title: "用户 ID",
    width: "230px",
    render: (_, row) => <span className="break-all font-mono text-xs">{row.userId}</span>,
  },
  {
    key: "reference",
    title: "幂等键",
    width: "240px",
    render: (_, row) => <span className="break-all font-mono text-xs">{row.reference}</span>,
  },
  {
    key: "redemptionId",
    title: "兑换单",
    width: "220px",
    render: (_, row) =>
      row.redemptionId ? (
        <span className="break-all font-mono text-xs">{row.redemptionId}</span>
      ) : (
        "-"
      ),
  },
  {
    key: "points",
    title: "兑换分",
    width: "90px",
    align: "right",
    render: (_, row) => number(row.points),
  },
  {
    key: "ledgerAmount",
    title: "流水金额",
    width: "100px",
    align: "right",
    render: (_, row) => number(row.ledgerAmount),
  },
  {
    key: "happenedAt",
    title: "发生时间",
    width: "170px",
    render: (_, row) => (
      <span className="text-xs text-brand-charcoal/65">
        {formatDateTimeSeconds(row.happenedAt)}
      </span>
    ),
  },
];

const totalMismatchColumns: Column<SpentTotalMismatch>[] = [
  {
    key: "userId",
    title: "用户 ID",
    width: "260px",
    render: (_, row) => <span className="break-all font-mono text-xs">{row.userId}</span>,
  },
  {
    key: "totalSpent",
    title: "User.totalSpent",
    width: "140px",
    align: "right",
    render: (_, row) => number(row.totalSpent),
  },
  {
    key: "ledgerTotal",
    title: "同步流水合计",
    width: "140px",
    align: "right",
    render: (_, row) => number(row.ledgerTotal),
  },
  {
    key: "diff",
    title: "差额",
    width: "110px",
    align: "right",
    render: (_, row) => (
      <span className={row.diff === 0 ? "" : "font-medium text-red-600"}>{signed(row.diff)}</span>
    ),
  },
  {
    key: "kind",
    title: "问题",
    width: "220px",
    render: (_, row) => (
      <Badge variant={KIND_VARIANTS[row.kind] ?? "warning"}>
        {KIND_LABELS[row.kind] ?? row.kind}
      </Badge>
    ),
  },
];

const claimIssueColumns: Column<SpentClaimIssue>[] = [
  {
    key: "orderNoKey",
    title: "订单键",
    width: "180px",
    render: (_, row) => <span className="break-all font-mono text-xs">{row.orderNoKey}</span>,
  },
  {
    key: "userId",
    title: "用户 ID",
    width: "230px",
    render: (_, row) => <span className="break-all font-mono text-xs">{row.userId}</span>,
  },
  {
    key: "source",
    title: "来源",
    width: "110px",
    render: (_, row) => SOURCE_LABELS[row.source] ?? row.source,
  },
  {
    key: "originalAmount",
    title: "原始金额",
    width: "100px",
    align: "right",
    render: (_, row) => number(row.originalAmount),
  },
  {
    key: "refundedAmount",
    title: "已退金额",
    width: "100px",
    align: "right",
    render: (_, row) => number(row.refundedAmount),
  },
  {
    key: "syncedRefunded",
    title: "同步退款合计",
    width: "120px",
    align: "right",
    render: (_, row) => number(row.syncedRefunded),
  },
  {
    key: "importRefunded",
    title: "其中 Excel",
    width: "100px",
    align: "right",
    render: (_, row) => number(row.importRefunded),
  },
  {
    key: "drift",
    title: "差异",
    width: "90px",
    align: "right",
    render: (_, row) => number(row.drift),
  },
  {
    key: "kind",
    title: "问题",
    width: "190px",
    render: (_, row) => (
      <Badge variant={KIND_VARIANTS[row.kind] ?? "warning"}>
        {KIND_LABELS[row.kind] ?? row.kind}
      </Badge>
    ),
  },
];

const duplicateRefundColumns: Column<DuplicateRefundRow>[] = [
  {
    key: "userId",
    title: "用户 ID",
    width: "260px",
    render: (_, row) => <span className="break-all font-mono text-xs">{row.userId}</span>,
  },
  {
    key: "syncReference",
    title: "同步幂等键",
    width: "320px",
    render: (_, row) => <span className="break-all font-mono text-xs">{row.syncReference}</span>,
  },
  {
    key: "count",
    title: "重复行数",
    width: "100px",
    align: "right",
    render: (_, row) => number(row.count),
  },
  {
    key: "total",
    title: "合计 appliedDelta",
    width: "150px",
    align: "right",
    render: (_, row) => signed(row.total),
  },
];

const unlinkedRefundColumns: Column<UnlinkedRefundRow>[] = [
  {
    key: "id",
    title: "导入行 ID",
    width: "240px",
    render: (_, row) => <span className="break-all font-mono text-xs">{row.id}</span>,
  },
  {
    key: "userId",
    title: "用户 ID",
    width: "230px",
    render: (_, row) => <span className="break-all font-mono text-xs">{row.userId ?? "-"}</span>,
  },
  {
    key: "orderNoKey",
    title: "订单键",
    width: "180px",
    render: (_, row) => (
      <span className="break-all font-mono text-xs">{row.orderNoKey ?? "-"}</span>
    ),
  },
  {
    key: "amount",
    title: "行金额",
    width: "100px",
    align: "right",
    render: (_, row) => number(row.amount),
  },
  {
    key: "appliedDelta",
    title: "实际生效",
    width: "100px",
    align: "right",
    render: (_, row) => number(row.appliedDelta),
  },
  {
    key: "createdAt",
    title: "导入时间",
    width: "170px",
    render: (_, row) => (
      <span className="text-xs text-brand-charcoal/65">{formatDateTimeSeconds(row.createdAt)}</span>
    ),
  },
];

const conflictColumns: Column<SpentOrderConflictItem>[] = [
  {
    key: "orderNo",
    title: "订单号",
    width: "180px",
    render: (_, row) => <span className="break-all font-mono text-xs">{row.orderNo}</span>,
  },
  {
    key: "sources",
    title: "涉及来源",
    width: "220px",
    render: (_, row) => (
      <div className="flex flex-wrap gap-1">
        {row.sources.map((source) => (
          <Badge key={source} variant="warning">
            {SOURCE_LABELS[source] ?? source}
          </Badge>
        ))}
      </div>
    ),
  },
  {
    key: "userIds",
    title: "用户 ID",
    width: "260px",
    render: (_, row) => (
      <span className="break-all font-mono text-xs">
        {(row.userIds?.length ? row.userIds : [row.userId]).join(", ")}
      </span>
    ),
  },
  {
    key: "importAmount",
    title: "导入金额",
    width: "100px",
    align: "right",
    render: (_, row) => number(row.importAmount),
  },
  {
    key: "adjustmentAmount",
    title: "补录金额",
    width: "100px",
    align: "right",
    render: (_, row) => number(row.adjustmentAmount),
  },
  {
    key: "mallAmount",
    title: "商城金额",
    width: "100px",
    align: "right",
    render: (_, row) => number(row.mallAmount),
  },
  {
    key: "latestAt",
    title: "最近发生",
    width: "170px",
    render: (_, row) => {
      const latest = [row.importedAt, row.reviewedAt, row.mallSyncedAt]
        .filter(Boolean)
        .sort()
        .at(-1);
      return (
        <span className="text-xs text-brand-charcoal/65">{formatDateTimeSeconds(latest)}</span>
      );
    },
  },
];

function SummaryCard({ data }: { data: ReconciliationData }) {
  const { summary } = data;
  return (
    <div className="rounded-2xl border border-brand-charcoal/10 bg-white p-4 sm:p-5">
      <StatStrip
        items={[
          {
            label: "异常总数",
            value: countLabel(summary.totalIssueCount, summary.truncated),
            muted: !summary.hasIssues,
            description: summary.hasIssues ? "需要人工核对" : "未发现异常",
          },
          {
            label: "积分账本",
            value: countLabel(summary.pointIssueCount, summary.truncated),
            muted: summary.pointIssueCount === 0,
            description: `${data.points.invariants.checked.toLocaleString("zh-CN")} 个余额行`,
          },
          {
            label: "消费账本",
            value: countLabel(summary.spentIssueCount, summary.truncated),
            muted: summary.spentIssueCount === 0,
            description: `跨来源冲突 ${countLabel(
              data.spent.crossSourceConflicts.count,
              data.spent.crossSourceConflicts.truncated
            )}`,
          },
          {
            label: "检查范围",
            value: `${data.scope.sinceDays} 天`,
            description: `单类最多 ${data.scope.limit} 条`,
          },
        ]}
      />
    </div>
  );
}

function ReconciliationContent() {
  const toast = useToast();
  const [data, setData] = useState<ReconciliationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sinceDays, setSinceDays] = useState("90");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiGet<ReconciliationData>("/api/admin/reconciliation", {
        limit: 100,
        sinceDays: Number(sinceDays),
      });
      setData(result);
      setLoadError(false);
    } catch {
      setLoadError(true);
      toast.error("加载对账数据失败");
    } finally {
      setLoading(false);
    }
  }, [sinceDays, toast]);

  useEffect(() => {
    deferInEffect(load);
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="对账中心"
        description="只读巡检：积分余额与流水、兑换退分、累计消费、退款占用和跨来源订单冲突"
        accessory={
          data ? (
            <Badge variant={data.summary.hasIssues ? "danger" : "success"}>
              {data.summary.hasIssues ? "发现异常" : "检查通过"}
            </Badge>
          ) : null
        }
        actions={
          <>
            <Select
              aria-label="跨来源冲突检查范围"
              value={sinceDays}
              onChange={(event) => setSinceDays(event.target.value)}
              options={[
                { value: "30", label: "冲突检查 30 天" },
                { value: "90", label: "冲突检查 90 天" },
                { value: "180", label: "冲突检查 180 天" },
                { value: "365", label: "冲突检查 365 天" },
              ]}
              className="w-40 py-1.5 text-sm"
              disabled={loading}
            />
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw className="h-4 w-4" />}
              loading={loading}
              onClick={load}
            >
              刷新
            </Button>
          </>
        }
      />

      {data && <SummaryCard data={data} />}

      {data?.summary.hasIssues && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <span className="font-medium">处理入口：</span>
          {data.summary.pointIssueCount > 0 && (
            <>
              <Link className="underline" href="/admin/users">
                用户积分与流水
              </Link>
              <Link className="underline" href="/admin/point-gifts">
                兑换履约
              </Link>
              <Link className="underline" href="/admin/redemption-after-sales">
                兑换售后
              </Link>
            </>
          )}
          {data.summary.spentIssueCount > 0 && (
            <Link className="underline" href="/admin/spent-adjustments">
              消费审核与导入历史
            </Link>
          )}
        </div>
      )}

      {loadError && data && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          刷新失败，当前展示的是上一次巡检结果。请稍后重试。
        </div>
      )}

      {loadError && !data ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-brand-charcoal/10 bg-white py-12">
          <p className="text-sm text-red-500">加载失败，请检查服务状态后重试</p>
          <Button variant="outline" size="sm" onClick={load}>
            重新加载
          </Button>
        </div>
      ) : !data ? (
        <div className="flex items-center gap-2 text-sm text-brand-charcoal/60">
          <Scale className="h-4 w-4" />
          正在巡检...
        </div>
      ) : (
        <>
          {data.summary.truncated && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              异常数量超过单类展示上限，以下列表只展示前 {data.scope.limit}{" "}
              条；请缩小范围或直接运行脚本获取完整结果。
            </div>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-brand-charcoal">积分账本</h2>

            <CollapsiblePanel
              title="余额与流水不变量"
              summary={`${countLabel(data.points.invariants.issues.length, data.points.invariants.truncated)} 条不一致 · 负数余额 ${data.points.invariants.negativeBalances} · 已注销残留 ${data.points.invariants.deletedUsersWithRemaining}`}
              defaultOpen={data.points.invariants.issues.length > 0}
            >
              <DataTable
                columns={invariantColumns}
                data={data.points.invariants.issues}
                rowKey="userId"
                density="compact"
                emptyText="余额与流水一致"
                minWidth="720px"
              />
            </CollapsiblePanel>

            <CollapsiblePanel
              title="兑换与退分流水关联"
              summary={`${countLabel(
                data.points.redemptionLinks.count,
                data.points.redemptionLinks.truncated
              )} 条异常`}
              defaultOpen={data.points.redemptionLinks.count > 0}
            >
              <DataTable
                columns={redemptionLinkColumns}
                data={data.points.redemptionLinks.items}
                rowKey={(row) => `${row.kind}:${row.ledgerId ?? row.redemptionId ?? row.reference}`}
                density="compact"
                emptyText="兑换记录与扣分/退分流水一致"
                minWidth="1120px"
              />
            </CollapsiblePanel>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-brand-charcoal">消费账本</h2>

            <CollapsiblePanel
              title="累计消费与同步流水"
              summary={`${countLabel(
                data.spent.totalMismatches.count,
                data.spent.totalMismatches.truncated
              )} 条不一致`}
              defaultOpen={data.spent.totalMismatches.count > 0}
            >
              <DataTable
                columns={totalMismatchColumns}
                data={data.spent.totalMismatches.items}
                rowKey="userId"
                density="compact"
                emptyText="累计消费与同步流水一致"
                minWidth="900px"
              />
            </CollapsiblePanel>

            <CollapsiblePanel
              title="退款占用与原始订单"
              summary={`${countLabel(
                data.spent.claimIssues.count,
                data.spent.claimIssues.truncated
              )} 条占用异常`}
              defaultOpen={data.spent.claimIssues.count > 0}
            >
              <DataTable
                columns={claimIssueColumns}
                data={data.spent.claimIssues.items}
                rowKey="orderNoKey"
                density="compact"
                emptyText="退款占用与退款行一致"
                minWidth="1050px"
              />
            </CollapsiblePanel>

            <CollapsiblePanel
              title="重复退款导入行"
              summary={`${countLabel(
                data.spent.duplicateRefundRows.count,
                data.spent.duplicateRefundRows.truncated
              )} 组重复`}
              defaultOpen={data.spent.duplicateRefundRows.count > 0}
            >
              <DataTable
                columns={duplicateRefundColumns}
                data={data.spent.duplicateRefundRows.items}
                rowKey={(row) => `${row.userId}:${row.syncReference}`}
                density="compact"
                emptyText="没有重复退款行"
                minWidth="860px"
              />
            </CollapsiblePanel>

            <CollapsiblePanel
              title="未绑定原始订单的退款行"
              summary={`${countLabel(
                data.spent.unlinkedRefunds.count,
                data.spent.unlinkedRefunds.truncated
              )} 条退款`}
              defaultOpen={data.spent.unlinkedRefunds.count > 0}
            >
              <DataTable
                columns={unlinkedRefundColumns}
                data={data.spent.unlinkedRefunds.items}
                rowKey="id"
                density="compact"
                emptyText="所有退款行均已绑定原始订单"
                minWidth="1020px"
              />
            </CollapsiblePanel>

            <CollapsiblePanel
              title="跨来源订单冲突"
              summary={`${countLabel(
                data.spent.crossSourceConflicts.count,
                data.spent.crossSourceConflicts.truncated
              )} 条冲突 · 最近 ${data.scope.sinceDays} 天`}
              defaultOpen={data.spent.crossSourceConflicts.count > 0}
            >
              <DataTable
                columns={conflictColumns}
                data={data.spent.crossSourceConflicts.items}
                rowKey={(row) => row.orderNo}
                density="compact"
                emptyText="没有跨来源订单冲突"
                minWidth="1100px"
              />
            </CollapsiblePanel>
          </section>

          <p className="text-xs text-brand-charcoal/50">
            生成时间：{formatDateTimeSeconds(data.generatedAt)} ·
            对账中心不提供修复操作；确认异常后请使用对应修复脚本或人工流程。
          </p>
        </>
      )}
    </div>
  );
}

export default function ReconciliationPage() {
  return (
    <RequirePermission permission="reconciliation:read">
      <ReconciliationContent />
    </RequirePermission>
  );
}
