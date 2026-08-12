"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, Download, RotateCw, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { Pagination } from "@/components/ui/Pagination";
import { DatePicker } from "@/components/ui/DatePicker";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { apiGet } from "@/lib/api-client";
import { RequireAdminRole } from "@/components/admin";
import { deferInEffect } from "@/hooks/deferInEffect";

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

const EVENT_TYPE_OPTIONS = [
  { value: "", label: "全部事件" },
  { value: "authorize", label: "授权请求" },
  { value: "token", label: "Token 签发" },
  { value: "refresh", label: "Token 刷新" },
  { value: "introspect", label: "Token 验证" },
  { value: "userinfo", label: "用户信息" },
  { value: "revoke", label: "Token 吊销" },
  { value: "consent", label: "授权确认/撤销" },
  { value: "status_change", label: "状态变更" },
  { value: "logout", label: "登出" },
  { value: "backchannel_logout", label: "Backchannel 登出" },
  { value: "login", label: "登录" },
];

const SUCCESS_OPTIONS = [
  { value: "", label: "全部结果" },
  { value: "true", label: "成功" },
  { value: "false", label: "失败" },
];

const formatDate = (dateStr: string) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const formatEventType = (type: string): string => {
  const map: Record<string, string> = {
    authorize: "授权请求",
    token: "Token 签发",
    refresh: "Token 刷新",
    introspect: "Token 验证",
    userinfo: "用户信息",
    revoke: "Token 吊销",
    consent: "授权确认/撤销",
    status_change: "状态变更",
    logout: "登出",
    backchannel_logout: "Backchannel 登出",
    login: "登录",
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
    refresh: "secondary",
    introspect: "secondary",
    userinfo: "secondary",
    revoke: "warning",
    consent: "danger",
    status_change: "warning",
    logout: "outline",
    backchannel_logout: "outline",
    login: "primary",
  };
  return map[type] || "secondary";
};

function OAuthAuditPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(() => {
    const p = searchParams.get("page");
    return p ? Math.max(1, parseInt(p, 10)) : 1;
  });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const pageSize = 20;

  // Filters
  const [eventType, setEventType] = useState(() => searchParams.get("event") || "");
  const [searchClientId, setSearchClientId] = useState(() => searchParams.get("clientId") || "");
  const [searchUserId, setSearchUserId] = useState(() => searchParams.get("userId") || "");
  const [dateFrom, setDateFrom] = useState(() => searchParams.get("startDate") || "");
  const [dateTo, setDateTo] = useState(() => searchParams.get("endDate") || "");
  const [successFilter, setSuccessFilter] = useState(() => searchParams.get("success") || "");

  // Expand detail
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (eventType) params.set("event", eventType);
      if (searchClientId.trim()) params.set("clientId", searchClientId.trim());
      if (searchUserId.trim()) params.set("userId", searchUserId.trim());
      if (dateFrom) params.set("startDate", dateFrom);
      if (dateTo) params.set("endDate", dateTo);
      if (successFilter) params.set("success", successFilter);
      const qs = params.toString();
      router.replace(`/admin/oauth/audit${qs ? `?${qs}` : ""}`, { scroll: false });
      const data = await apiGet<AuditResponse>(`/api/admin/oauth/audit?${params.toString()}`);
      setEntries(data.items);
      setTotal(data.pagination.total);
    } catch {
      toast.error("获取审计日志失败");
    } finally {
      setLoading(false);
    }
  }, [
    page,
    eventType,
    searchClientId,
    searchUserId,
    dateFrom,
    dateTo,
    successFilter,
    toast,
    router,
  ]);

  useEffect(() => {
    deferInEffect(fetchAudit);
  }, [fetchAudit]);

  const handleSearch = () => {
    setPage(1);
  };

  const handleReset = () => {
    setEventType("");
    setSearchClientId("");
    setSearchUserId("");
    setDateFrom("");
    setDateTo("");
    setSuccessFilter("");
    setExpandedId(null);
    setPage(1);
  };

  const handleExportCsv = () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set("export", "csv");
      if (eventType) params.set("event", eventType);
      if (searchClientId.trim()) params.set("clientId", searchClientId.trim());
      if (searchUserId.trim()) params.set("userId", searchUserId.trim());
      if (dateFrom) params.set("startDate", dateFrom);
      if (dateTo) params.set("endDate", dateTo);
      if (successFilter) params.set("success", successFilter);
      const w = window.open(`/api/admin/oauth/audit?${params.toString()}`, "_blank");
      if (!w) {
        toast.error("导出被浏览器拦截，请允许弹出窗口");
        return;
      }
    } catch {
      toast.error("导出失败");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-brand-charcoal">SSO 审计日志</h1>
          <p className="mt-1 text-sm text-brand-charcoal/50">记录 SSO 系统所有关键事件</p>
        </div>
        <Button
          variant="outline"
          onClick={handleExportCsv}
          disabled={exporting}
          leftIcon={<Download className="h-4 w-4" />}
        >
          {exporting ? "导出中..." : "导出 CSV"}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <Select
              options={EVENT_TYPE_OPTIONS}
              value={eventType}
              onChange={(e) => {
                setEventType(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-44">
            <Input
              placeholder="Client ID"
              value={searchClientId}
              onChange={(e) => setSearchClientId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>
          <div className="w-44">
            <Input
              placeholder="用户 ID"
              value={searchUserId}
              onChange={(e) => setSearchUserId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>
          <div className="w-36">
            <DatePicker
              value={dateFrom}
              onChange={(v) => {
                setDateFrom(v);
                setPage(1);
              }}
              placeholder="开始日期"
            />
          </div>
          <div className="w-36">
            <DatePicker
              value={dateTo}
              onChange={(v) => {
                setDateTo(v);
                setPage(1);
              }}
              placeholder="结束日期"
            />
          </div>
          <div className="w-32">
            <Select
              options={SUCCESS_OPTIONS}
              value={successFilter}
              onChange={(e) => {
                setSuccessFilter(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Button
            variant="outline"
            onClick={handleSearch}
            leftIcon={<Search className="h-4 w-4" />}
          >
            搜索
          </Button>
          <Button
            variant="outline"
            onClick={handleReset}
            leftIcon={<RotateCw className="h-4 w-4" />}
          >
            重置
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full">
          <thead className="border-b border-brand-charcoal/10 bg-brand-charcoal/[0.02]">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-brand-charcoal/60">
                事件类型
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-brand-charcoal/60">
                用户
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-brand-charcoal/60">
                Client ID
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-brand-charcoal/60">
                Client Name
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-brand-charcoal/60">IP</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-brand-charcoal/60">
                状态
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-brand-charcoal/60">
                时间
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-brand-charcoal/60">
                详情
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} columns={8} />)
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-brand-charcoal/50">
                  暂无数据
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <React.Fragment key={entry.id}>
                  <tr
                    key={entry.id}
                    className="border-b border-brand-charcoal/[0.06] hover:bg-brand-charcoal/[0.03]"
                  >
                    <td className="px-4 py-3">
                      <Badge variant={getEventBadgeVariant(entry.event)}>
                        {formatEventType(entry.event)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-brand-charcoal/80">
                      {entry.userPhone || "-"}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-brand-charcoal/80">
                      {entry.clientId}
                    </td>
                    <td className="px-4 py-3 text-sm">{entry.clientName || "-"}</td>
                    <td className="px-4 py-3 font-mono text-sm text-brand-charcoal/50">
                      {entry.ip}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={entry.success ? "success" : "danger"}>
                        {entry.success ? "成功" : "失败"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-brand-charcoal/50">
                      {formatDate(entry.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      {entry.detail ? (
                        <button
                          onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                        >
                          展开
                          <ChevronDown
                            className={`h-3 w-3 transition-transform ${expandedId === entry.id ? "rotate-180" : ""}`}
                          />
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                  {expandedId === entry.id && entry.detail != null && (
                    <tr
                      key={`${entry.id}-detail`}
                      className="border-b border-brand-charcoal/[0.06] bg-brand-charcoal/[0.03]"
                    >
                      <td colSpan={8} className="px-4 py-3">
                        <pre className="max-h-40 overflow-x-auto rounded bg-brand-charcoal/[0.03] p-3 text-xs text-brand-charcoal/70">
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

      {total > pageSize && (
        <div className="mt-4">
          <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />
        </div>
      )}
    </div>
  );
}

export default function OAuthAuditPageWrapper() {
  return (
    <RequireAdminRole role="owner">
      <Suspense fallback={<div className="py-8 text-center text-brand-charcoal/50">加载中...</div>}>
        <OAuthAuditPage />
      </Suspense>
    </RequireAdminRole>
  );
}
