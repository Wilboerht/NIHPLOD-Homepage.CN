"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Search,
  LogOut,
  Trash2,
  Key,
  ShieldCheck,
  Eye,
  ExternalLink,
  RefreshCw,
  X,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { Empty } from "@/components/ui/Empty";
import { useToast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { apiGet, apiPost, apiDelete } from "@/lib/api-client";
import {
  formatDateTime as formatDate,
  formatDateTimeSeconds as formatFullDateTime,
} from "@/lib/format";
import { RequirePermission } from "@/components/admin";
import { PageHeader } from "@/components/admin/PageHeader";
import { MobileList, MobileListCard } from "@/components/admin/MobileList";
import { StatsCard } from "@/components/admin/StatsCard";
import { IconButton } from "@/components/admin/IconButton";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useLatestRequest } from "@/hooks/useLatestRequest";

function maskForList(phone: string | null): string {
  if (!phone || phone.length < 7) return phone || "";
  return phone.slice(0, 3) + "****" + phone.slice(-4);
}

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
    /** 全局活跃会话数（不受筛选影响，仅批量终止确认弹窗使用） */
    globalActiveSessions?: number;
  };
  items: Session[];
  pagination: { page: number; pageSize: number; total: number };
  searchTruncated?: boolean;
}

interface ClientOption {
  clientId: string;
  name: string;
}

function OAuthSessionsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { can: canAdmin } = useAdminPermissions();
  const canWrite = canAdmin("sso:write");
  const canReadClients = canAdmin("sso:clients:read");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [stats, setStats] = useState({
    activeSessions: 0,
    activeRefreshTokens: 0,
    globalActiveSessions: 0,
  });
  const [searchTruncated, setSearchTruncated] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(() => {
    const p = Number(searchParams.get("page"));
    return Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1;
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const pageSize = 20;

  // Filters
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  const [debouncedSearch, setDebouncedSearch] = useState(() => searchParams.get("search") || "");
  const [searchClientId, setSearchClientId] = useState(() => searchParams.get("clientId") || "");
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);

  // Detail drawer
  const [detailSession, setDetailSession] = useState<Session | null>(null);

  // Terminate single session
  const [terminateTarget, setTerminateTarget] = useState<{
    id: string;
    userId: string;
    phone: string;
    nickname: string;
    clientId: string;
  } | null>(null);
  const [showTerminate, setShowTerminate] = useState(false);
  const [terminating, setTerminating] = useState(false);

  // Batch terminate all
  const [showBatchTerminate, setShowBatchTerminate] = useState(false);
  const [batchTerminating, setBatchTerminating] = useState(false);
  const [batchConfirmText, setBatchConfirmText] = useState("");

  // 按用户终止会话（API 模式 B：{ userId, clientId? }）
  const [showUserTerminate, setShowUserTerminate] = useState(false);
  const [userTerminateId, setUserTerminateId] = useState("");
  const [userTerminateClientId, setUserTerminateClientId] = useState("");
  const [showUserTerminateConfirm, setShowUserTerminateConfirm] = useState(false);
  const [userTerminating, setUserTerminating] = useState(false);

  const takeLatestSessions = useLatestRequest();
  const fetchSessions = useCallback(async () => {
    const isLatest = takeLatestSessions();
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (searchClientId.trim()) params.set("clientId", searchClientId.trim());
      // Sync URL params（仅在生效查询值变化后同步，避免每次击键都写 URL）
      const qs = params.toString();
      router.replace(`/admin/oauth/sessions${qs ? `?${qs}` : ""}`, { scroll: false });
      const data = await apiGet<SessionsResponse>(`/api/admin/oauth/sessions?${params.toString()}`);
      if (!isLatest()) return;
      setSessions(data.items);
      setStats({
        activeSessions: data.stats.activeSessions,
        activeRefreshTokens: data.stats.activeRefreshTokens,
        globalActiveSessions: data.stats.globalActiveSessions ?? data.stats.activeSessions,
      });
      setSearchTruncated(data.searchTruncated ?? false);
      setTotal(data.pagination.total);
      setLoadError(false);
    } catch (err) {
      if (!isLatest()) return;
      setLoadError(true);
      toast.error(err instanceof Error ? err.message : "获取会话列表失败");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [page, debouncedSearch, searchClientId, toast, router, takeLatestSessions]);

  useEffect(() => {
    deferInEffect(fetchSessions);
  }, [fetchSessions]);

  // 加载 Client 下拉选项（需要 sso:clients:read；无权限时隐藏筛选器而不是静默空列表）
  useEffect(() => {
    if (!canReadClients) return;
    apiGet<{ clients: ClientOption[] }>("/api/admin/oauth-clients?pageSize=100")
      .then((res) => setClientOptions(res.clients))
      .catch(() => setClientOptions([]));
  }, [canReadClients]);

  // 搜索防抖：输入停止 400ms 后才更新生效查询值，由 fetchSessions 统一发起请求。
  // 跳过首次执行，避免 ?page=N 深链在挂载 400ms 后被重置回第 1 页。
  const searchDebounceMountedRef = useRef(false);
  useEffect(() => {
    if (!searchDebounceMountedRef.current) {
      searchDebounceMountedRef.current = true;
      return;
    }
    const handler = setTimeout(() => {
      setPage(1);
      setDebouncedSearch(search);
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  const handleSearch = () => {
    setPage(1);
    setDebouncedSearch(search);
  };

  const hasFilters = Boolean(search.trim() || searchClientId);

  const handleReset = () => {
    setSearch("");
    setDebouncedSearch("");
    setSearchClientId("");
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
      await apiDelete("/api/admin/oauth/sessions", { confirm: true });
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

  const openUserTerminate = (userId = "") => {
    setUserTerminateId(userId);
    setUserTerminateClientId("");
    setShowUserTerminate(true);
  };

  const handleUserTerminate = async () => {
    const userId = userTerminateId.trim();
    if (!userId) {
      toast.error("请输入用户 ID");
      return;
    }
    setUserTerminating(true);
    try {
      const data = await apiPost<{ terminatedCount: number }>("/api/admin/oauth/sessions", {
        userId,
        ...(userTerminateClientId ? { clientId: userTerminateClientId } : {}),
      });
      toast.success(`已终止该用户 ${data.terminatedCount} 个活跃会话`);
      setShowUserTerminateConfirm(false);
      setShowUserTerminate(false);
      setUserTerminateId("");
      setUserTerminateClientId("");
      fetchSessions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "按用户终止会话失败");
    } finally {
      setUserTerminating(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="SSO 会话管理"
        description="查看全站活跃 SSO 会话与 Refresh Token，可终止单个用户或全部会话"
        actions={
          <>
            {canWrite && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => openUserTerminate()}
                leftIcon={<LogOut className="h-4 w-4" />}
              >
                按用户终止
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={fetchSessions}>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              刷新
            </Button>
            {canWrite && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setShowBatchTerminate(true)}
                leftIcon={<Trash2 className="h-4 w-4" />}
              >
                终止全部会话
              </Button>
            )}
          </>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <StatsCard
          title="活跃会话数（全站）"
          value={stats.globalActiveSessions}
          description="未撤销且未过期的 OAuth 会话"
          icon={<Key className="h-5 w-5" />}
        />
        <StatsCard
          title="活跃 Refresh Token 数"
          value={stats.activeRefreshTokens}
          description="未撤销且未过期的刷新令牌"
          icon={<ShieldCheck className="h-5 w-5" />}
        />
      </div>

      {/* 工具栏：关键词与 Client 筛选 */}
      <div className="rounded-2xl border border-brand-charcoal/10 bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center md:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-charcoal/65" />
              <Input
                aria-label="搜索手机号、昵称、Client ID 或名称"
                placeholder="搜索手机号 / 昵称 / Client"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className={search ? "pl-10 pr-10" : "pl-10"}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setDebouncedSearch("");
                    setPage(1);
                  }}
                  aria-label="清除搜索"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-brand-charcoal/65 transition-colors hover:bg-brand-charcoal/[0.06] hover:text-brand-charcoal"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {canReadClients && (
              <div className="w-full sm:w-52">
                <Select
                  aria-label="按 Client 筛选"
                  value={searchClientId}
                  onChange={(e) => {
                    setSearchClientId(e.target.value);
                    setPage(1);
                  }}
                  options={[
                    { value: "", label: "全部 Client" },
                    ...clientOptions.map((c) => ({
                      value: c.clientId,
                      label: `${c.name} (${c.clientId})`,
                    })),
                  ]}
                />
              </div>
            )}
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
          <span className="text-sm text-brand-charcoal/65 md:ml-auto">共 {total} 条会话</span>
        </div>
      </div>

      {searchTruncated && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
          匹配结果过多，仅统计前 500 个用户/客户端，请使用更精确的搜索关键词。
        </p>
      )}

      {/* 移动端卡片 */}
      <MobileList
        loading={loading}
        error={
          loadError ? (
            <>
              <p className="text-red-500">加载失败</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={fetchSessions}>
                重试
              </Button>
            </>
          ) : undefined
        }
        empty="暂无会话数据"
        isEmpty={!loading && !loadError && sessions.length === 0}
      >
        {sessions.map((s) => (
          <MobileListCard key={s.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-brand-charcoal">
                  {s.nickname || "未设置昵称"}
                </p>
                <p className="truncate font-mono text-xs text-brand-charcoal/65">
                  {maskForList(s.phone) || s.userId}
                </p>
              </div>
              <div className="flex flex-shrink-0 gap-1">
                <IconButton label="查看会话详情" onClick={() => setDetailSession(s)}>
                  <Eye className="h-4 w-4" />
                </IconButton>
                {canWrite && (
                  <IconButton
                    label="终止会话"
                    variant="danger"
                    onClick={() => {
                      setTerminateTarget({
                        id: s.id,
                        userId: s.userId,
                        phone: s.phone,
                        nickname: s.nickname,
                        clientId: s.clientId,
                      });
                      setShowTerminate(true);
                    }}
                  >
                    <LogOut className="h-4 w-4" />
                  </IconButton>
                )}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {s.scopes.slice(0, 3).map((scope) => (
                <Badge key={scope} variant="secondary" className="text-xs">
                  {scope}
                </Badge>
              ))}
              {s.scopes.length > 3 && (
                <span className="text-xs text-brand-charcoal/65">+{s.scopes.length - 3}</span>
              )}
            </div>
            <p className="mt-1.5 truncate text-xs text-brand-charcoal/65">
              Client：{s.clientName || s.clientId}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-brand-charcoal/10 pt-2 text-xs text-brand-charcoal/65">
              <span>创建：{formatDate(s.createdAt)}</span>
              <span>过期：{formatDate(s.expiresAt)}</span>
            </div>
          </MobileListCard>
        ))}
      </MobileList>

      {/* 桌面端表格 */}
      <div className="hidden overflow-x-auto rounded-2xl border border-brand-charcoal/10 bg-white md:block">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-brand-charcoal/10 bg-brand-charcoal/[0.02] text-left">
              <th scope="col" className="px-4 py-3 font-normal">
                用户
              </th>
              <th scope="col" className="px-4 py-3 font-normal">
                Client
              </th>
              <th scope="col" className="px-4 py-3 font-normal">
                Scopes
              </th>
              <th scope="col" className="px-4 py-3 font-normal">
                创建时间
              </th>
              <th scope="col" className="px-4 py-3 font-normal">
                过期时间
              </th>
              <th scope="col" className="px-4 py-3 text-right font-normal">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-charcoal/10">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} columns={6} />)
            ) : sessions.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="flex justify-center py-8">
                    <Empty
                      title="暂无会话数据"
                      description={
                        hasFilters
                          ? "当前筛选条件下没有活跃会话，请调整筛选条件"
                          : "用户通过 SSO 登录后会话会显示在这里"
                      }
                    />
                  </div>
                </td>
              </tr>
            ) : (
              sessions.map((s) => (
                <tr key={s.id} className="hover:bg-brand-charcoal/[0.03]">
                  <td className="px-4 py-3">
                    <p className="truncate font-medium text-brand-charcoal/80">
                      {s.nickname || "未设置昵称"}
                    </p>
                    <p className="truncate font-mono text-xs text-brand-charcoal/65">
                      {maskForList(s.phone) || s.userId}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="truncate text-brand-charcoal/80">{s.clientName || "-"}</p>
                    <p className="truncate font-mono text-xs text-brand-charcoal/65">
                      {s.clientId}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {s.scopes.map((scope) => (
                        <Badge key={scope} variant="secondary" className="text-xs">
                          {scope}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-brand-charcoal/65">
                    {formatDate(s.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-sm text-brand-charcoal/65">
                    {formatDate(s.expiresAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Tooltip content="查看详情" side="top">
                        <IconButton label="查看详情" onClick={() => setDetailSession(s)}>
                          <Eye className="h-4 w-4" />
                        </IconButton>
                      </Tooltip>
                      {canWrite && (
                        <Tooltip content="终止会话" side="top">
                          <IconButton
                            label="终止会话"
                            variant="danger"
                            onClick={() => {
                              setTerminateTarget({
                                id: s.id,
                                userId: s.userId,
                                phone: s.phone,
                                nickname: s.nickname,
                                clientId: s.clientId,
                              });
                              setShowTerminate(true);
                            }}
                          >
                            <LogOut className="h-4 w-4" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className="flex justify-center">
          <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />
        </div>
      )}

      {/* Terminate Single Session Confirm */}
      <ConfirmDialog
        open={showTerminate}
        onClose={() => setShowTerminate(false)}
        onConfirm={handleTerminate}
        type="danger"
        title="终止会话"
        description={`确定要终止用户 ${terminateTarget?.phone || terminateTarget?.userId}${terminateTarget?.nickname ? `（${terminateTarget.nickname}）` : ""} 在 ${terminateTarget?.clientId} 的会话吗？该操作会级联注销该用户在此客户端的全部会话与 Refresh Token，无法撤销。`}
        confirmText="确定终止"
        loading={terminating}
      />

      {/* Batch Terminate Confirm */}
      <ConfirmDialog
        open={showBatchTerminate}
        onClose={() => {
          setShowBatchTerminate(false);
          setBatchConfirmText("");
        }}
        onConfirm={handleBatchTerminate}
        type="danger"
        title="批量终止全部会话"
        description={`此操作会终止全站 ${stats.globalActiveSessions ?? stats.activeSessions} 个活跃会话（忽略当前筛选条件），使所有已登录用户强制注销，且不可撤销。请在下方输入 TERMINATE ALL 以确认。`}
        confirmText="确定全部终止"
        loading={batchTerminating}
        confirmDisabled={batchConfirmText !== "TERMINATE ALL"}
      >
        <Input
          value={batchConfirmText}
          onChange={(e) => setBatchConfirmText(e.target.value)}
          aria-label="输入 TERMINATE ALL 以确认批量终止"
          data-autofocus
          placeholder="输入 TERMINATE ALL"
          className="mt-2"
        />
      </ConfirmDialog>

      {/* 按用户终止会话：输入用户标识（可从会话详情抽屉带入） */}
      <Modal
        open={showUserTerminate}
        onClose={() => setShowUserTerminate(false)}
        title="按用户终止会话"
        size="sm"
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="outline" onClick={() => setShowUserTerminate(false)}>
              取消
            </Button>
            <Button
              variant="danger"
              disabled={!userTerminateId.trim()}
              onClick={() => setShowUserTerminateConfirm(true)}
            >
              下一步
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="用户 ID"
            required
            data-autofocus
            value={userTerminateId}
            onChange={(e) => setUserTerminateId(e.target.value)}
            placeholder="输入要踢下线的用户 ID"
            hint="可在用户管理或会话详情中复制用户 ID"
          />
          {canReadClients ? (
            <Select
              label="限定应用（可选）"
              value={userTerminateClientId}
              onChange={(e) => setUserTerminateClientId(e.target.value)}
              options={[
                { value: "", label: "全部应用" },
                ...clientOptions.map((c) => ({
                  value: c.clientId,
                  label: `${c.name} (${c.clientId})`,
                })),
              ]}
            />
          ) : (
            <p className="text-xs text-brand-charcoal/65">
              当前账号无 Client 列表权限，将终止该用户全部应用的会话。
            </p>
          )}
        </div>
      </Modal>

      {/* 按用户终止确认：说明影响范围 */}
      <ConfirmDialog
        open={showUserTerminateConfirm}
        onClose={() => setShowUserTerminateConfirm(false)}
        onConfirm={handleUserTerminate}
        type="danger"
        title="按用户终止会话"
        description={
          userTerminateClientId
            ? `确定终止用户 ${userTerminateId.trim()} 在应用「${
                clientOptions.find((c) => c.clientId === userTerminateClientId)?.name ||
                userTerminateClientId
              }」的全部会话吗？该用户在该应用将立即被登出（含 Refresh Token 撤销），无法撤销。`
            : `确定终止用户 ${userTerminateId.trim()} 在全部应用的所有会话吗？该用户将在所有已登录应用中立即被登出（含 Refresh Token 撤销），无法撤销。`
        }
        confirmText="确定终止"
        loading={userTerminating}
      />

      {/* Detail Drawer（复用 Modal 的焦点陷阱/Esc/滚动锁/aria 语义） */}
      <Modal
        open={!!detailSession}
        onClose={() => setDetailSession(null)}
        title="会话详情"
        description={detailSession ? `Session ID: ${detailSession.id}` : undefined}
        variant="drawer"
        size="md"
      >
        {detailSession && (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="rounded-lg bg-brand-charcoal/[0.03] p-4">
                <h3 className="mb-3 text-sm font-medium text-brand-charcoal">用户信息</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-brand-charcoal/65">用户 ID</span>
                    <Link
                      href={`/admin/users?search=${encodeURIComponent(detailSession.userId)}`}
                      className="font-mono text-brand-primary hover:underline"
                    >
                      {detailSession.userId}
                    </Link>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-brand-charcoal/65">手机号</span>
                    <span>{detailSession.phone || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-brand-charcoal/65">昵称</span>
                    <span>{detailSession.nickname || "-"}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-brand-charcoal/[0.03] p-4">
                <h3 className="mb-3 text-sm font-medium text-brand-charcoal">Client 信息</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-brand-charcoal/65">Client ID</span>
                    <span className="font-mono">{detailSession.clientId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-brand-charcoal/65">Client 名称</span>
                    <span>{detailSession.clientName || "-"}</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium text-brand-charcoal">权限范围（Scopes）</h3>
                <div className="flex flex-wrap gap-2">
                  {detailSession.scopes.map((s) => (
                    <Badge key={s} variant="secondary">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="rounded-lg bg-brand-charcoal/[0.03] p-4">
                <h3 className="mb-3 text-sm font-medium text-brand-charcoal">时间信息</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-brand-charcoal/65">创建时间</span>
                    <span>{formatFullDateTime(detailSession.createdAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-brand-charcoal/65">过期时间</span>
                    <span>{formatFullDateTime(detailSession.expiresAt)}</span>
                  </div>
                </div>
              </div>

              <Link
                href={`/admin/oauth/audit?userId=${detailSession.userId}&clientId=${detailSession.clientId}`}
                className="flex items-center gap-2 text-sm text-brand-primary hover:underline"
                onClick={() => setDetailSession(null)}
              >
                <ExternalLink className="h-4 w-4" />
                查看该用户/Client 的审计日志
              </Link>
            </div>

            <div className="flex flex-wrap gap-2 border-t pt-4">
              {canWrite ? (
                <>
                  <Button
                    variant="danger"
                    onClick={() => {
                      setDetailSession(null);
                      setTerminateTarget({
                        id: detailSession.id,
                        userId: detailSession.userId,
                        phone: detailSession.phone,
                        nickname: detailSession.nickname,
                        clientId: detailSession.clientId,
                      });
                      setShowTerminate(true);
                    }}
                    leftIcon={<LogOut className="h-4 w-4" />}
                  >
                    终止会话
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDetailSession(null);
                      openUserTerminate(detailSession.userId);
                    }}
                    leftIcon={<LogOut className="h-4 w-4" />}
                  >
                    终止该用户全部会话
                  </Button>
                </>
              ) : (
                <span className="text-xs text-brand-charcoal/65">只读查看（无操作权限）</span>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function OAuthSessionsPageWrapper() {
  return (
    <RequirePermission permission="sso:read">
      <Suspense fallback={<div className="py-8 text-center text-brand-charcoal/65">加载中...</div>}>
        <OAuthSessionsPage />
      </Suspense>
    </RequirePermission>
  );
}
