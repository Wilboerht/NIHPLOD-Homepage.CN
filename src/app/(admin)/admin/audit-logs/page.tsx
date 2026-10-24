"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Copy, Download, Eye, FileJson, RefreshCw, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DatePicker } from "@/components/ui/DatePicker";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Pagination } from "@/components/ui/Pagination";
import { Modal } from "@/components/ui/Modal";
import { Tooltip } from "@/components/ui/Tooltip";
import { apiGet } from "@/lib/api-client";
import {
  AUDIT_ACTION_LABELS as ACTION_LABELS,
  AUDIT_TARGET_TYPE_LABELS as TARGET_TYPE_LABELS,
} from "@/lib/audit-labels";
import { AUDIT_CATEGORIES, AUDIT_RISK_LEVELS } from "@/lib/audit-registry";
import { formatDateTimeSeconds as formatDate } from "@/lib/format";
import { apiConsole } from "@/lib/logger";
import { useToast } from "@/components/ui/Toast";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { isTotpRequired, useTotpConfirm } from "@/hooks/useTotpConfirm";
import { AuditExportDialog } from "@/components/admin/AuditExportDialog";
import {
  DataTable,
  IconButton,
  PageHeader,
  RequirePermission,
  type Column,
} from "@/components/admin";

interface AuditLogItem {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  targetLabel?: string | null;
  outcome?: "PENDING" | "SUCCESS" | "FAILURE" | "PARTIAL";
  riskLevel?: string | null;
  category?: string | null;
  requestId?: string | null;
  authMethod?: string | null;
  sessionJti?: string | null;
  actorType?: "ADMIN" | "USER" | "SYSTEM" | "INTEGRATION";
  actorName?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  detail?: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  chainSeq?: number | null;
  entryHash?: string | null;
  admin: { id: string; email: string; name: string } | null;
  createdAt: string;
}

const ACTOR_TYPE_LABELS: Record<string, string> = {
  ADMIN: "管理员",
  USER: "用户",
  SYSTEM: "系统",
  INTEGRATION: "集成",
};

const ACTOR_TYPE_OPTIONS = [
  { value: "ADMIN", label: "管理员操作" },
  { value: "USER", label: "用户操作" },
  { value: "SYSTEM", label: "系统操作" },
  { value: "INTEGRATION", label: "集成操作" },
  { value: "ALL", label: "全部操作" },
] as const;

type ActorTypeFilter = (typeof ACTOR_TYPE_OPTIONS)[number]["value"];

function resolveActorTypeFilter(value: string | null): ActorTypeFilter {
  return ACTOR_TYPE_OPTIONS.some((option) => option.value === value)
    ? (value as ActorTypeFilter)
    : "ADMIN";
}

const HIDDEN_FILTER_ACTIONS = new Set([
  "ship_order",
  "update_order",
  "refund_approve",
  "refund_reject",
  "create_coupon",
  "update_coupon",
  "delete_coupon",
  "batch_coupon",
  "create_point_campaign",
  "update_point_campaign",
  "delete_point_campaign",
  "point_gift_create",
]);

const ACTION_COLORS: Record<string, string> = {
  login: "bg-brand-charcoal/8 text-brand-charcoal/80",
  logout: "bg-brand-charcoal/8 text-brand-charcoal/80",
  create_admin: "bg-emerald-50 text-emerald-700",
  create_product: "bg-emerald-50 text-emerald-700",
  create_category: "bg-emerald-50 text-emerald-700",
  create_job: "bg-emerald-50 text-emerald-700",
  batch_product: "bg-emerald-50 text-emerald-700",
  batch_job: "bg-emerald-50 text-emerald-700",
  batch_message: "bg-emerald-50 text-emerald-700",
  update_admin: "bg-sky-50 text-sky-700",
  update_product: "bg-sky-50 text-sky-700",
  update_category: "bg-sky-50 text-sky-700",
  update_job: "bg-sky-50 text-sky-700",
  update_application: "bg-sky-50 text-sky-700",
  update_message: "bg-sky-50 text-sky-700",
  delete_admin: "bg-red-50 text-red-700",
  delete_product: "bg-red-50 text-red-700",
  delete_category: "bg-red-50 text-red-700",
  delete_job: "bg-red-50 text-red-700",
  delete_application: "bg-red-50 text-red-700",
  delete_message: "bg-red-50 text-red-700",
  run_cron_task: "bg-purple-50 text-purple-700",
};

