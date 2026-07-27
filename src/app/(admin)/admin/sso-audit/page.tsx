"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronDown, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import { apiGet } from "@/lib/api-client";

interface SsoAuditItem {
  id: string;
  event: string;
  userId: string | null;
  clientId: string | null;
  clientName: string | null;
  ip: string | null;
  userAgent: string | null;
  detail: Record<string, unknown> | null;
  success: boolean;
  createdAt: string;
}

interface SsoAuditResponse {
  items: SsoAuditItem[];
  pagination: { page: number; pageSize: number; total: number };
}

const EVENT_LABELS: Record<string, string> = {
  authorize: "授权",
  token: "Token 签发",
  introspect: "Token 验证",
  logout: "登出",
  userinfo: "用户信息",
  backchannel_logout: "后台登出",
  consent: "授权确认",
  status_change: "状态变更",
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString("zh-CN");
};

export default function SsoAuditPage() {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<SsoAuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [redirectSeconds, setRedirectSeconds] = useState(3);
  const pageSize = 20;

  // Filters
  const [filterEvent, setFilterEvent] = useState("");
  const [filterUserId, setFilterUserId] = useState("");
  const [filterClientId, setFilterClientId] = useState("");
  const [filterSuccess, setFilterSuccess] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  // Expand detail
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (filterEvent) params.set("event", filterEvent);
      if (filterUserId) params.set("userId", filterUserId);
      if (filterClientId) params.set("clientId", filterClientId);
      if (filterSuccess) params.set("success", filterSuccess);
      if (filterStartDate) params.set("startDate", filterStartDate);
      if (filterEndDate) params.set("endDate", filterEndDate);

      const data = await apiGet<SsoAuditResponse>(`/api/admin/sso-audit?${params.toString()}`);
      setItems(data.items);
      setTotal(data.pagination.total);
    } catch {
      toast.error("获取审计日志失败");
    } finally {
      setLoading(false);
    }
  }, [page, filterEvent, filterUserId, filterClientId, filterSuccess, filterStartDate, filterEndDate, toast]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    const timer = setInterval(() => {
      setRedirectSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push("/admin/oauth/audit");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [router]);

  return (
    <div className="p-6 space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800">页面已迁移</p>
          <p className="text-xs text-amber-600 mt-1">
            SSO 审计日志已合并到{" "}
            <button
              onClick={() => router.push("/admin/oauth/audit")}
              className="underline hover:text-amber-800"
            >
              /admin/oauth/audit
            </button>
            。{redirectSeconds} 秒后自动跳转。
          </p>
        </div>
      </div>

      <h1 className="text-2xl font-bold">SSO 审计日志</h1>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">事件类型</label>
            <Select
              value={filterEvent}
              onChange={(e) => { setFilterEvent(e.target.value); setPage(1); }}
              options={[
                { value: "", label: "全部" },
                ...Object.entries(EVENT_LABELS).map(([k, v]) => ({ value: k, label: v })),
              ]}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">用户 ID</label>
            <Input
              value={filterUserId}
              onChange={(e) => { setFilterUserId(e.target.value); setPage(1); }}
              placeholder="搜索用户"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">子项目</label>
            <Input
              value={filterClientId}
              onChange={(e) => { setFilterClientId(e.target.value); setPage(1); }}
              placeholder="搜索 clientId"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">结果</label>
            <Select
              value={filterSuccess}
              onChange={(e) => { setFilterSuccess(e.target.value); setPage(1); }}
              options={[
                { value: "", label: "全部" },
                { value: "true", label: "成功" },
                { value: "false", label: "失败" },
              ]}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">开始日期</label>
            <Input
              type="date"
              value={filterStartDate}
              onChange={(e) => { setFilterStartDate(e.target.value); setPage(1); }}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">结束日期</label>
            <Input
              type="date"
              value={filterEndDate}
              onChange={(e) => { setFilterEndDate(e.target.value); setPage(1); }}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">时间</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">事件</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">用户</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">子项目</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">IP</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">结果</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">详情</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-500">加载中...</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-500">暂无数据</td>
              </tr>
            ) : (
              items.map((item) => (
                <>
                  <tr key={item.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {formatDate(item.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className="text-xs">
                        {EVENT_LABELS[item.event] || item.event}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 font-mono max-w-[120px] truncate">
                      {item.userId || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-[150px] truncate">
                      {item.clientName || item.clientId || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 font-mono">
                      {item.ip || "-"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={item.success ? "success" : "danger"} className="text-xs">
                        {item.success ? "成功" : "失败"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {item.detail ? (
                        <button
                          onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                          className="text-blue-600 text-xs hover:underline flex items-center gap-1"
                        >
                          展开{" "}
                          <ChevronDown
                            className={`w-3 h-3 transition-transform ${expandedId === item.id ? "rotate-180" : ""}`}
                          />
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                  {expandedId === item.id && item.detail && (
                    <tr key={`${item.id}-detail`} className="bg-gray-50 border-b">
                      <td colSpan={7} className="px-4 py-3">
                        <pre className="text-xs text-gray-600 bg-gray-100 rounded p-3 overflow-x-auto max-h-40">
                          {JSON.stringify(item.detail, null, 2)}
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
