"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, Download, RotateCw, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import { apiGet } from "@/lib/api-client";

interface AuditEntry {
  id: string;
  event: string;
  userId: string;
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

const getEventBadgeVariant = (type: string): "primary" | "secondary" | "success" | "warning" | "danger" | "outline" => {
  const map: Record<string, "primary" | "secondary" | "success" | "warning" | "danger" | "outline"> = {
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
  return map[type] || "default";
};

export default function OAuthAuditPage() {
  const toast = useToast();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const pageSize = 20;

  // Filters
  const [eventType, setEventType] = useState("");
  const [searchClientId, setSearchClientId] = useState("");
  const [searchUserId, setSearchUserId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [successFilter, setSuccessFilter] = useState("");

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
      const data = await apiGet<AuditResponse>(
        `/api/admin/oauth/audit?${params.toString()}`
      );
      setEntries(data.items);
      setTotal(data.pagination.total);
    } catch {
      toast.error("获取审计日志失败");
    } finally {
      setLoading(false);
    }
  }, [page, eventType, searchClientId, searchUserId, dateFrom, dateTo, successFilter, toast]);

  useEffect(() => {
    fetchAudit();
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
      window.open(`/api/admin/oauth/audit?${params.toString()}`, "_blank");
    } catch {
      toast.error("导出失败");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">SSO 审计日志</h1>
        <Button
          variant="outline"
          onClick={handleExportCsv}
          disabled={exporting}
          leftIcon={<Download className="w-4 h-4" />}
        >
          {exporting ? "导出中..." : "导出 CSV"}
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <Select
              options={EVENT_TYPE_OPTIONS}
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
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
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              placeholder="开始日期"
            />
          </div>
          <div className="w-36">
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              placeholder="结束日期"
            />
          </div>
          <div className="w-32">
            <Select
              options={SUCCESS_OPTIONS}
              value={successFilter}
              onChange={(e) => setSuccessFilter(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            onClick={handleSearch}
            leftIcon={<Search className="w-4 h-4" />}
          >
            搜索
          </Button>
          <Button
            variant="outline"
            onClick={handleReset}
            leftIcon={<RotateCw className="w-4 h-4" />}
          >
            重置
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">事件类型</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">用户 ID</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Client ID</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Client Name</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">IP</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">状态</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">时间</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">详情</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-gray-500">
                  加载中...
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-gray-500">
                  暂无数据
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <>
                  <tr key={entry.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Badge variant={getEventBadgeVariant(entry.event)}>
                        {formatEventType(entry.event)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-600">{entry.userId}</td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-600">{entry.clientId}</td>
                    <td className="px-4 py-3 text-sm">{entry.clientName || "-"}</td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-500">{entry.ip}</td>
                    <td className="px-4 py-3">
                      <Badge variant={entry.success ? "success" : "danger"}>
                        {entry.success ? "成功" : "失败"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(entry.createdAt)}</td>
                    <td className="px-4 py-3">
                      {entry.detail ? (
                        <button
                          onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                          className="text-blue-600 text-xs hover:underline flex items-center gap-1"
                        >
                          展开
                          <ChevronDown
                            className={`w-3 h-3 transition-transform ${expandedId === entry.id ? "rotate-180" : ""}`}
                          />
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                  {expandedId === entry.id && entry.detail && (
                    <tr key={`${entry.id}-detail`} className="bg-gray-50 border-b">
                      <td colSpan={8} className="px-4 py-3">
                        <pre className="text-xs text-gray-600 bg-gray-100 rounded p-3 overflow-x-auto max-h-40">
                          {JSON.stringify(entry.detail, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > pageSize && (
        <div className="mt-4">
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onChange={setPage}
          />
        </div>
      )}
    </div>
  );
}
