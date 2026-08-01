"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw, Eye, FileJson } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Pagination } from "@/components/ui/Pagination";
import { Modal } from "@/components/ui/Modal";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { apiGet } from "@/lib/api-client";

interface AuditLogItem {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  detail: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
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
  oauth_client_create: "创建 SSO 客户端",
  oauth_client_update: "更新 SSO 客户端",
  oauth_client_delete: "删除 SSO 客户端",
  oauth_client_rotate_secret: "轮换 SSO 客户端密钥",
  oauth_client_test: "测试 SSO 客户端",
  oauth_consent_revoke: "撤销 SSO 授权",
  oauth_session_terminate: "终止 SSO 会话",
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
  oauth_client: "SSO 客户端",
};

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

export default function AuditLogsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });

  const page = parseInt(searchParams.get("page") || "1");
  const action = searchParams.get("action") || "";
  const targetType = searchParams.get("targetType") || "";

  // 模态框状态
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ items: AuditLogItem[]; pagination: typeof pagination }>(
        "/api/admin/audit-logs",
        {
          page,
          action: action || undefined,
          targetType: targetType || undefined,
        }
      );
      setLogs(data.items);
      setPagination(data.pagination);
    } catch {
      console.error("获取审计日志失败");
    } finally {
      setLoading(false);
    }
  }, [page, action, targetType]);

  useEffect(() => {
    fetchLogs();
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

  const openDetail = (log: AuditLogItem) => {
    setSelectedLog(log);
    setDetailOpen(true);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("zh-CN");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-brand-charcoal">审计日志</h1>
          <p className="mt-1 text-sm text-brand-charcoal/50">记录管理端关键操作，便于追溯和合规审计</p>
        </div>
        <Button variant="outline" size="sm" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={fetchLogs}>
          刷新
        </Button>
      </div>

      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-white p-4 shadow-sm">
        <Select
          options={[
            { value: "", label: "全部操作" },
            ...Object.entries(ACTION_LABELS).map(([key, label]) => ({ value: key, label })),
          ]}
          value={action}
          onChange={(e) => updateParams({ action: e.target.value })}
          className="w-40"
        />
        <Select
          options={[
            { value: "", label: "全部类型" },
            ...Object.entries(TARGET_TYPE_LABELS).map(([key, label]) => ({ value: key, label })),
          ]}
          value={targetType}
          onChange={(e) => updateParams({ targetType: e.target.value })}
          className="w-32"
        />
      </div>

      {/* 日志列表 */}
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-charcoal/10 bg-brand-charcoal/[0.02] text-left">
              <th scope="col" className="px-4 py-3">时间</th>
              <th scope="col" className="px-4 py-3">操作人</th>
              <th scope="col" className="px-4 py-3">操作</th>
              <th scope="col" className="px-4 py-3">目标类型</th>
              <th scope="col" className="px-4 py-3">目标ID</th>
              <th scope="col" className="px-4 py-3">IP地址</th>
              <th scope="col" className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRowSkeleton key={i} columns={7} />
              ))
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-brand-charcoal/50">
                  暂无记录
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr
                  key={log.id}
                  className="cursor-pointer hover:bg-brand-charcoal/[0.03]"
                  onClick={() => openDetail(log)}
                >
                  <td className="whitespace-nowrap px-4 py-3 text-brand-charcoal/50">
                    {formatDate(log.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    {log.admin ? (
                      <div>
                        <div className="font-medium">{log.admin.name}</div>
                        <div className="text-xs text-brand-charcoal/50">{log.admin.email}</div>
                      </div>
                    ) : (
                      <span className="text-brand-charcoal/50">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        ACTION_COLORS[log.action] || "bg-brand-charcoal/8 text-brand-charcoal/80"
                      }`}
                    >
                      {ACTION_LABELS[log.action] || log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {TARGET_TYPE_LABELS[log.targetType] || log.targetType}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-brand-charcoal/50">
                    {log.targetId || "-"}
                  </td>
                  <td className="px-4 py-3 text-brand-charcoal/50">{log.ipAddress || "-"}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDetail(log);
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      <div className="flex justify-center">
        <Pagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={pagination.total}
          onChange={(p) => updateParams({ page: String(p) })}
        />
      </div>

      {/* 详情模态框 */}
      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title="审计日志详情" size="lg">
        {selectedLog ? (
          <div className="space-y-5">
            {/* 操作摘要 */}
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  ACTION_COLORS[selectedLog.action] || "bg-brand-charcoal/8 text-brand-charcoal/80"
                }`}
              >
                {ACTION_LABELS[selectedLog.action] || selectedLog.action}
              </span>
              <span className="text-sm text-brand-charcoal/50">
                {TARGET_TYPE_LABELS[selectedLog.targetType] || selectedLog.targetType}
                {selectedLog.targetId && (
                  <span className="ml-1 font-mono text-xs text-brand-charcoal/50">
                    ({selectedLog.targetId})
                  </span>
                )}
              </span>
            </div>

            {/* 基本信息 */}
            <div className="grid gap-3 text-sm md:grid-cols-2">
              <div className="rounded-lg bg-brand-charcoal/[0.03] p-3">
                <dt className="mb-1 text-brand-charcoal/50">操作人</dt>
                <dd className="font-medium">
                  {selectedLog.admin
                    ? `${selectedLog.admin.name} (${selectedLog.admin.email})`
                    : "-"}
                </dd>
              </div>
              <div className="rounded-lg bg-brand-charcoal/[0.03] p-3">
                <dt className="mb-1 text-brand-charcoal/50">操作时间</dt>
                <dd className="font-medium">{formatDate(selectedLog.createdAt)}</dd>
              </div>
              <div className="rounded-lg bg-brand-charcoal/[0.03] p-3">
                <dt className="mb-1 text-brand-charcoal/50">IP 地址</dt>
                <dd className="font-mono font-medium">{selectedLog.ipAddress || "-"}</dd>
              </div>
              <div className="rounded-lg bg-brand-charcoal/[0.03] p-3">
                <dt className="mb-1 text-brand-charcoal/50">User-Agent</dt>
                <dd className="break-all text-xs font-medium">{selectedLog.userAgent || "-"}</dd>
              </div>
            </div>

            {/* JSON 详情 */}
            {selectedLog.detail ? (
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-brand-charcoal">
                  <FileJson className="h-4 w-4" />
                  操作详情
                </h4>
                <pre className="max-h-80 overflow-auto rounded-lg border border-brand-charcoal/8 bg-brand-charcoal/[0.03] p-4 text-xs text-brand-charcoal/60">
                  {JSON.stringify(selectedLog.detail, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="text-sm text-brand-charcoal/50">无详细记录</div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
