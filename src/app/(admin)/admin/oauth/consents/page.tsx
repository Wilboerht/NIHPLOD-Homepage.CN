"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
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
import { apiGet, apiPost } from "@/lib/api-client";
import { RequireAdminRole } from "@/components/admin";

function maskForList(phone: string | null): string {
  if (!phone || phone.length < 7) return phone || "";
  return phone.slice(0, 3) + "****" + phone.slice(-4);
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
  const toast = useToast();
  const [consents, setConsents] = useState<Consent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(() => {
    const p = searchParams.get("page");
    return p ? Math.max(1, parseInt(p, 10)) : 1;
  });
  const [loading, setLoading] = useState(true);
  const pageSize = 20;

  // Filters
  const [searchPhone, setSearchPhone] = useState(() => searchParams.get("search") || "");
  const [searchClientId, setSearchClientId] = useState(() => searchParams.get("clientId") || "");
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status") || "");

  // Revoke confirm
  const [revokeTarget, setRevokeTarget] = useState<{ userId: string; clientId: string } | null>(null);
  const [showRevoke, setShowRevoke] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const fetchConsents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (searchPhone.trim()) params.set("search", searchPhone.trim());
      if (searchClientId.trim()) params.set("clientId", searchClientId.trim());
      if (statusFilter) params.set("status", statusFilter);
      const data = await apiGet<ConsentsResponse>(
        `/api/admin/oauth/consents?${params.toString()}`
      );
      setConsents(data.items);
      setTotal(data.pagination.total);
    } catch {
      toast.error("获取授权列表失败");
    } finally {
      setLoading(false);
    }
  }, [page, searchPhone, searchClientId, statusFilter, toast]);

  useEffect(() => {
    fetchConsents();
  }, [fetchConsents]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (page !== 1) params.set("page", String(page));
    else params.delete("page");
    if (searchPhone.trim()) params.set("search", searchPhone.trim());
    else params.delete("search");
    if (searchClientId.trim()) params.set("clientId", searchClientId.trim());
    else params.delete("clientId");
    if (statusFilter) params.set("status", statusFilter);
    else params.delete("status");
    const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState(null, "", newUrl);
  }, [page, searchPhone, searchClientId, statusFilter]);

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
    } catch {
      toast.error("撤销授权失败");
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">SSO 用户授权管理</h1>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
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
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            />
          </div>
          <Button
            variant="outline"
            onClick={handleSearch}
            leftIcon={<Search className="w-4 h-4" />}
          >
            搜索
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">用户手机号</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Client ID</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Scopes</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">授权时间</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">状态</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-500">
                  加载中...
                </td>
              </tr>
            ) : consents.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-500">
                  暂无数据
                </td>
              </tr>
            ) : (
              consents.map((c) => (
                <tr key={c.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">
                    <Tooltip content="查看用户详情" side="top">
                      <Link
                        href={`/admin/users?search=${encodeURIComponent(c.userId)}`}
                        className="inline-flex text-blue-600 hover:underline"
                      >
                        {maskForList(c.phone) || c.userId}
                      </Link>
                    </Tooltip>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    <Tooltip content="查看 Client" side="top">
                      <Link
                        href={`/admin/oauth-clients?search=${encodeURIComponent(c.clientId)}`}
                        className="inline-flex text-blue-600 hover:underline font-mono"
                      >
                        {c.clientName || c.clientId}
                      </Link>
                    </Tooltip>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {c.scopes.map((s) => (
                        <Badge key={s} variant="secondary" className="text-xs">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(c.grantedAt)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={c.status === "active" ? "success" : "danger"}>
                      {c.status === "active" ? "已授权" : "已撤销"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {c.status === "active" ? (
                      <Tooltip content="撤销授权" side="top">
                        <button
                          onClick={() => {
                            setRevokeTarget({ userId: c.userId, clientId: c.clientId });
                            setShowRevoke(true);
                          }}
                          className="inline-flex p-1.5 text-gray-400 hover:text-red-600 rounded"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </Tooltip>
                    ) : (
                      <span className="text-xs text-gray-400" title="用户下次访问该 Client 时需要重新授权">
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
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onChange={setPage}
          />
        </div>
      )}

      {/* Revoke Confirm */}
      <ConfirmDialog
        open={showRevoke}
        onClose={() => setShowRevoke(false)}
        onConfirm={handleRevoke}
        type="danger"
        title="撤销用户授权"
        description={`确定要撤销用户 ${revokeTarget?.userId} 对 ${revokeTarget?.clientId} 的授权吗？撤销后该用户将需要重新授权。`}
        confirmText="确定撤销"
        loading={revoking}
      />
    </div>
  );
}

export default function OAuthConsentsPageWrapper() {
  return (
    <RequireAdminRole role="owner">
      <Suspense fallback={<div className="p-6 text-center text-gray-500">加载中...</div>}>
        <OAuthConsentsPage />
      </Suspense>
    </RequireAdminRole>
  );
}
