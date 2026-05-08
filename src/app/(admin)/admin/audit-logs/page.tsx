"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { apiGet } from "@/lib/api-client";

interface AuditLogItem {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  detail: Record<string, unknown> | null;
  ipAddress: string | null;
  admin: { id: string; email: string; name: string } | null;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  login: "登录",
  logout: "登出",
  ship_order: "发货",
  refund_approve: "同意退款",
  refund_reject: "拒绝退款",
  create_admin: "创建管理员",
  update_admin: "更新管理员",
  delete_admin: "删除管理员",
  create_product: "创建产品",
  update_product: "更新产品",
  delete_product: "删除产品",
  batch_product: "批量操作产品",
  create_category: "创建分类",
  update_category: "更新分类",
  delete_category: "删除分类",
  create_job: "创建职位",
  update_job: "更新职位",
  delete_job: "删除职位",
  batch_job: "批量操作职位",
  update_application: "更新简历",
  delete_application: "删除简历",
  update_message: "更新留言",
  delete_message: "删除留言",
  batch_message: "批量操作留言",
  create_coupon: "创建优惠券",
  update_coupon: "更新优惠券",
  delete_coupon: "删除优惠券",
  run_cron_task: "执行定时任务",
};

const TARGET_TYPE_LABELS: Record<string, string> = {
  order: "订单",
  admin: "管理员",
  product: "产品",
  category: "分类",
  job: "职位",
  message: "留言",
  application: "简历",
  coupon: "优惠券",
  system: "系统",
};

export default function AuditLogsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });

  const page = parseInt(searchParams.get("page") || "1");
  const action = searchParams.get("action") || "";
  const targetType = searchParams.get("targetType") || "";

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ items: AuditLogItem[]; pagination: typeof pagination }>("/api/admin/audit-logs", {
        page,
        action: action || undefined,
        targetType: targetType || undefined,
      });
      setLogs(data.items);
      setPagination(data.pagination);
    } catch {
      console.error("获取审计日志失败");
    } finally {
      setLoading(false);
    }
  }, [page, action, targetType]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const updateParams = (newParams: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    if (!newParams.page) params.set("page", "1");
    router.push(`/admin/audit-logs?${params.toString()}`);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("zh-CN");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">审计日志</h1>
          <p className="mt-1 text-sm text-gray-500">记录管理端关键操作，便于追溯和合规审计</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs}>
          <RefreshCw className="h-4 w-4 mr-1" /> 刷新
        </Button>
      </div>

      {/* 筛选栏 */}
      <div className="flex flex-wrap gap-4 rounded-xl bg-white p-4 shadow-sm">
        <select
          value={action}
          onChange={(e) => updateParams({ action: e.target.value })}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">全部操作</option>
          {Object.entries(ACTION_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select
          value={targetType}
          onChange={(e) => updateParams({ targetType: e.target.value })}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">全部类型</option>
          {Object.entries(TARGET_TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* 日志列表 */}
      <div className="rounded-xl bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">时间</th>
              <th className="px-4 py-3">操作人</th>
              <th className="px-4 py-3">操作</th>
              <th className="px-4 py-3">目标类型</th>
              <th className="px-4 py-3">目标ID</th>
              <th className="px-4 py-3">IP地址</th>
              <th className="px-4 py-3">详情</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">加载中...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">暂无记录</td></tr>
            ) : logs.map((log) => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{formatDate(log.createdAt)}</td>
                <td className="px-4 py-3">
                  {log.admin ? (
                    <div>
                      <div className="font-medium">{log.admin.name}</div>
                      <div className="text-xs text-gray-400">{log.admin.email}</div>
                    </div>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                    {ACTION_LABELS[log.action] || log.action}
                  </span>
                </td>
                <td className="px-4 py-3">{TARGET_TYPE_LABELS[log.targetType] || log.targetType}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-400">{log.targetId || "-"}</td>
                <td className="px-4 py-3 text-gray-400">{log.ipAddress || "-"}</td>
                <td className="px-4 py-3">
                  {log.detail ? (
                    <pre className="text-xs text-gray-500 bg-gray-50 rounded p-1.5 max-w-[200px] overflow-auto">
                      {JSON.stringify(log.detail, null, 2)}
                    </pre>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: pagination.totalPages }, (_, i) => (
            <button
              key={i + 1}
              onClick={() => updateParams({ page: String(i + 1) })}
              className={`px-3 py-1 rounded ${page === i + 1 ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
