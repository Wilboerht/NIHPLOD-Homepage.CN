"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Search, LogOut, Trash2, Key, ShieldCheck, Eye, X, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPost, apiDelete } from "@/lib/api-client";

interface Session {
  id: string;
  userId: string;
  phone: string;
  nickname: string;
  clientId: string;
  clientName: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string;
}

interface SessionsResponse {
  stats: {
    activeSessions: number;
    activeRefreshTokens: number;
  };
  items: Session[];
  pagination: { page: number; pageSize: number; total: number };
}

interface ClientOption {
  clientId: string;
  name: string;
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

const formatDateTime = (dateStr: string) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("zh-CN");
};

function OAuthSessionsPage() {
  const searchParams = useSearchParams();
  const toast = useToast();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [stats, setStats] = useState({ activeSessions: 0, activeRefreshTokens: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(() => {
    const p = searchParams.get("page");
    return p ? Math.max(1, parseInt(p, 10)) : 1;
  });
  const [loading, setLoading] = useState(true);
  const pageSize = 20;

  // Filters
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  const [searchClientId, setSearchClientId] = useState(() => searchParams.get("clientId") || "");
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);

  // Detail drawer
  const [detailSession, setDetailSession] = useState<Session | null>(null);

  // Terminate single session
  const [terminateTarget, setTerminateTarget] = useState<{ id: string; userId: string; clientId: string } | null>(null);
  const [showTerminate, setShowTerminate] = useState(false);
  const [terminating, setTerminating] = useState(false);

  // Batch terminate all
  const [showBatchTerminate, setShowBatchTerminate] = useState(false);
  const [batchTerminating, setBatchTerminating] = useState(false);
  const [batchConfirmText, setBatchConfirmText] = useState("");

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (search.trim()) params.set("search", search.trim());
      if (searchClientId.trim()) params.set("clientId", searchClientId.trim());
      const data = await apiGet<SessionsResponse>(
        `/api/admin/oauth/sessions?${params.toString()}`
      );
      setSessions(data.items);
      setStats(data.stats);
      setTotal(data.pagination.total);
    } catch {
      toast.error("获取会话列表失败");
    } finally {
      setLoading(false);
    }
  }, [page, search, searchClientId, toast]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // 加载 Client 下拉选项
  useEffect(() => {
    apiGet<{ clients: ClientOption[] }>("/api/admin/oauth-clients?pageSize=100")
      .then((res) => setClientOptions(res.clients))
      .catch(() => setClientOptions([]));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (page !== 1) params.set("page", String(page));
    else params.delete("page");
    if (search.trim()) params.set("search", search.trim());
    else params.delete("search");
    if (searchClientId.trim()) params.set("clientId", searchClientId.trim());
    else params.delete("clientId");
    const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState(null, "", newUrl);
  }, [page, search, searchClientId]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (page !== 1) setPage(1);
      else fetchSessions();
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  const handleSearch = () => {
    setPage(1);
  };

  const handleTerminate = async () => {
    if (!terminateTarget) return;
    setTerminating(true);
    try {
      await apiPost("/api/admin/oauth/sessions", {
        sessionId: terminateTarget.id,
      });
      toast.success("会话已终止");
      setShowTerminate(false);
      fetchSessions();
    } catch {
      toast.error("终止会话失败");
    } finally {
      setTerminating(false);
    }
  };

  const handleBatchTerminate = async () => {
    if (batchConfirmText !== "TERMINATE ALL") {
      toast.error("请输入 TERMINATE ALL 以确认批量终止");
      return;
    }
    setBatchTerminating(true);
    try {
      await apiDelete("/api/admin/oauth/sessions");
      toast.success("全部会话已终止");
      setShowBatchTerminate(false);
      setBatchConfirmText("");
      fetchSessions();
    } catch {
      toast.error("批量终止失败");
    } finally {
      setBatchTerminating(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">SSO 会话管理</h1>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm p-5 border-l-4 border-blue-500">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
              <Key className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">活跃会话数</p>
              <p className="text-2xl font-bold text-gray-900">{stats.activeSessions}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-5 border-l-4 border-green-500">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50">
              <ShieldCheck className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">活跃 Refresh Token 数</p>
              <p className="text-2xl font-bold text-gray-900">{stats.activeRefreshTokens}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3 justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-56">
              <Input
                placeholder="搜索手机号、昵称、Client ID/名称"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
            <div className="w-48">
              <Select
                value={searchClientId}
                onChange={(e) => { setSearchClientId(e.target.value); setPage(1); }}
                options={[
                  { value: "", label: "全部 Client" },
                  ...clientOptions.map((c) => ({ value: c.clientId, label: `${c.name} (${c.clientId})` })),
                ]}
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
          <Button
            variant="danger"
            onClick={() => setShowBatchTerminate(true)}
            leftIcon={<Trash2 className="w-4 h-4" />}
          >
            批量终止全部会话
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">用户手机号</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">用户昵称</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Client ID</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Scopes</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">创建时间</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">过期时间</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-500">
                  加载中...
                </td>
              </tr>
            ) : sessions.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-500">
                  暂无数据
                </td>
              </tr>
            ) : (
              sessions.map((s) => (
                <tr key={s.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">{s.phone || s.userId}</td>
                  <td className="px-4 py-3 text-sm">{s.nickname || "-"}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-600">{s.clientId}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {s.scopes.map((scope) => (
                        <Badge key={scope} variant="secondary" className="text-xs">
                          {scope}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(s.createdAt)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(s.expiresAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setDetailSession(s)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                        title="查看详情"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setTerminateTarget({ id: s.id, userId: s.userId, clientId: s.clientId });
                          setShowTerminate(true);
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                        title="终止会话"
                      >
                        <LogOut className="w-4 h-4" />
                      </button>
                    </div>
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

      {/* Terminate Single Session Confirm */}
      <ConfirmDialog
        open={showTerminate}
        onClose={() => setShowTerminate(false)}
        onConfirm={handleTerminate}
        type="danger"
        title="终止会话"
        description={`确定要终止用户 ${terminateTarget?.userId} 在 ${terminateTarget?.clientId} 的这条会话吗？该操作将立即注销该会话的 Token。`}
        confirmText="确定终止"
        loading={terminating}
      />

      {/* Batch Terminate Confirm */}
      <ConfirmDialog
        open={showBatchTerminate}
        onClose={() => { setShowBatchTerminate(false); setBatchConfirmText(""); }}
        onConfirm={handleBatchTerminate}
        type="danger"
        title="批量终止全部会话"
        description="此操作将使所有已登录用户强制注销，且不可撤销。请在下方输入 TERMINATE ALL 以确认。"
        confirmText="确定全部终止"
        loading={batchTerminating}
        confirmDisabled={batchConfirmText !== "TERMINATE ALL"}
      >
        <Input
          value={batchConfirmText}
          onChange={(e) => setBatchConfirmText(e.target.value)}
          placeholder="输入 TERMINATE ALL"
          className="mt-2"
        />
      </ConfirmDialog>

      {/* Detail Drawer */}
      {detailSession && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setDetailSession(null)}
          />
          <div className="relative w-full max-w-md bg-white shadow-xl h-full overflow-y-auto">
            <div className="p-6 space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">会话详情</h2>
                  <p className="text-sm text-gray-500 mt-1">Session ID: {detailSession.id}</p>
                </div>
                <button
                  onClick={() => setDetailSession(null)}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">用户信息</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">用户 ID</span>
                      <Link
                        href={`/admin/users?search=${encodeURIComponent(detailSession.userId)}`}
                        className="text-blue-600 hover:underline font-mono"
                      >
                        {detailSession.userId}
                      </Link>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">手机号</span>
                      <span>{detailSession.phone || "-"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">昵称</span>
                      <span>{detailSession.nickname || "-"}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Client 信息</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Client ID</span>
                      <span className="font-mono">{detailSession.clientId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Client 名称</span>
                      <span>{detailSession.clientName || "-"}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">权限范围（Scopes）</h3>
                  <div className="flex gap-2 flex-wrap">
                    {detailSession.scopes.map((s) => (
                      <Badge key={s} variant="secondary">{s}</Badge>
                    ))}
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">时间信息</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">创建时间</span>
                      <span>{formatDateTime(detailSession.createdAt)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">过期时间</span>
                      <span>{formatDateTime(detailSession.expiresAt)}</span>
                    </div>
                  </div>
                </div>

                <Link
                  href={`/admin/oauth/audit?userId=${detailSession.userId}&clientId=${detailSession.clientId}`}
                  className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                  onClick={() => setDetailSession(null)}
                >
                  <ExternalLink className="w-4 h-4" />
                  查看该用户/Client 的审计日志
                </Link>
              </div>

              <div className="flex gap-2 pt-4 border-t">
                <Button
                  variant="danger"
                  onClick={() => {
                    setDetailSession(null);
                    setTerminateTarget({
                      id: detailSession.id,
                      userId: detailSession.userId,
                      clientId: detailSession.clientId,
                    });
                    setShowTerminate(true);
                  }}
                  leftIcon={<LogOut className="w-4 h-4" />}
                >
                  终止会话
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OAuthSessionsPageWrapper() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-gray-500">加载中...</div>}>
      <OAuthSessionsPage />
    </Suspense>
  );
}