const OUTCOME_META: Record<
  string,
  { label: string; variant: "success" | "danger" | "warning" | "primary" }
> = {
  SUCCESS: { label: "成功", variant: "success" },
  FAILURE: { label: "失败", variant: "danger" },
  PENDING: { label: "进行中", variant: "warning" },
  PARTIAL: { label: "部分成功", variant: "primary" },
};

const RISK_META: Record<
  string,
  { label: string; variant: "success" | "danger" | "warning" | "primary" | "secondary" }
> = {
  LOW: { label: "低", variant: "secondary" },
  MEDIUM: { label: "中", variant: "warning" },
  HIGH: { label: "高", variant: "danger" },
  CRITICAL: { label: "严重", variant: "danger" },
};

const CATEGORY_LABELS: Record<string, string> = {
  auth: "认证",
  user: "用户",
  finance: "财务",
  security: "安全",
  content: "内容",
  system: "系统",
};

function OutcomeBadge({ outcome }: { outcome?: string | null }) {
  const meta = OUTCOME_META[outcome ?? "SUCCESS"] ?? OUTCOME_META.SUCCESS;
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

function RiskBadge({ risk }: { risk?: string | null }) {
  if (!risk) return <span className="text-xs text-brand-charcoal/50">-</span>;
  const meta = RISK_META[risk] ?? RISK_META.LOW;
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

function ActionBadge({ action }: { action: string }) {
  return (
    <span
      title={ACTION_LABELS[action] || action}
      className={`inline-flex max-w-full items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
        ACTION_COLORS[action] || "bg-brand-charcoal/8 text-brand-charcoal/80"
      }`}
    >
      {ACTION_LABELS[action] || action}
    </span>
  );
}

function DetailDiff({ detail }: { detail: Record<string, unknown> | null | undefined }) {
  if (!detail) return <div className="text-sm text-brand-charcoal/65">无详细记录</div>;
  const changes = Array.isArray(detail.changes) ? detail.changes : null;
  if (changes && changes.length > 0) {
    return (
      <div className="overflow-hidden rounded-lg border border-brand-charcoal/10">
        <table className="w-full text-xs">
          <thead className="bg-brand-charcoal/[0.03] text-left text-brand-charcoal/60">
            <tr>
              <th className="px-3 py-2 font-medium">字段</th>
              <th className="px-3 py-2 font-medium">变更前</th>
              <th className="px-3 py-2 font-medium">变更后</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((change, index) => {
              const item = change as { field?: string; before?: unknown; after?: unknown };
              return (
                <tr key={`${item.field ?? "field"}-${index}`} className="border-t border-brand-charcoal/5">
                  <td className="px-3 py-2 font-mono">{item.field ?? "-"}</td>
                  <td className="max-w-[240px] break-all px-3 py-2 text-red-700">
                    {JSON.stringify(item.before ?? null)}
                  </td>
                  <td className="max-w-[240px] break-all px-3 py-2 text-emerald-700">
                    {JSON.stringify(item.after ?? null)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <pre className="border-brand-charcoal/8 max-h-80 overflow-auto rounded-lg border bg-brand-charcoal/[0.03] p-4 text-xs text-brand-charcoal/70">
      {JSON.stringify(detail, null, 2)}
    </pre>
  );
}

function AuditLogsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can: canAdmin } = useAdminPermissions();
  const toast = useToast();
  const { requireTotp, totpModal } = useTotpConfirm();

  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [searchDraft, setSearchDraft] = useState(searchParams.get("search") || "");
  const [detail, setDetail] = useState<AuditLogItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const page = parseInt(searchParams.get("page") || "1");
  const actorType = resolveActorTypeFilter(searchParams.get("actorType"));
  const action = searchParams.get("action") || "";
  const targetType = searchParams.get("targetType") || "";
  const outcome = searchParams.get("outcome") || "";
  const riskLevel = searchParams.get("riskLevel") || "";
  const category = searchParams.get("category") || "";
  const legalHold = searchParams.get("legalHold") || "";
  const search = searchParams.get("search") || "";
  const targetId = searchParams.get("targetId") || "";
  const requestId = searchParams.get("requestId") || "";
  const userId = searchParams.get("userId") || "";
  const startDate = searchParams.get("startDate") || "";
  const endDate = searchParams.get("endDate") || "";

  const filterPayload = useMemo(
    () => ({
      actorType,
      action: action || undefined,
      targetType: targetType || undefined,
      outcome: outcome || undefined,
      riskLevel: riskLevel || undefined,
      category: category || undefined,
      legalHold: legalHold || undefined,
      search: search || undefined,
      targetId: targetId || undefined,
      requestId: requestId || undefined,
      userId: userId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    }),
    [
      actorType,
      action,
      targetType,
      outcome,
      riskLevel,
      category,
      legalHold,
      search,
      targetId,
      requestId,
      userId,
      startDate,
      endDate,
    ]
  );

  const takeLatestLogs = useLatestRequest();
  const fetchLogs = useCallback(async () => {
    const isLatest = takeLatestLogs();
    setLoading(true);
    try {
      const data = await apiGet<{ items: AuditLogItem[]; pagination: typeof pagination }>(
        "/api/admin/audit-logs",
        { page, pageSize: 20, ...filterPayload }
      );
      if (!isLatest()) return;
      setLogs(data.items);
      setPagination(data.pagination);
      setLoadError(false);
    } catch {
      if (!isLatest()) return;
      apiConsole.error("获取审计日志失败");
      setLoadError(true);
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [page, filterPayload, takeLatestLogs]);

  useEffect(() => {
    deferInEffect(fetchLogs);
  }, [fetchLogs]);

  const updateParams = (newParams: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    if (!newParams.page) params.set("page", "1");
    router.push(`/admin/audit-logs?${params.toString()}`);
  };

  useEffect(() => {
    if (pagination.totalPages > 0 && page > pagination.totalPages) {
      updateParams({ page: String(pagination.totalPages) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pagination.totalPages]);

  const fetchDetail = useCallback(
    async (log: AuditLogItem) => {
      setDetailLoading(true);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const data = await apiGet<AuditLogItem>(`/api/admin/audit-logs/${log.id}`);
          setDetail(data);
          break;
        } catch (error) {
          if (attempt === 0 && isTotpRequired(error)) {
            const verified = await requireTotp(
              error && typeof error === "object" && "code" in error
                ? String((error as { code?: string }).code)
                : undefined
            );
            if (verified) continue;
          }
          toast.error(error instanceof Error ? error.message : "加载详情失败");
          setDetail(log);
          break;
        }
      }
      setDetailLoading(false);
    },
    [requireTotp, toast]
  );

  const openDetail = (log: AuditLogItem) => {
    setDetail(log);
    setDetailOpen(true);
    void fetchDetail(log);
  };

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("已复制");
    } catch {
      toast.error("复制失败");
    }
  };

  const hasFilters = Boolean(
    actorType !== "ADMIN" ||
      action ||
      targetType ||
      outcome ||
      riskLevel ||
      category ||
      legalHold ||
      search ||
      targetId ||
      requestId ||
      userId ||
      startDate ||
      endDate
  );

  const columns: Column<AuditLogItem>[] = [
    {
      key: "createdAt",
      title: "时间",
      width: "170px",
      render: (_, log) => (
        <span className="whitespace-nowrap text-sm text-brand-charcoal/65">
          {formatDate(log.createdAt)}
        </span>
      ),
    },
    {
      key: "admin",
      title: "操作人",
      width: "180px",
      render: (_, log) => {
        const name =
          log.actorName || log.admin?.name || ACTOR_TYPE_LABELS[log.actorType ?? "SYSTEM"] || "-";
        const email = log.actorEmail || log.admin?.email;
        return (
          <div className="min-w-0">
            <p className="truncate font-medium text-brand-charcoal">{name}</p>
            {email && <p className="truncate text-xs text-brand-charcoal/65">{email}</p>}
          </div>
        );
      },
    },
    {
      key: "action",
      title: "操作类型",
      width: "150px",
      render: (_, log) => <ActionBadge action={log.action} />,
    },
    {
      key: "outcome",
      title: "结果",
      width: "90px",
      align: "center",
      render: (_, log) => <OutcomeBadge outcome={log.outcome} />,
    },
    {
      key: "riskLevel",
      title: "风险",
      width: "80px",
      align: "center",
      render: (_, log) => <RiskBadge risk={log.riskLevel} />,
    },
    {
      key: "targetType",
      title: "目标",
      width: "190px",
      render: (_, log) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-brand-charcoal/80">
            {TARGET_TYPE_LABELS[log.targetType] || log.targetType}
          </p>
          <p className="truncate font-mono text-xs text-brand-charcoal/55" title={log.targetId || undefined}>
            {log.targetLabel || log.targetId || "-"}
          </p>
        </div>
      ),
    },
    {
      key: "ipAddress",
      title: "IP 地址",
      width: "125px",
      render: (_, log) => (
        <span className="whitespace-nowrap text-sm text-brand-charcoal/65">
          {log.ipAddress || "-"}
        </span>
      ),
    },
    {
      key: "actions",
      title: "操作",
      width: "72px",
      align: "right",
      render: (_, log) => (
        <Tooltip content="查看详情" side="top">
          <IconButton
            label={`查看 ${ACTION_LABELS[log.action] || log.action} 详情`}
            onClick={() => openDetail(log)}
          >
            <Eye className="h-4 w-4" />
          </IconButton>
        </Tooltip>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="审计日志"
        description="默认展示管理员操作；支持风险、目标、请求 ID 与关键词筛选"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canAdmin("audit:export") && (
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Download className="h-4 w-4" />}
                onClick={() => setExportOpen(true)}
              >
                导出
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw className="h-4 w-4" />}
              onClick={fetchLogs}
            >
              刷新
            </Button>
          </div>
        }
      />

      <div className="rounded-2xl border border-brand-charcoal/10 bg-white p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-full sm:w-36">
              <Select
                aria-label="按操作者筛选"
                options={ACTOR_TYPE_OPTIONS.map((option) => ({ ...option }))}
                value={actorType}
                onChange={(e) =>
                  updateParams({ actorType: e.target.value === "ADMIN" ? "" : e.target.value })
                }
              />
            </div>
            <div className="w-full sm:w-44">
              <Select
                aria-label="按操作筛选"
                options={[
                  { value: "", label: "全部操作" },
                  ...Object.entries(ACTION_LABELS)
                    .filter(([key]) => !HIDDEN_FILTER_ACTIONS.has(key))
                    .map(([key, label]) => ({ value: key, label })),
                ]}
                value={action}
                onChange={(e) => updateParams({ action: e.target.value })}
              />
            </div>
            <div className="w-full sm:w-36">
              <Select
                aria-label="按目标类型筛选"
                options={[
                  { value: "", label: "全部类型" },
                  ...Object.entries(TARGET_TYPE_LABELS).map(([key, label]) => ({
                    value: key,
                    label,
                  })),
                ]}
                value={targetType}
                onChange={(e) => updateParams({ targetType: e.target.value })}
              />
            </div>
            <div className="w-full sm:w-32">
              <Select
                aria-label="按结果筛选"
                options={[
                  { value: "", label: "全部结果" },
                  { value: "SUCCESS", label: "成功" },
                  { value: "FAILURE", label: "失败" },
                  { value: "PENDING", label: "进行中" },
                  { value: "PARTIAL", label: "部分成功" },
                ]}
                value={outcome}
                onChange={(e) => updateParams({ outcome: e.target.value })}
              />
            </div>
            <div className="w-full sm:w-32">
              <Select
                aria-label="按风险筛选"
                options={[
                  { value: "", label: "全部风险" },
                  ...AUDIT_RISK_LEVELS.map((level) => ({ value: level, label: RISK_META[level].label })),
                ]}
                value={riskLevel}
                onChange={(e) => updateParams({ riskLevel: e.target.value })}
              />
            </div>
            <div className="w-full sm:w-36">
              <Select
                aria-label="按类别筛选"
                options={[
                  { value: "", label: "全部类别" },
                  ...AUDIT_CATEGORIES.map((item) => ({
                    value: item,
                    label: CATEGORY_LABELS[item] ?? item,
                  })),
                ]}
                value={category}
                onChange={(e) => updateParams({ category: e.target.value })}
              />
            </div>
            <div className="w-full sm:w-36">
              <Select
                aria-label="法律保留"
                options={[
                  { value: "", label: "全部保留状态" },
                  { value: "true", label: "仅法律保留" },
                  { value: "false", label: "排除法律保留" },
                ]}
                value={legalHold}
                onChange={(e) => updateParams({ legalHold: e.target.value })}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-full sm:w-56">
              <Input
                aria-label="关键词"
                placeholder="搜索操作人/目标/请求ID"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") updateParams({ search: searchDraft });
                }}
              />
            </div>
            <div className="w-full sm:w-44">
              <Input
                aria-label="目标 ID"
                placeholder="目标 ID"
                defaultValue={targetId}
                onKeyDown={(e) => {
                  if (e.key === "Enter") updateParams({ targetId: e.currentTarget.value });
                }}
              />
            </div>
            <div className="w-full sm:w-48">
              <Input
                aria-label="请求 ID"
                placeholder="请求 ID / CF-Ray"
                defaultValue={requestId}
                onKeyDown={(e) => {
                  if (e.key === "Enter") updateParams({ requestId: e.currentTarget.value });
                }}
              />
            </div>
            <div className="w-full sm:w-44">
              <Input
                aria-label="用户 ID"
                placeholder="用户 ID"
                defaultValue={userId}
                onKeyDown={(e) => {
                  if (e.key === "Enter") updateParams({ userId: e.currentTarget.value });
                }}
              />
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <div className="min-w-0 flex-1 sm:w-40 sm:flex-none">
                <DatePicker
                  aria-label="开始日期"
                  value={startDate}
                  onChange={(value) => updateParams({ startDate: value })}
                  placeholder="开始日期"
                />
              </div>
              <span className="text-sm text-brand-charcoal/65">至</span>
              <div className="min-w-0 flex-1 sm:w-40 sm:flex-none">
                <DatePicker
                  aria-label="结束日期"
                  value={endDate}
                  onChange={(value) => updateParams({ endDate: value })}
                  placeholder="结束日期"
                />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => updateParams({ search: searchDraft })}>
              搜索
            </Button>
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<X className="h-4 w-4" />}
                onClick={() => {
                  setSearchDraft("");
                  router.push("/admin/audit-logs");
                }}
              >
                清除筛选
              </Button>
            )}
          </div>
        </div>
      </div>

      {loadError ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <p className="text-sm text-red-500">加载失败，请重试</p>
          <Button variant="outline" size="sm" onClick={fetchLogs}>
            重试
          </Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={logs}
          loading={loading}
          rowKey="id"
          tableLayout="fixed"
          minWidth="1140px"
          emptyText="暂无审计日志"
          onRowClick={openDetail}
          mobileCard={(log) => (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <ActionBadge action={log.action} />
                    <OutcomeBadge outcome={log.outcome} />
                    <RiskBadge risk={log.riskLevel} />
                  </div>
                  <p className="mt-1 text-xs text-brand-charcoal/65">{formatDate(log.createdAt)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-brand-charcoal/70">
                <span className="truncate">
                  操作人：{log.actorName || log.admin?.name || ACTOR_TYPE_LABELS[log.actorType ?? "SYSTEM"] || "-"}
                </span>
                <span className="truncate">IP：{log.ipAddress || "-"}</span>
                <span className="col-span-2 truncate">目标：{log.targetLabel || log.targetId || "-"}</span>
              </div>
              <div className="flex justify-end border-t border-brand-charcoal/10 pt-2">
                <Button variant="ghost" size="sm" onClick={() => openDetail(log)}>
                  <Eye className="mr-1 h-4 w-4" />
                  查看详情
                </Button>
              </div>
            </div>
          )}
        />
      )}

      {pagination.total > 0 && (
        <div className="flex justify-center">
          <Pagination
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={pagination.total}
            onChange={(p) => updateParams({ page: String(p) })}
          />
        </div>
      )}

      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title="审计日志详情"
        size="lg"
        mobileFullScreen
      >
        {detail ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <ActionBadge action={detail.action} />
              <OutcomeBadge outcome={detail.outcome} />
              <RiskBadge risk={detail.riskLevel} />
              <span className="text-sm text-brand-charcoal/65">
                {TARGET_TYPE_LABELS[detail.targetType] || detail.targetType}
                {detail.targetId && (
                  <span className="ml-1 font-mono text-xs text-brand-charcoal/65">
                    ({detail.targetId})
                  </span>
                )}
              </span>
            </div>

            {detailLoading ? (
              <p className="text-sm text-brand-charcoal/60">加载详情...</p>
            ) : (
              <>
                <div className="grid gap-3 text-sm md:grid-cols-2">
                  <div className="rounded-lg bg-brand-charcoal/[0.03] p-3">
                    <dt className="mb-1 text-brand-charcoal/65">操作人</dt>
                    <dd className="font-medium">
                      {detail.actorName || detail.admin?.name || ACTOR_TYPE_LABELS[detail.actorType ?? "SYSTEM"] || "-"}
                      {(detail.actorEmail || detail.admin?.email) && (
                        <span className="ml-1 text-xs text-brand-charcoal/60">
                          ({detail.actorEmail || detail.admin?.email})
                        </span>
                      )}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-brand-charcoal/[0.03] p-3">
                    <dt className="mb-1 text-brand-charcoal/65">操作者类型 / 角色</dt>
                    <dd className="font-medium">
                      {ACTOR_TYPE_LABELS[detail.actorType ?? "ADMIN"] ?? detail.actorType ?? "-"}
                      {detail.actorRole ? ` / ${detail.actorRole}` : ""}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-brand-charcoal/[0.03] p-3">
                    <dt className="mb-1 text-brand-charcoal/65">操作时间</dt>
                    <dd className="font-medium">{formatDate(detail.createdAt)}</dd>
                  </div>
                  <div className="rounded-lg bg-brand-charcoal/[0.03] p-3">
                    <dt className="mb-1 text-brand-charcoal/65">IP 地址</dt>
                    <dd className="font-mono font-medium">{detail.ipAddress || "-"}</dd>
                  </div>
                  <div className="rounded-lg bg-brand-charcoal/[0.03] p-3">
                    <dt className="mb-1 text-brand-charcoal/65">User-Agent</dt>
                    <dd className="break-all text-xs font-medium">{detail.userAgent || "-"}</dd>
                  </div>
                  <div className="rounded-lg bg-brand-charcoal/[0.03] p-3">
                    <dt className="mb-1 text-brand-charcoal/65">认证方式</dt>
                    <dd className="font-medium">{detail.authMethod || "-"}</dd>
                  </div>
                  <div className="rounded-lg bg-brand-charcoal/[0.03] p-3">
                    <dt className="mb-1 text-brand-charcoal/65">请求 ID</dt>
                    <dd className="flex items-center gap-2 break-all font-mono text-xs font-medium">
                      <span>{detail.requestId || "-"}</span>
                      {detail.requestId && (
                        <>
                          <button
                            type="button"
                            className="text-brand-charcoal/50 hover:text-brand-primary"
                            onClick={() => void copyText(detail.requestId!)}
                            aria-label="复制请求 ID"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className="text-brand-charcoal/50 hover:text-brand-primary"
                            onClick={() => {
                              setDetailOpen(false);
                              updateParams({ requestId: detail.requestId! });
                            }}
                            aria-label="查看同请求日志"
                          >
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-brand-charcoal/[0.03] p-3">
                    <dt className="mb-1 text-brand-charcoal/65">链序号 / 哈希</dt>
                    <dd className="break-all font-mono text-xs font-medium">
                      {detail.chainSeq ?? "-"} / {detail.entryHash ? `${detail.entryHash.slice(0, 16)}…` : "-"}
                    </dd>
                  </div>
                </div>

                <div>
                  <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-brand-charcoal">
                    <FileJson className="h-4 w-4" />
                    操作详情
                  </h4>
                  <DetailDiff detail={detail.detail} />
                </div>
              </>
            )}
          </div>
        ) : null}
      </Modal>

      <AuditExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        filters={{ ...filterPayload }}
      />
      {totpModal}
    </div>
  );
}

export default function AuditLogsPage() {
  return (
    <RequirePermission permission="audit:read">
      <AuditLogsContent />
    </RequirePermission>
  );
}
