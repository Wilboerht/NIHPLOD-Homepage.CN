"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Eye, FileJson, RefreshCw, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DatePicker } from "@/components/ui/DatePicker";
import { Select } from "@/components/ui/Select";
import { Pagination } from "@/components/ui/Pagination";
import { Modal } from "@/components/ui/Modal";
import { Tooltip } from "@/components/ui/Tooltip";
import { apiGet } from "@/lib/api-client";
import {
  AUDIT_ACTION_LABELS as ACTION_LABELS,
  AUDIT_TARGET_TYPE_LABELS as TARGET_TYPE_LABELS,
} from "@/lib/audit-labels";
import { formatDateTimeSeconds as formatDate } from "@/lib/format";
import { apiConsole } from "@/lib/logger";
import { downloadFromUrl } from "@/lib/client-download";
import { useToast } from "@/components/ui/Toast";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useLatestRequest } from "@/hooks/useLatestRequest";
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
  requestId?: string | null;
  authMethod?: string | null;
  actorType?: "ADMIN" | "USER" | "SYSTEM" | "INTEGRATION";
  actorName?: string | null;
  actorEmail?: string | null;
  detail: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
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
  { value: "ALL", label: "全部操作" },
] as const;

type ActorTypeFilter = (typeof ACTOR_TYPE_OPTIONS)[number]["value"];

function resolveActorTypeFilter(value: string | null): ActorTypeFilter {
  return ACTOR_TYPE_OPTIONS.some((option) => option.value === value)
    ? (value as ActorTypeFilter)
    : "ADMIN";
}

/**
 * 从未写入的遗留动作（历史功能已下线）：
 * 仅保留 ACTION_LABELS 映射用于历史数据展示，筛选下拉中隐藏避免误导。
 */
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
  // 认证类
  login: "bg-brand-charcoal/8 text-brand-charcoal/80",
  logout: "bg-brand-charcoal/8 text-brand-charcoal/80",
  // 物流类
  ship_order: "bg-blue-50 text-blue-700",
  // 退款类
  refund_approve: "bg-amber-50 text-amber-700",
  refund_reject: "bg-amber-50 text-amber-700",
  // 创建类
  create_admin: "bg-emerald-50 text-emerald-700",
  create_product: "bg-emerald-50 text-emerald-700",
  create_category: "bg-emerald-50 text-emerald-700",
  create_job: "bg-emerald-50 text-emerald-700",
  create_coupon: "bg-emerald-50 text-emerald-700",
  batch_product: "bg-emerald-50 text-emerald-700",
  batch_job: "bg-emerald-50 text-emerald-700",
  batch_message: "bg-emerald-50 text-emerald-700",
  // 更新类
  update_admin: "bg-sky-50 text-sky-700",
  update_product: "bg-sky-50 text-sky-700",
  update_category: "bg-sky-50 text-sky-700",
  update_job: "bg-sky-50 text-sky-700",
  update_coupon: "bg-sky-50 text-sky-700",
  update_application: "bg-sky-50 text-sky-700",
  update_message: "bg-sky-50 text-sky-700",
  // 删除类
  delete_admin: "bg-red-50 text-red-700",
  delete_product: "bg-red-50 text-red-700",
  delete_category: "bg-red-50 text-red-700",
  delete_job: "bg-red-50 text-red-700",
  delete_coupon: "bg-red-50 text-red-700",
  delete_application: "bg-red-50 text-red-700",
  delete_message: "bg-red-50 text-red-700",
  // 系统类
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

