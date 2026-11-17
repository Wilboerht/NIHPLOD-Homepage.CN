"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { RefreshCw, Search, X, XCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { formatDateTime as formatDate } from "@/lib/format";
import { RequirePermission, DataTable, type Column } from "@/components/admin";
import { PageHeader } from "@/components/admin/PageHeader";
import { AdminHubTabs } from "@/components/admin/AdminHubTabs";
import { IconButton } from "@/components/admin/IconButton";
import { useRowSelection } from "@/hooks/useRowSelection";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";

function maskPhone(phone: string): string {
  return phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");
}

interface Consent {
  id: string;
  userId: string;
  phone: string;
  nickname: string | null;
  clientId: string;
  clientName: string;
  scopes: string[];
  grantedAt: string;
  revokedAt: string | null;
  status: "active" | "revoked";
}

interface ConsentsResponse {
  items: Consent[];
  pagination: { page: number; pageSize: number; total: number };
  /** 搜索命中的用户/客户端超过上限被截断 */
  searchTruncated?: boolean;
}

const STATUS_TABS = [
  { value: "", label: "全部授权" },
  { value: "active", label: "已授权" },
  { value: "revoked", label: "已撤销" },
];

function OAuthConsentsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { requireTotp, totpModal } = useTotpConfirm();
  const { can: canAdmin } = useAdminPermissions();
  const canWrite = canAdmin("sso:write");
  const [consents, setConsents] = useState<Consent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(() => {
    const p = Number(searchParams.get("page"));
    return Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1;
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
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
      setLoadError(false);
    } catch (err) {
      if (!isLatest()) return;
      setLoadError(true);
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

  const hasFilters = Boolean(searchPhone || searchClientId || statusFilter);

  const handleReset = () => {
    setSearchPhone("");
    setSearchClientId("");
    setDebouncedPhone("");
    setDebouncedClientId("");
    setStatusFilter("");
    setPage(1);
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const submit = () =>
        apiPost("/api/admin/oauth/consents", {
          userId: revokeTarget.userId,
          clientId: revokeTarget.clientId,
        });
      try {
        await submit();
      } catch (err) {
        if (!isTotpRequired(err)) throw err;
        const verified = await requireTotp(err instanceof ApiError ? err.code : undefined);
        if (!verified) return;
        await submit();
      }
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
        const submit = () =>
          apiPost<{ revokedCount: number; revokedClients: number }>("/api/admin/oauth/consents", {
            userId,
            clientIds,
          });

        let res: { revokedCount: number; revokedClients: number };
        try {
          res = await submit();
        } catch (err) {
          if (!isTotpRequired(err)) throw err;
          const verified = await requireTotp(err instanceof ApiError ? err.code : undefined);
          if (!verified) return;
          res = await submit();
        }
        revokedCount += res.revokedClients ?? 0;
      }

      toast.success(
        `已撤销 ${byUser.size} 位用户在 ${revokedCount} 个客户端的授权`
      );
      selection.clear();
      setShowBatchRevoke(false);
      fetchConsents();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "批量撤销失败");
    } finally {
      setBatchRevoking(false);
    }
  };

  const activeConsents = consents.filter((c) => c.status === "active");

  const renderAction = (consent: Consent) => {
    if (consent.status !== "active") {
      return (
        <span
          className="text-xs text-ink-muted"
          title="用户下次访问该 Client 时需要重新授权"
        >
          需重新授权
        </span>
      );
    }
    if (!canWrite) {
      return <span className="text-xs text-ink-muted">只读</span>;
    }
    return (
      <Tooltip content="撤销授权" side="top">
        <IconButton
          label="撤销授权"
          variant="danger"
          onClick={() => {
            setRevokeTarget({
              userId: consent.userId,
              phone: consent.phone,
              clientId: consent.clientId,
              clientName: consent.clientName,
            });
            setShowRevoke(true);
          }}
        >
          <XCircle className="h-4 w-4" />
        </IconButton>
      </Tooltip>
    );
  };

  const columns: Column<Consent>[] = [
    ...(canWrite
      ? [
          {
            key: "select",
            title: (
              <input
                type="checkbox"
                checked={selection.isAllSelected(activeConsents)}
                onChange={(event) => selection.toggleAll(activeConsents, event.target.checked)}
                aria-label="全选已授权记录"
                className="h-4 w-4 rounded border-line-strong"
              />
            ),
            width: "44px",
            render: (_value: unknown, consent: Consent) =>
              consent.status === "active" ? (
                <input
                  type="checkbox"
                  checked={selection.isSelected(consent)}
                  onChange={() => selection.toggle(consent)}
                  aria-label={`选择 ${consent.phone || consent.userId} 的授权`}
                  className="h-4 w-4 rounded border-line-strong"
                />
              ) : null,
          },
        ]
      : []),
    {
      key: "phone",
      title: "用户手机号",
      width: "150px",
      render: (_value, consent) => (
        <Tooltip content="查看用户详情" side="top">
          <Link
            href={`/admin/users?search=${encodeURIComponent(consent.userId)}`}
            className="inline-flex text-brand-primary hover:underline"
          >
            {consent.phone ? maskPhone(consent.phone) : consent.userId}
          </Link>
        </Tooltip>
      ),
    },
    {
      key: "nickname",
      title: "用户昵称",
      width: "130px",
      render: (_value, consent) => (
        <span className="text-sm text-brand-charcoal/80">{consent.nickname || "-"}</span>
      ),
    },
    {
      key: "clientId",
      title: "Client",
      width: "220px",
      render: (_value, consent) => (
        <Tooltip content="查看 Client" side="top">
          <Link
            href={`/admin/oauth-clients?search=${encodeURIComponent(consent.clientId)}`}
            className="inline-flex flex-col text-brand-primary hover:underline"
          >
            <span>{consent.clientName || consent.clientId}</span>
            {consent.clientName && (
              <span className="font-mono text-xs text-ink-muted">{consent.clientId}</span>
            )}
          </Link>
        </Tooltip>
      ),
    },
    {
      key: "scopes",
      title: "Scopes",
      width: "220px",
      render: (_value, consent) => (
        <div className="flex flex-wrap gap-1">
          {consent.scopes.map((scope) => (
            <Badge key={scope} variant="secondary" className="text-xs">
              {scope}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: "grantedAt",
      title: "授权时间",
      width: "180px",
      render: (_value, consent) => (
        <span className="text-sm text-ink-muted">{formatDate(consent.grantedAt)}</span>
      ),
    },
    {
      key: "revokedAt",
      title: "撤销时间",
      width: "180px",
      render: (_value, consent) => (
        <span className="text-sm text-ink-muted">
          {consent.revokedAt ? formatDate(consent.revokedAt) : "-"}
        </span>
      ),
    },
    {
      key: "status",
      title: "状态",
      width: "100px",
      render: (_value, consent) => (
        <Badge variant={consent.status === "active" ? "success" : "danger"}>
          {consent.status === "active" ? "已授权" : "已撤销"}
        </Badge>
      ),
    },
    {
      key: "actions",
      title: "操作",
      width: "110px",
      align: "right",
      render: (_value, consent) => (
        <div className="text-right">{renderAction(consent)}</div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="SSO 用户授权管理"
        description="查看并撤销用户对 SSO 应用的授权记录"
        actions={
          <Button variant="outline" size="sm" onClick={fetchConsents}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            刷新
          </Button>
        }
      />

      <AdminHubTabs section="sso" />

      {/* 工具栏：状态分段筛选 + 精确搜索 */}
      <div className="rounded-card border border-line bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div
            role="group"
            aria-label="按授权状态筛选"
            className="flex flex-wrap items-center gap-1 rounded-xl bg-surface-muted p-1"
          >
            {STATUS_TABS.map((tab) => {
              const active = statusFilter === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setStatusFilter(tab.value);
                    setPage(1);
                  }}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40",
                    active
                      ? "bg-white font-medium text-brand-charcoal shadow-sm"
                      : "text-ink-muted hover:bg-white/70 hover:text-brand-charcoal"
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <Input
                aria-label="按用户手机号搜索"
                placeholder="搜索用户手机号"
                value={searchPhone}
                onChange={(e) => setSearchPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className={searchPhone ? "pl-10 pr-10" : "pl-10"}
              />
              {searchPhone && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchPhone("");
                    setDebouncedPhone("");
                    setPage(1);
                  }}
                  aria-label="清除手机号搜索"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-muted transition-colors hover:bg-surface-hover hover:text-brand-charcoal"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="relative w-full sm:w-56">
              <Input
                aria-label="按 Client ID 搜索"
                placeholder="Client ID"
                value={searchClientId}
                onChange={(e) => setSearchClientId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className={searchClientId ? "pr-10" : undefined}
              />
              {searchClientId && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchClientId("");
                    setDebouncedClientId("");
                    setPage(1);
                  }}
                  aria-label="清除 Client ID 搜索"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-muted transition-colors hover:bg-surface-hover hover:text-brand-charcoal"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                leftIcon={<X className="h-4 w-4" />}
              >
                清除筛选
              </Button>
            )}
          </div>
        </div>
      </div>

      {searchTruncated && (
        <p className="rounded-lg border border-status-warning-line bg-status-warning-soft px-4 py-2 text-sm text-status-warning-strong">
          匹配结果过多，仅统计前 500 个用户/客户端，请使用更精确的搜索条件。
        </p>
      )}

      {/* 批量操作栏 */}
      {canWrite && selection.selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-primary/15 bg-brand-primary/5 px-4 py-3">
          <span className="text-sm font-medium text-brand-charcoal">
            已选择 {selection.selectedCount} 条授权
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
            className="ml-auto text-sm text-ink-muted hover:text-brand-charcoal/80"
          >
            取消选择
          </button>
        </div>
      )}

      {/* 移动端卡片 */}
      <DataTable
        columns={columns}
        data={consents}
        loading={loading}
        error={loadError ? "加载失败，请稍后重试" : null}
        onRetry={fetchConsents}
        rowKey="id"
        minWidth="900px"
        emptyText="暂无授权记录"
        isFiltered={hasFilters}
        onClearFilters={handleReset}
        ariaLabel="OAuth 授权记录"
        pagination={
          total > 0 ? { page, pageSize, total, onChange: setPage } : undefined
        }
        mobileCard={(consent) => (
          <div>
            <div className="flex items-start gap-2">
              {canWrite && consent.status === "active" && (
                <label className="-ml-2 flex h-11 w-9 flex-shrink-0 items-center justify-center">
                  <input
                    type="checkbox"
                    checked={selection.isSelected(consent)}
                    onChange={() => selection.toggle(consent)}
                    aria-label={`选择 ${consent.phone || consent.userId} 的授权`}
                    className="h-4 w-4 rounded border-line-strong"
                  />
                </label>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/users?search=${encodeURIComponent(consent.userId)}`}
                      className="truncate font-medium text-brand-primary"
                    >
                      {consent.phone ? maskPhone(consent.phone) : consent.userId}
                    </Link>
                    {consent.nickname && (
                      <p className="mt-0.5 truncate text-xs text-brand-charcoal/70">
                        昵称：{consent.nickname}
                      </p>
                    )}
                    <p className="mt-0.5 truncate text-xs text-ink-muted">
                      Client：{consent.clientName || consent.clientId}
                    </p>
                  </div>
                  <Badge variant={consent.status === "active" ? "success" : "danger"}>
                    {consent.status === "active" ? "已授权" : "已撤销"}
                  </Badge>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {consent.scopes.slice(0, 3).map((scope) => (
                    <Badge key={scope} variant="secondary" className="text-xs">
                      {scope}
                    </Badge>
                  ))}
                  {consent.scopes.length > 3 && (
                    <span className="text-xs text-ink-muted">
                      +{consent.scopes.length - 3}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2">
              <span className="text-xs text-ink-muted">
                授权于 {formatDate(consent.grantedAt)}
                {consent.status === "revoked" && consent.revokedAt && (
                  <> · 撤销于 {formatDate(consent.revokedAt)}</>
                )}
              </span>
              {renderAction(consent)}
            </div>
          </div>
        )}
      />

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
      {totpModal}
    </div>
  );
}

export default function OAuthConsentsPageWrapper() {
  return (
    <RequirePermission permission="sso:read">
      <Suspense fallback={<div className="py-8 text-center text-ink-muted">加载中...</div>}>
        <OAuthConsentsPage />
      </Suspense>
    </RequirePermission>
  );
}
