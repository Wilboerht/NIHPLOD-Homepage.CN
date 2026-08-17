"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
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
import { RequireAdminRole } from "@/components/admin";
import { deferInEffect } from "@/hooks/deferInEffect";

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
}

const formatDate = (dateStr: string) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "active", label: "已授权" },
  { value: "revoked", label: "已撤销" },
];

function OAuthConsentsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const [consents, setConsents] = useState<Consent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(() => {
    const p = searchParams.get("page");
    return p ? Math.max(1, parseInt(p, 10)) : 1;
  });
  const [loading, setLoading] = useState(true);
  const pageSize = 20;

  const [searchPhone, setSearchPhone] = useState(() => searchParams.get("search") || "");
  const [searchClientId, setSearchClientId] = useState(() => searchParams.get("clientId") || "");
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status") || "");

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
    if (searchPhone.trim()) params.set("search", searchPhone.trim());
    if (searchClientId.trim()) params.set("clientId", searchClientId.trim());
    if (statusFilter) params.set("status", statusFilter);
    const qs = params.toString();
    router.replace(`/admin/oauth/consents${qs ? `?${qs}` : ""}`);
  }, [page, searchPhone, searchClientId, statusFilter, router]);

  const fetchConsents = useCallback(async () => {
    setLoading(true);
    syncUrl();
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (searchPhone.trim()) params.set("search", searchPhone.trim());
      if (searchClientId.trim()) params.set("clientId", searchClientId.trim());
      if (statusFilter) params.set("status", statusFilter);
      const data = await apiGet<ConsentsResponse>(`/api/admin/oauth/consents?${params.toString()}`);
      setConsents(data.items);
      setTotal(data.pagination.total);
    } catch {
      toast.error("获取授权列表失败");
    } finally {
      setLoading(false);
    }
  }, [page, searchPhone, searchClientId, statusFilter, toast, syncUrl]);

  useEffect(() => {
    deferInEffect(fetchConsents);
  }, [fetchConsents]);

  const handleSearch = () => {
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
      fetchConsents();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "撤销授权失败");
    } finally {
      setRevoking(false);
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

      {/* Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full">
          <thead className="border-b border-brand-charcoal/10 bg-brand-charcoal/[0.02]">
            <tr>
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
              Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} columns={6} />)
            ) : consents.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-brand-charcoal/50">
                  暂无数据
                </td>
              </tr>
            ) : (
              consents.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-brand-charcoal/[0.06] hover:bg-brand-charcoal/[0.03]"
                >
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
    </div>
  );
}

export default function OAuthConsentsPageWrapper() {
  return (
    <RequireAdminRole role="owner">
      <Suspense fallback={<div className="py-8 text-center text-brand-charcoal/50">加载中...</div>}>
        <OAuthConsentsPage />
      </Suspense>
    </RequireAdminRole>
  );
}
