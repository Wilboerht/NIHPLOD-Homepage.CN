"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, LogOut, Trash2, Key, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
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

export default function OAuthSessionsPage() {
  const toast = useToast();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [stats, setStats] = useState({ activeSessions: 0, activeRefreshTokens: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const pageSize = 20;

  // Filters
  const [searchUserId, setSearchUserId] = useState("");
  const [searchClientId, setSearchClientId] = useState("");

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
      if (searchUserId.trim()) params.set("userId", searchUserId.trim());
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
  }, [page, searchUserId, searchClientId, toast]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

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
            <div className="w-48">
              <Input
                placeholder="用户 ID"
                value={searchUserId}
                onChange={(e) => setSearchUserId(e.target.value)}
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
    </div>
  );
}
