"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, XCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { apiGet, apiPost } from "@/lib/api-client";
import { formatDateTime as formatDate } from "@/lib/format";
import { RequirePermission } from "@/components/admin";
import { useRowSelection } from "@/hooks/useRowSelection";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useLatestRequest } from "@/hooks/useLatestRequest";

function maskPhone(phone: string): string {
  return phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");
}

interface Consent {
  id: string;
  userId: string;
  phone: string;
  clientId: string;
  clientName: string;
  scopes: string[];
  grantedAt: string;
  status: "active" | "revoked";
}

interface ConsentsResponse {
  items: Consent[];
  pagination: { page: number; pageSize: number; total: number };
  /** 搜索命中的用户/客户端超过上限被截断 */
  searchTruncated?: boolean;
}

const STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "active", label: "已授权" },
  { value: "revoked", label: "已撤销" },
];

function OAuthConsentsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { can: canAdmin } = useAdminPermissions();
  const canWrite = canAdmin("sso:write");
  const [consents, setConsents] = useState<Consent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(() => {
    const p = Number(searchParams.get("page"));
    return Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1;
  });
  const [loading, setLoading] = useState(true);
  const [searchTruncated, setSearchTruncated] = useState(false);
  const [showBatchRevoke, setShowBatchRevoke] = useState(false);
  const [batchRevoking, setBatchRevoking] = useState(false);
  const pageSize = 20;

  const [searchPhone, setSearchPhone] = useState(() => searchParams.get("search") || "");
  const [searchClientId, setSearchClientId] = useState(() => searchParams.get("clientId") || "");
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status") || "");

  // 防抖后的查询值：避免每次按键都发请求 + 改写 URL
  const [debouncedPhone, setDebouncedPhone] = useState(searchPhone.trim());
  const [debouncedClientId, setDebouncedClientId] = useState(searchClientId.trim());

  // 勾选状态：翻页/筛选/搜索变化时自动清空
  const selection = useRowSelection<Consent>(
    (c) => c.id,
    `${page}|${debouncedPhone}|${debouncedClientId}|${statusFilter}`
  );

  // 跳过首次执行，避免 ?page=N 深链在挂载后被重置回第 1 页
  const phoneDebounceMountedRef = useRef(false);
  const clientDebounceMountedRef = useRef(false);

  useEffect(() => {
    if (!phoneDebounceMountedRef.current) {
      phoneDebounceMountedRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedPhone(searchPhone.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchPhone]);

  useEffect(() => {
    if (!clientDebounceMountedRef.current) {
      clientDebounceMountedRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedClientId(searchClientId.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchClientId]);

  const [revokeTarget, setRevokeTarget] = useState<{
    userId: string;
    phone: string;
    clientId: string;
    clientName: string;
  } | null>(null);
  const [showRevoke, setShowRevoke] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const syncUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (page !== 1) params.set("page", String(page));
    if (debouncedPhone) params.set("search", debouncedPhone);
    if (debouncedClientId) params.set("clientId", debouncedClientId);
    if (statusFilter) params.set("status", statusFilter);
    const qs = params.toString();
    router.replace(`/admin/oauth/consents${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [page, debouncedPhone, debouncedClientId, statusFilter, router]);

  const takeLatestConsents = useLatestRequest();
  const fetchConsents = useCallback(async () => {
    const isLatest = takeLatestConsents();
    setLoading(true);
    syncUrl();
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (debouncedPhone) params.set("search", debouncedPhone);
      if (debouncedClientId) params.set("clientId", debouncedClientId);
      if (statusFilter) params.set("status", statusFilter);
      const data = await apiGet<ConsentsResponse>(`/api/admin/oauth/consents?${params.toString()}`);
      if (!isLatest()) return;
      setConsents(data.items);
      setTotal(data.pagination.total);
      setSearchTruncated(data.searchTruncated ?? false);
    } catch (err) {
      if (!isLatest()) return;
      toast.error(err instanceof Error ? err.message : "获取授权列表失败");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [page, debouncedPhone, debouncedClientId, statusFilter, toast, syncUrl, takeLatestConsents]);

  useEffect(() => {
    deferInEffect(fetchConsents);
  }, [fetchConsents]);

  /** Enter 立即搜索：跳过防抖等待 */
  const handleSearch = () => {
    setDebouncedPhone(searchPhone.trim());
    setDebouncedClientId(searchClientId.trim());
    setPage(1);
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await apiPost("/api/admin/oauth/consents", {
        userId: revokeTarget.userId,
        clientId: revokeTarget.clientId,
      });
      toast.success("授权已撤销");
      setShowRevoke(false);
      // 撤销的是本页最后一条时回退一页
      if (consents.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        fetchConsents();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "撤销授权失败");
    } finally {
      setRevoking(false);
    }
  };

  /** 批量撤销：按用户分组，一次请求撤销该用户在多个客户端的授权 */
  const handleBatchRevoke = async () => {
    if (selection.selectedCount === 0) return;
    setBatchRevoking(true);
    try {
      const byUser = new Map<string, string[]>();
      for (const consent of consents) {
        if (!selection.selectedIds.has(consent.id) || consent.status !== "active") continue;
        const clientIds = byUser.get(consent.userId) ?? [];
        clientIds.push(consent.clientId);
        byUser.set(consent.userId, clientIds);
      }
      if (byUser.size === 0) {
        toast.error("请选择状态为「已授权」的记录");
        return;
      }

      let revokedCount = 0;
      for (const [userId, clientIds] of byUser) {
        const res = await apiPost<{ revokedCount: number; revokedClients: number }>(
          "/api/admin/oauth/consents",
          { userId, clientIds }
        );
        revokedCount += res.revokedClients ?? 0;
      }

      toast.success(`已撤销 ${byUser.size} 位用户的 ${revokedCount} 条授权`);
      selection.clear();
      setShowBatchRevoke(false);
      fetchConsents();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "批量撤销失败");
    } finally {
      setBatchRevoking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-brand-charcoal">SSO 用户授权管理</h1>
          <p className="mt-1 text-sm text-brand-charcoal/50">管理用户对 SSO 应用的授权记录</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm">
        <div className="w-48">
          <Input
            placeholder="用户手机号"
            value={searchPhone}
            onChange={(e) => setSearchPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>
        <div className="w-48">
          <Input
            placeholder="Client ID"
            value={searchClientId}
            onChange={(e) => setSearchClientId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>
        <div className="w-36">
          <Select
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Button variant="outline" onClick={handleSearch} leftIcon={<Search className="h-4 w-4" />}>
          搜索
        </Button>
      </div>

      {searchTruncated && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
          匹配结果过多，仅统计前 500 个用户/客户端，请使用更精确的搜索条件。
        </p>
      )}

      {/* 批量操作栏 */}
      {canWrite && selection.selectedCount > 0 && (
        <div className="flex items-center gap-4 rounded-lg bg-brand-primary/5 px-4 py-3">
          <span className="text-sm text-brand-charcoal/80">
            已选择 <strong>{selection.selectedCount}</strong> 条授权
          </span>
          <Button
            size="sm"
            variant="danger"
            onClick={() => setShowBatchRevoke(true)}
            disabled={batchRevoking}
          >
            批量撤销
          </Button>
          <button
            onClick={selection.clear}
            className="ml-auto text-sm text-brand-charcoal/50 hover:text-brand-charcoal/80"
          >
            取消选择
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full">
          <thead className="border-b border-brand-charcoal/10 bg-brand-charcoal/[0.02]">
            <tr>
              {canWrite && (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selection.isAllSelected(consents.filter((c) => c.status === "active"))}
                    onChange={(e) =>
                      selection.toggleAll(
                        consents.filter((c) => c.status === "active"),
                        e.target.checked
                      )
                    }
                    aria-label="全选已授权记录"
                    className="h-4 w-4 rounded border-brand-charcoal/20"
                  />
                </th>
              )}
              <th className="px-4 py-3 text-left text-sm font-medium text-brand-charcoal/60">
                用户手机号
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-brand-charcoal/60">
                Client ID
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-brand-charcoal/60">
                Scopes
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-brand-charcoal/60">
                授权时间
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-brand-charcoal/60">
                状态
              </th>
              <th className="px-4 py-3 text-right text-sm font-medium text-brand-charcoal/60">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRowSkeleton key={i} columns={canWrite ? 7 : 6} />
              ))
            ) : consents.length === 0 ? (
              <tr>
                <td colSpan={canWrite ? 7 : 6} className="py-8 text-center text-brand-charcoal/50">
                  暂无数据
                </td>
              </tr>
            ) : (
              consents.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-brand-charcoal/[0.06] hover:bg-brand-charcoal/[0.03]"
                >
                  {canWrite && (
                    <td className="w-10 px-4 py-3">
                      {c.status === "active" ? (
                        <input
                          type="checkbox"
                          checked={selection.isSelected(c)}
                          onChange={() => selection.toggle(c)}
                          aria-label={`选择 ${c.phone || c.userId} 的授权`}
                          className="h-4 w-4 rounded border-brand-charcoal/20"
                        />
                      ) : null}
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm">
                    <Tooltip content="查看用户详情" side="top">
                      <Link
                        href={`/admin/users?search=${encodeURIComponent(c.userId)}`}
                        className="inline-flex text-blue-600 hover:underline"
                      >
                        {c.phone ? maskPhone(c.phone) : c.userId}
                      </Link>
                    </Tooltip>
                  </td>
                  <td className="px-4 py-3 text-sm text-brand-charcoal/80">
                    <Tooltip content="查看 Client" side="top">
                      <Link
                        href={`/admin/oauth-clients?search=${encodeURIComponent(c.clientId)}`}
                        className="inline-flex font-mono text-blue-600 hover:underline"
                      >
                        {c.clientName || c.clientId}
                      </Link>
                    </Tooltip>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.scopes.map((s) => (
                        <Badge key={s} variant="secondary" className="text-xs">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-brand-charcoal/50">
                    {formatDate(c.grantedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={c.status === "active" ? "success" : "danger"}>
                      {c.status === "active" ? "已授权" : "已撤销"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {c.status === "active" ? (
                      canWrite ? (
                        <Tooltip content="撤销授权" side="top">
                          <button
                            aria-label="撤销授权"
                            onClick={() => {
                              setRevokeTarget({
                                userId: c.userId,
                                phone: c.phone,
                                clientId: c.clientId,
                                clientName: c.clientName,
                              });
                              setShowRevoke(true);
                            }}
                            className="inline-flex rounded p-1.5 text-brand-charcoal/50 hover:text-red-600"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        </Tooltip>
                      ) : (
                        <span className="text-xs text-brand-charcoal/40">只读</span>
                      )
                    ) : (
                      <span
                        className="text-xs text-brand-charcoal/40"
                        title="用户下次访问该 Client 时需要重新授权"
                      >
                        需重新授权
                      </span>
                    )}
                  </td>
                </tr>
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

      {/* Revoke Confirm */}
      <ConfirmDialog
        open={showRevoke}
        onClose={() => setShowRevoke(false)}
        onConfirm={handleRevoke}
        type="danger"
        title="撤销用户授权"
        description={`确定要撤销用户 ${revokeTarget?.phone || revokeTarget?.userId} 对 ${revokeTarget?.clientName || revokeTarget?.clientId} 的授权吗？该用户在该应用的现有会话将立即失效并被登出，撤销后该用户将需要重新授权。`}
        confirmText="确定撤销"
        loading={revoking}
      />

      {/* 批量撤销确认 */}
      <ConfirmDialog
        open={showBatchRevoke}
        onClose={() => setShowBatchRevoke(false)}
        onConfirm={handleBatchRevoke}
        type="danger"
        title="批量撤销授权"
        description={`确定要撤销已选中的 ${selection.selectedCount} 条授权吗？涉及用户在这些应用的现有会话将立即失效并被登出，撤销后需重新授权。`}
        confirmText="确定撤销"
        loading={batchRevoking}
      />
    </div>
  );
}

export default function OAuthConsentsPageWrapper() {
  return (
    <RequirePermission permission="sso:read">
      <Suspense fallback={<div className="py-8 text-center text-brand-charcoal/50">加载中...</div>}>
        <OAuthConsentsPage />
      </Suspense>
    </RequirePermission>
  );
}