function OutcomeBadge({ outcome }: { outcome?: string | null }) {
  const meta = OUTCOME_META[outcome ?? "SUCCESS"] ?? OUTCOME_META.SUCCESS;
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

function AuditLogsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can: canAdmin } = useAdminPermissions();
  const toast = useToast();

  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });

  const page = parseInt(searchParams.get("page") || "1");
  // 操作者类型：默认只看管理员操作，可切换用户/系统/全部
  const actorType = resolveActorTypeFilter(searchParams.get("actorType"));
  const action = searchParams.get("action") || "";
  const targetType = searchParams.get("targetType") || "";
  const outcome = searchParams.get("outcome") || "";
  const startDate = searchParams.get("startDate") || "";
  const endDate = searchParams.get("endDate") || "";

  // 模态框状态
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  const takeLatestLogs = useLatestRequest();
  const fetchLogs = useCallback(async () => {
    const isLatest = takeLatestLogs();
    setLoading(true);
    try {
      const params: Record<string, string | number | undefined> = {
        page,
        actorType,
        action: action || undefined,
        targetType: targetType || undefined,
        outcome: outcome || undefined,
      };
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const data = await apiGet<{ items: AuditLogItem[]; pagination: typeof pagination }>(
        "/api/admin/audit-logs",
        params
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
  }, [page, actorType, action, targetType, outcome, startDate, endDate, takeLatestLogs]);

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

  const openDetail = (log: AuditLogItem) => {
    setSelectedLog(log);
    setDetailOpen(true);
  };

  const exportCsv = async () => {
    const params = new URLSearchParams();
    params.set("actorType", actorType);
    if (action) params.set("action", action);
    if (targetType) params.set("targetType", targetType);
    if (outcome) params.set("outcome", outcome);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    params.set("export", "csv");
    setExporting(true);
    try {
      await downloadFromUrl(
        `/api/admin/audit-logs?${params.toString()}`,
        `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出失败，请稍后重试");
    } finally {
      setExporting(false);
    }
  };

  const hasFilters = Boolean(
    actorType !== "ADMIN" || action || targetType || outcome || startDate || endDate
  );
  const clearFilters = () => router.push("/admin/audit-logs");

  // 表格列定义
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
          log.admin?.name || log.actorName || ACTOR_TYPE_LABELS[log.actorType ?? "SYSTEM"] || "-";
        const email = log.admin?.email || log.actorEmail;
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
      width: "140px",
      render: (_, log) => <ActionBadge action={log.action} />,
    },
    {
      key: "outcome",
      title: "结果",
      width: "100px",
      align: "center",
      render: (_, log) => <OutcomeBadge outcome={log.outcome} />,
    },
    {
      key: "targetType",
      title: "目标类型",
      width: "110px",
      render: (_, log) => (
        <span className="text-sm text-brand-charcoal/70">
          {TARGET_TYPE_LABELS[log.targetType] || log.targetType}
        </span>
      ),
    },
    {
      key: "targetId",
      title: "目标 ID",
      width: "160px",
      render: (_, log) => (
        <span
          className="block max-w-[150px] truncate font-mono text-xs text-brand-charcoal/65"
          title={log.targetId || undefined}
        >
          {log.targetId || "-"}
        </span>
      ),
    },
    {
      key: "ipAddress",
      title: "IP 地址",
      width: "130px",
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
        description="默认展示管理员操作，可切换用户/系统操作，便于追溯和合规审计"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canAdmin("audit:export") && (
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Download className="h-4 w-4" />}
                onClick={exportCsv}
                loading={exporting}
              >
                {exporting ? "导出中..." : "导出 CSV"}
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

      {/* 筛选栏 */}
      <div className="rounded-2xl border border-brand-charcoal/10 bg-white p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
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
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<X className="h-4 w-4" />}
              onClick={clearFilters}
              className="w-fit xl:ml-auto"
            >
              清除筛选
            </Button>
          )}
        </div>
      </div>

      {/* 日志列表 */}
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
          minWidth="1080px"
          emptyText="暂无审计日志"
          onRowClick={openDetail}
          mobileCard={(log) => (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <ActionBadge action={log.action} />
                    <OutcomeBadge outcome={log.outcome} />
                  </div>
                  <p className="mt-1 text-xs text-brand-charcoal/65">{formatDate(log.createdAt)}</p>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {TARGET_TYPE_LABELS[log.targetType] || log.targetType}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-brand-charcoal/70">
                <span className="truncate">
                  操作人：
                  {log.admin?.name ||
                    log.actorName ||
                    ACTOR_TYPE_LABELS[log.actorType ?? "SYSTEM"] ||
                    "-"}
                </span>
                <span className="truncate">IP：{log.ipAddress || "-"}</span>
                <span className="col-span-2 truncate font-mono">目标：{log.targetId || "-"}</span>
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

      {/* 分页 */}
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

      {/* 详情模态框 */}
      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title="审计日志详情"
        size="lg"
        mobileFullScreen
      >
        {selectedLog ? (
          <div className="space-y-5">
            {/* 操作摘要 */}
            <div className="flex items-center gap-3">
              <ActionBadge action={selectedLog.action} />
              <OutcomeBadge outcome={selectedLog.outcome} />
              <span className="text-sm text-brand-charcoal/65">
                {TARGET_TYPE_LABELS[selectedLog.targetType] || selectedLog.targetType}
                {selectedLog.targetId && (
                  <span className="ml-1 font-mono text-xs text-brand-charcoal/65">
                    ({selectedLog.targetId})
                  </span>
                )}
              </span>
            </div>

            {/* 基本信息 */}
            <div className="grid gap-3 text-sm md:grid-cols-2">
              <div className="rounded-lg bg-brand-charcoal/[0.03] p-3">
                <dt className="mb-1 text-brand-charcoal/65">操作人</dt>
                <dd className="font-medium">
                  {selectedLog.admin
                    ? `${selectedLog.admin.name} (${selectedLog.admin.email})`
                    : [selectedLog.actorName, selectedLog.actorEmail].filter(Boolean).join(" / ") ||
                      ACTOR_TYPE_LABELS[selectedLog.actorType ?? "SYSTEM"] ||
                      "-"}
                </dd>
              </div>
              <div className="rounded-lg bg-brand-charcoal/[0.03] p-3">
                <dt className="mb-1 text-brand-charcoal/65">操作者类型</dt>
                <dd className="font-medium">
                  {ACTOR_TYPE_LABELS[selectedLog.actorType ?? "ADMIN"] ??
                    selectedLog.actorType ??
                    "管理员"}
                </dd>
              </div>
              <div className="rounded-lg bg-brand-charcoal/[0.03] p-3">
                <dt className="mb-1 text-brand-charcoal/65">操作时间</dt>
                <dd className="font-medium">{formatDate(selectedLog.createdAt)}</dd>
              </div>
              <div className="rounded-lg bg-brand-charcoal/[0.03] p-3">
                <dt className="mb-1 text-brand-charcoal/65">IP 地址</dt>
                <dd className="font-mono font-medium">{selectedLog.ipAddress || "-"}</dd>
              </div>
              <div className="rounded-lg bg-brand-charcoal/[0.03] p-3">
                <dt className="mb-1 text-brand-charcoal/65">User-Agent</dt>
                <dd className="break-all text-xs font-medium">{selectedLog.userAgent || "-"}</dd>
              </div>
              <div className="rounded-lg bg-brand-charcoal/[0.03] p-3">
                <dt className="mb-1 text-brand-charcoal/65">请求 ID</dt>
                <dd className="break-all font-mono text-xs font-medium">
                  {selectedLog.requestId || "-"}
                </dd>
              </div>
              <div className="rounded-lg bg-brand-charcoal/[0.03] p-3">
                <dt className="mb-1 text-brand-charcoal/65">认证方式</dt>
                <dd className="font-medium">{selectedLog.authMethod || "-"}</dd>
              </div>
            </div>

            {/* JSON 详情 */}
            {selectedLog.detail ? (
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-brand-charcoal">
                  <FileJson className="h-4 w-4" />
                  操作详情
                </h4>
                <pre className="border-brand-charcoal/8 max-h-80 overflow-auto rounded-lg border bg-brand-charcoal/[0.03] p-4 text-xs text-brand-charcoal/70">
                  {JSON.stringify(selectedLog.detail, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="text-sm text-brand-charcoal/65">无详细记录</div>
            )}
          </div>
        ) : null}
      </Modal>
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
