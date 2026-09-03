"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw, Eye, FileJson, AlertCircle, Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Pagination } from "@/components/ui/Pagination";
import { Modal } from "@/components/ui/Modal";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { apiGet } from "@/lib/api-client";
import { deferInEffect } from "@/hooks/deferInEffect";

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
  update_order: "更新订单",
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
  batch_coupon: "批量操作优惠券",
  run_cron_task: "执行定时任务",
  user_points_adjust: "调整用户积分",
  update_vip_benefit: "更新会员权益",
  submit_spent_adjustment: "提交消费记录",
  approve_spent_adjustment: "通过消费记录",
  reject_spent_adjustment: "驳回消费记录",
  undo_spent_adjustment: "撤销消费记录",
  import_spent_records: "导入消费记录",
  undo_spent_import: "撤销消费导入",
  point_gift_create: "新增积分礼品",
  point_gift_update: "更新积分礼品",
  point_redemption_fulfill: "兑换履约",
  oauth_client_create: "创建 SSO 客户端",
  oauth_client_update: "更新 SSO 客户端",
  oauth_client_delete: "删除 SSO 客户端",
  oauth_client_rotate_secret: "轮换 SSO 客户端密钥",
  oauth_client_test: "测试 SSO 客户端",
  oauth_consent_revoke: "撤销 SSO 授权",
  oauth_session_terminate: "终止 SSO 会话",
  user_login: "用户登录",
  user_logout: "用户登出",
  user_register: "用户注册",
  user_reset_password: "用户重置密码",
  user_status_change: "用户状态变更",
  user_deleted: "用户删除",
  admin_login: "管理员登录",
  admin_logout: "管理员登出",
  create_application_folder: "创建简历文件夹",
  update_application_folder: "更新简历文件夹",
  delete_application_folder: "删除简历文件夹",
  reorder_categories: "重排分类",
  user_wechat_bind: "用户微信绑定",
  user_oauth_revoke: "用户 OAuth 撤销",
  refresh_token_reuse_detected: "检测到 Refresh Token 复用",
  user_set_password: "用户设置密码",
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
  user: "用户",
  application_folder: "简历文件夹",
  oauth_consent: "SSO 授权",
  vip: "会员",
  oauth_session: "SSO 会话",
  spent_adjustment: "消费记录",
  spent_import: "消费导入",
  point_gift: "积分礼品",
  point_redemption: "积分兑换",
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
  const [loadError, setLoadError] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });

  const page = parseInt(searchParams.get("page") || "1");
  const action = searchParams.get("action") || "";
  const targetType = searchParams.get("targetType") || "";
  const startDate = searchParams.get("startDate") || "";
  const endDate = searchParams.get("endDate") || "";

  // 模态框状态
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number | undefined> = {
        page,
        action: action || undefined,
        targetType: targetType || undefined,
      };
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const data = await apiGet<{ items: AuditLogItem[]; pagination: typeof pagination }>(
        "/api/admin/audit-logs",
        params
      );
      setLogs(data.items);
      setPagination(data.pagination);
      setLoadError(false);
    } catch {
      console.error("获取审计日志失败");
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [page, action, targetType, startDate, endDate]);

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
          <p className="mt-1 text-sm text-brand-charcoal/50">
            记录管理端关键操作，便于追溯和合规审计
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<RefreshCw className="h-4 w-4" />}
          onClick={fetchLogs}
        >
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
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => updateParams({ startDate: e.target.value })}
            className="h-9 rounded-lg border border-brand-charcoal/15 px-3 text-sm"
          />
          <span className="text-sm text-brand-charcoal/50">至</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => updateParams({ endDate: e.target.value })}
            className="h-9 rounded-lg border border-brand-charcoal/15 px-3 text-sm"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<Download className="h-4 w-4" />}
          onClick={() => {
            const params = new URLSearchParams();
            if (action) params.set("action", action);
            if (targetType) params.set("targetType", targetType);
            if (startDate) params.set("startDate", startDate);
            if (endDate) params.set("endDate", endDate);
            params.set("export", "csv");
            window.open(`/api/admin/audit-logs?${params.toString()}`, "_blank");
          }}
        >
          导出 CSV
        </Button>
      </div>

      {/* 日志列表 */}
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        {loading ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-charcoal/10 bg-brand-charcoal/[0.02] text-left">
                <th scope="col" className="px-4 py-3">
                  时间
                </th>
                <th scope="col" className="px-4 py-3">
                  操作人
                </th>
                <th scope="col" className="px-4 py-3">
                  操作
                </th>
                <th scope="col" className="px-4 py-3">
                  目标类型
                </th>
                <th scope="col" className="px-4 py-3">
                  目标ID
                </th>
                <th scope="col" className="px-4 py-3">
                  IP地址
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRowSkeleton key={i} columns={7} />
              ))}
            </tbody>
          </table>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-red-50 p-4">
              <AlertCircle className="h-8 w-8 text-red-400" />
            </div>
            <h2 className="mt-4 text-lg font-medium text-brand-charcoal">加载失败</h2>
            <p className="mt-1 text-sm text-brand-charcoal/50">无法获取审计日志，请检查网络连接</p>
            <button
              onClick={() => {
                setLoadError(false);
                fetchLogs();
              }}
              className="mt-4 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-primary/90"
            >
              重试
            </button>
          </div>
        ) : logs.length === 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-charcoal/10 bg-brand-charcoal/[0.02] text-left">
                <th scope="col" className="px-4 py-3">
                  时间
                </th>
                <th scope="col" className="px-4 py-3">
                  操作人
                </th>
                <th scope="col" className="px-4 py-3">
                  操作
                </th>
                <th scope="col" className="px-4 py-3">
                  目标类型
                </th>
                <th scope="col" className="px-4 py-3">
                  目标ID
                </th>
                <th scope="col" className="px-4 py-3">
                  IP地址
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-brand-charcoal/50">
                  暂无记录
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-charcoal/10 bg-brand-charcoal/[0.02] text-left">
                <th scope="col" className="px-4 py-3">
                  时间
                </th>
                <th scope="col" className="px-4 py-3">
                  操作人
                </th>
                <th scope="col" className="px-4 py-3">
                  操作
                </th>
                <th scope="col" className="px-4 py-3">
                  目标类型
                </th>
                <th scope="col" className="px-4 py-3">
                  目标ID
                </th>
                <th scope="col" className="px-4 py-3">
                  IP地址
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.map((log) => (
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
              ))}
            </tbody>
          </table>
        )}
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
                <pre className="border-brand-charcoal/8 max-h-80 overflow-auto rounded-lg border bg-brand-charcoal/[0.03] p-4 text-xs text-brand-charcoal/60">
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
