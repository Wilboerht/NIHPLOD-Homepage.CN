"use client";

import React, { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, Download, RotateCw, ChevronDown, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { Pagination } from "@/components/ui/Pagination";
import { DatePicker } from "@/components/ui/DatePicker";
import { Empty } from "@/components/ui/Empty";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { apiGet } from "@/lib/api-client";
import { downloadFromUrl } from "@/lib/client-download";
import { formatDateTimeSeconds as formatDate } from "@/lib/format";
import { RequirePermission } from "@/components/admin";
import { PageHeader } from "@/components/admin/PageHeader";
import { MobileList, MobileListCard } from "@/components/admin/MobileList";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";

interface AuditEntry {
  id: string;
  event: string;
  userId: string;
  userPhone: string | null;
  clientId: string;
  clientName: string;
  ip: string;
  success: boolean;
  detail: unknown;
  createdAt: string;
}

interface AuditResponse {
  items: AuditEntry[];
  pagination: { page: number; pageSize: number; total: number };
}

// 与服务端白名单及实际产生的事件全集（src/lib/sso-audit.ts SsoEventType）保持一致
const EVENT_TYPE_OPTIONS = [
  { value: "", label: "全部事件" },
  { value: "authorize", label: "授权请求" },
  { value: "token", label: "Token 签发" },
  { value: "introspect", label: "Token 验证" },
  { value: "userinfo", label: "用户信息" },
  { value: "consent", label: "授权确认/撤销" },
  { value: "status_change", label: "状态变更" },
  { value: "logout", label: "登出" },
  { value: "backchannel_logout", label: "Backchannel 登出" },
  { value: "profile_webhook", label: "资料变更推送" },
];

const SUCCESS_OPTIONS = [
  { value: "", label: "全部结果" },
  { value: "true", label: "成功" },
  { value: "false", label: "失败" },
];

const formatEventType = (type: string): string => {
  const map: Record<string, string> = {
    authorize: "授权请求",
    token: "Token 签发",
    introspect: "Token 验证",
    userinfo: "用户信息",
    consent: "授权确认/撤销",
    status_change: "状态变更",
    logout: "登出",
    backchannel_logout: "Backchannel 登出",
    profile_webhook: "资料变更推送",
  };
  return map[type] || type;
};

const getEventBadgeVariant = (
  type: string
): "primary" | "secondary" | "success" | "warning" | "danger" | "outline" => {
  const map: Record<
    string,
    "primary" | "secondary" | "success" | "warning" | "danger" | "outline"
  > = {
    authorize: "primary",
    token: "success",
    introspect: "secondary",
    userinfo: "secondary",
    consent: "danger",
    status_change: "warning",
    logout: "outline",
    backchannel_logout: "outline",
    profile_webhook: "outline",
  };
  return map[type] || "secondary";
};

function OAuthAuditPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { can: canAdmin } = useAdminPermissions();
  // 导出接口单独要求 audit:export 权限，无权限时不渲染入口；失败由 fetch 响应统一提示。
  const canExport = canAdmin("audit:export");
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(() => {
    const p = Number(searchParams.get("page"));
    return Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1;
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const pageSize = 20;

  // Filters
  const [eventType, setEventType] = useState(() => searchParams.get("event") || "");
  const [searchClientId, setSearchClientId] = useState(() => searchParams.get("clientId") || "");
  const [searchUserId, setSearchUserId] = useState(() => searchParams.get("userId") || "");
  const [debouncedClientId, setDebouncedClientId] = useState(
    () => searchParams.get("clientId") || ""
  );
  const [debouncedUserId, setDebouncedUserId] = useState(() => searchParams.get("userId") || "");
  const [dateFrom, setDateFrom] = useState(() => searchParams.get("startDate") || "");
  const [dateTo, setDateTo] = useState(() => searchParams.get("endDate") || "");
  const [successFilter, setSuccessFilter] = useState(() => searchParams.get("success") || "");

  // Expand detail
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const takeLatestAudit = useLatestRequest();
  const fetchAudit = useCallback(async () => {
    const isLatest = takeLatestAudit();
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (eventType) params.set("event", eventType);
      if (debouncedClientId.trim()) params.set("clientId", debouncedClientId.trim());
      if (debouncedUserId.trim()) params.set("userId", debouncedUserId.trim());
      if (dateFrom) params.set("startDate", dateFrom);
      if (dateTo) params.set("endDate", dateTo);
      if (successFilter) params.set("success", successFilter);
      // URL 仅在生效查询值变化后同步，避免每次击键都写 URL
      const qs = params.toString();
      router.replace(`/admin/oauth/audit${qs ? `?${qs}` : ""}`, { scroll: false });
      const data = await apiGet<AuditResponse>(`/api/admin/oauth/audit?${params.toString()}`);
      if (!isLatest()) return;
      setEntries(data.items);
      setTotal(data.pagination.total);
      setLoadError(false);
    } catch (err) {
      if (!isLatest()) return;
      setLoadError(true);
      toast.error(err instanceof Error ? err.message : "获取审计日志失败");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [
    page,
    eventType,
    debouncedClientId,
    debouncedUserId,
    dateFrom,
    dateTo,
    successFilter,
    toast,
    router,
    takeLatestAudit,
  ]);

  useEffect(() => {
    deferInEffect(fetchAudit);
  }, [fetchAudit]);

  // 文本筛选防抖：输入停止 400ms 后才更新生效查询值，由 fetchAudit 统一发起请求。
  // 跳过首次执行，避免 ?page=N 深链在挂载后被重置回第 1 页。
  const filterDebounceMountedRef = useRef(false);
  useEffect(() => {
    if (!filterDebounceMountedRef.current) {
      filterDebounceMountedRef.current = true;
      return;
    }
    const handler = setTimeout(() => {
      setPage(1);
      setDebouncedClientId(searchClientId);
      setDebouncedUserId(searchUserId);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchClientId, searchUserId]);

  const handleSearch = () => {
    setPage(1);
    setDebouncedClientId(searchClientId);
    setDebouncedUserId(searchUserId);
  };

  const hasFilters = Boolean(
    eventType || searchClientId || searchUserId || dateFrom || dateTo || successFilter
  );

  const handleReset = () => {
    setEventType("");
    setSearchClientId("");
    setSearchUserId("");
    setDebouncedClientId("");
    setDebouncedUserId("");
    setDateFrom("");
    setDateTo("");
    setSuccessFilter("");
    setExpandedId(null);
    setPage(1);
  };

  const handleExportCsv = async () => {
    const params = new URLSearchParams();
    params.set("export", "csv");
    if (eventType) params.set("event", eventType);
    if (debouncedClientId.trim()) params.set("clientId", debouncedClientId.trim());
    if (debouncedUserId.trim()) params.set("userId", debouncedUserId.trim());
    if (dateFrom) params.set("startDate", dateFrom);
    if (dateTo) params.set("endDate", dateTo);
    if (successFilter) params.set("success", successFilter);
    setExporting(true);
    try {
      await downloadFromUrl(
        `/api/admin/oauth/audit?${params.toString()}`,
        `sso-audit-${new Date().toISOString().slice(0, 10)}.csv`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出失败，请稍后重试");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="SSO 审计日志"
        description="记录 SSO 系统所有关键事件，支持按事件类型、用户、Client 与时间范围追溯"
        actions={
          <>
            {canExport && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                disabled={exporting}
                leftIcon={<Download className="h-4 w-4" />}
              >
                {exporting ? "导出中..." : "导出 CSV（最多 5000 条）"}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={fetchAudit}>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              刷新
            </Button>
          </>
        }
      />

      {/* 筛选栏：条件按类型分组，窄屏自然换行 */}
      <div className="rounded-2xl border border-brand-charcoal/10 bg-white p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-full sm:w-40">
              <Select
                aria-label="按事件类型筛选"
                options={EVENT_TYPE_OPTIONS}
                value={eventType}
                onChange={(e) => {
                  setEventType(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="w-full sm:w-32">
              <Select
                aria-label="按结果筛选"
                options={SUCCESS_OPTIONS}
                value={successFilter}
                onChange={(e) => {
                  setSuccessFilter(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <div className="min-w-0 flex-1 sm:w-40 sm:flex-none">
                <DatePicker
                  aria-label="开始日期"
                  value={dateFrom}
                  onChange={(v) => {
                    setDateFrom(v);
                    setPage(1);
                  }}
                  placeholder="开始日期"
                />
              </div>
              <span className="text-sm text-brand-charcoal/65">至</span>
              <div className="min-w-0 flex-1 sm:w-40 sm:flex-none">
                <DatePicker
                  aria-label="结束日期"
                  value={dateTo}
                  onChange={(v) => {
                    setDateTo(v);
                    setPage(1);
                  }}
                  placeholder="结束日期"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-44">
              <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-charcoal/65" />
              <Input
                aria-label="按 Client ID 搜索"
                placeholder="搜索 Client ID"
                value={searchClientId}
                onChange={(e) => setSearchClientId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-10"
              />
            </div>
            <div className="relative w-full sm:w-44">
              <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-charcoal/65" />
              <Input
                aria-label="按用户 ID 搜索"
                placeholder="搜索用户 ID"
                value={searchUserId}
                onChange={(e) => setSearchUserId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-10"
              />
            </div>
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                leftIcon={<RotateCw className="h-4 w-4" />}
              >
                重置
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 移动端卡片 */}
      <MobileList
        loading={loading}
        error={
          loadError ? (
            <>
              <p className="text-red-500">加载失败</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={fetchAudit}>
                重试
              </Button>
            </>
          ) : undefined
        }
        empty="暂无数据，请调整筛选条件后重试"
        isEmpty={!loading && !loadError && entries.length === 0}
      >
        {entries.map((entry) => (
          <MobileListCard key={entry.id}>
            <div className="flex items-start justify-between gap-3">
              <Badge variant={getEventBadgeVariant(entry.event)}>
                {formatEventType(entry.event)}
              </Badge>
              <Badge variant={entry.success ? "success" : "danger"}>
                {entry.success ? "成功" : "失败"}
              </Badge>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-brand-charcoal/70">
              <span className="col-span-2 truncate font-mono">用户：{entry.userPhone || "-"}</span>
              <span className="col-span-2 truncate">
                Client：{entry.clientName || entry.clientId}
              </span>
              <span>IP：{entry.ip}</span>
              <span>{formatDate(entry.createdAt)}</span>
            </div>
            {entry.detail != null && (
              <div className="mt-2 border-t border-brand-charcoal/10 pt-2">
                <button
                  type="button"
                  onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                  className="flex items-center gap-1 text-xs text-brand-primary"
                >
                  {expandedId === entry.id ? "收起详情" : "展开详情"}
                  <ChevronDown
                    className={`h-3 w-3 transition-transform ${
                      expandedId === entry.id ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {expandedId === entry.id && (
                  <pre className="mt-2 max-h-40 overflow-x-auto rounded-lg border border-brand-charcoal/10 bg-white p-3 text-xs text-brand-charcoal/70">
                    {JSON.stringify(entry.detail, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </MobileListCard>
        ))}
      </MobileList>

      {/* 桌面端表格 */}
      <div className="hidden overflow-x-auto rounded-2xl border border-brand-charcoal/10 bg-white md:block">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-brand-charcoal/10 bg-brand-charcoal/[0.02] text-left">
              <th scope="col" className="px-4 py-3 font-normal">
                事件类型
              </th>
              <th scope="col" className="px-4 py-3 font-normal">
                用户
              </th>
              <th scope="col" className="px-4 py-3 font-normal">
                Client
              </th>
              <th scope="col" className="px-4 py-3 font-normal">
                IP
              </th>
              <th scope="col" className="px-4 py-3 font-normal">
                状态
              </th>
              <th scope="col" className="px-4 py-3 font-normal">
                时间
              </th>
              <th scope="col" className="px-4 py-3 font-normal">
                详情
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-charcoal/10">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} columns={7} />)
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="flex justify-center py-8">
                    <Empty
                      title="暂无审计日志"
                      description={
                        hasFilters
                          ? "当前筛选条件下没有事件，请调整筛选条件"
                          : "SSO 事件发生后会记录在这里"
                      }
                    />
                  </div>
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <React.Fragment key={entry.id}>
                  <tr className="hover:bg-brand-charcoal/[0.03]">
                    <td className="px-4 py-3">
                      <Badge variant={getEventBadgeVariant(entry.event)}>
                        {formatEventType(entry.event)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-brand-charcoal/80">
                      {entry.userPhone || "-"}
                    </td>
                    <td className="px-4 py-3">
                      <p className="truncate text-brand-charcoal/80">{entry.clientName || "-"}</p>
                      <p className="truncate font-mono text-xs text-brand-charcoal/65">
                        {entry.clientId}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-brand-charcoal/65">
                      {entry.ip}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={entry.success ? "success" : "danger"}>
                        {entry.success ? "成功" : "失败"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-brand-charcoal/65">
                      {formatDate(entry.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      {entry.detail ? (
                        <button
                          onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                          className="flex items-center gap-1 text-xs text-brand-primary hover:underline"
                        >
                          展开
                          <ChevronDown
                            className={`h-3 w-3 transition-transform ${expandedId === entry.id ? "rotate-180" : ""}`}
                          />
                        </button>
                      ) : (
                        <span className="text-xs text-brand-charcoal/65">-</span>
                      )}
                    </td>
                  </tr>
                  {expandedId === entry.id && entry.detail != null && (
                    <tr key={`${entry.id}-detail`} className="bg-brand-charcoal/[0.02]">
                      <td colSpan={7} className="px-4 py-3">
                        <pre className="max-h-40 overflow-x-auto rounded-lg border border-brand-charcoal/10 bg-white p-3 text-xs text-brand-charcoal/70">
                          {JSON.stringify(entry.detail, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className="flex justify-center">
          <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />
        </div>
      )}
    </div>
  );
}

export default function OAuthAuditPageWrapper() {
  return (
    <RequirePermission permission="sso:read">
      <Suspense fallback={<div className="py-8 text-center text-brand-charcoal/65">加载中...</div>}>
        <OAuthAuditPage />
      </Suspense>
    </RequirePermission>
  );
}
