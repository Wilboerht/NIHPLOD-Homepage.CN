"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, Mail, MailOpen, Trash2, Clock, Copy, X, Eye, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import { Empty } from "@/components/ui/Empty";
import { cn } from "@/lib/utils";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/lib/api-client";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useRowSelection } from "@/hooks/useRowSelection";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { useListQuery } from "@/hooks/useListQuery";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";
import { formatRelativeTime } from "@/lib/format";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { PageHeader } from "@/components/admin/PageHeader";
import { IconButton } from "@/components/admin/IconButton";

interface Message {
  id: string;
  name: string;
  phone: string;
  type: string | null;
  content: string;
  read: boolean;
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
}

const MESSAGE_TYPE_LABELS: Record<string, string> = {
  consultation: "产品咨询",
  cooperation: "商务合作",
  feedback: "使用反馈",
  complaint: "投诉建议",
  application: "入驻申请",
  other: "其他问题",
};

const STATUS_TABS = [
  { key: "all", label: "全部" },
  { key: "unread", label: "未读" },
  { key: "read", label: "已读" },
] as const;

const MESSAGE_TYPE_OPTIONS = [
  { value: "", label: "全部类型" },
  ...Object.entries(MESSAGE_TYPE_LABELS).map(([value, label]) => ({ value, label })),
];

function AdminMessagesContent() {
  const { get, getNumber, update } = useListQuery();
  const { success, error: showError } = useToast();
  const { can: canAdmin } = useAdminPermissions();
  const canDeleteMessages = canAdmin("messages:delete");
  const canWriteMessages = canAdmin("messages:write");
  const canReadSensitivePhone = canAdmin("messages:sensitive:read");
  const { requireTotp, totpModal } = useTotpConfirm();
  const [revealedPhone, setRevealedPhone] = useState<string | null>(null);

  // 列表状态由 URL 派生
  const page = getNumber("page", 1);
  const pageSizeParam = getNumber("pageSize", 20, 1);
  const pageSize = [10, 20, 50, 100].includes(pageSizeParam) ? pageSizeParam : 20;
  const searchParam = get("search");
  const statusFilter = get("status", "all");
  const repliedFilter = get("replied", "all");
  const typeFilter = get("type");

  // 状态
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [total, setTotal] = useState(0);
  const [tabCounts, setTabCounts] = useState({ all: 0, unread: 0, read: 0 });
  const [search, setSearch] = useState(searchParam);
  const [prevSearchParam, setPrevSearchParam] = useState(searchParam);
  if (prevSearchParam !== searchParam) {
    setPrevSearchParam(searchParam);
    setSearch(searchParam);
  }
  // 勾选状态：翻页/搜索/筛选变化时自动清空
  const selection = useRowSelection<Message>(
    (m) => m.id,
    `${page}|${pageSize}|${searchParam}|${statusFilter}|${repliedFilter}|${typeFilter}`
  );
  const [batchActionLoading, setBatchActionLoading] = useState<string | null>(null);

  // 详情弹窗
  const [detailMessage, setDetailMessage] = useState<Message | null>(null);

  // 回复
  const [replyDraft, setReplyDraft] = useState("");
  const [replying, setReplying] = useState(false);
  const isReplyDirty = !!detailMessage && replyDraft !== (detailMessage.reply ?? "");
  const { confirmClose: confirmCloseReply } = useUnsavedChanges(isReplyDirty);

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);

  // 获取留言列表
  const takeLatestMessages = useLatestRequest();
  const fetchMessages = useCallback(async () => {
    const isLatest = takeLatestMessages();
    setLoading(true);
    try {
      const data = await apiGet<{
        items: Message[];
        pagination: { total: number };
        unreadCount: number;
        counts: { all: number; unread: number; read: number };
      }>("/api/admin/messages", {
        page,
        pageSize,
        search: searchParam,
        status: statusFilter === "all" ? undefined : statusFilter,
        replied: repliedFilter === "all" ? undefined : repliedFilter,
        type: typeFilter || undefined,
      });
      if (!isLatest()) return;
      setMessages(data.items);
      setTotal(data.pagination.total);
      setTabCounts(
        data.counts ?? {
          all: data.pagination.total,
          unread: data.unreadCount,
          read: Math.max(0, data.pagination.total - data.unreadCount),
        }
      );
      window.dispatchEvent(new CustomEvent("admin:messages-updated", { detail: data.unreadCount }));
      setLoadError(false);
    } catch {
      if (!isLatest()) return;
      setLoadError(true);
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [page, pageSize, searchParam, statusFilter, repliedFilter, typeFilter, takeLatestMessages]);

  useEffect(() => {
    deferInEffect(fetchMessages);
  }, [fetchMessages]);

  // 搜索防抖写入 URL
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = search.trim();
      if (next !== searchParam) {
        update({ search: next || null }, { replace: true });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, searchParam, update]);

  // URL 中 page 越界时收敛到最后一页
  useEffect(() => {
    const totalPages = Math.ceil(total / pageSize);
    if (totalPages > 0 && page > totalPages) {
      update({ page: String(totalPages) }, { replace: true, resetPage: false });
    }
  }, [page, total, pageSize, update]);

  // 标记已读（只读角色跳过，避免必然 403）
  const markAsRead = async (message: Message) => {
    if (message.read || !canWriteMessages) return;

    try {
      await apiPatch(`/api/admin/messages/${message.id}`, { read: true });
      setDetailMessage((prev) => (prev && prev.id === message.id ? { ...prev, read: true } : prev));
      fetchMessages();
    } catch {
      showError("标记失败");
    }
  };

  // 查看详情
  const viewDetail = async (message: Message) => {
    setRevealedPhone(null);
    setDetailMessage(message);
    setReplyDraft(message.reply ?? "");
    if (!message.read) {
      await markAsRead(message);
    }
  };

  // 显式揭示完整手机号：step-up + 服务端严格审计，失败则不返回明文
  const revealPhone = async () => {
    if (!detailMessage || revealedPhone) return;
    const submit = () =>
      apiPost<{ phone: string }>(`/api/admin/messages/${detailMessage.id}/reveal`);
    try {
      const data = await submit();
      setRevealedPhone(data.phone);
    } catch (err) {
      if (isTotpRequired(err)) {
        const verified = await requireTotp(err instanceof ApiError ? err.code : undefined);
        if (!verified) return;
        try {
          const data = await submit();
          setRevealedPhone(data.phone);
        } catch (retryError) {
          showError(retryError instanceof Error ? retryError.message : "查看完整号码失败");
        }
        return;
      }
      showError(err instanceof Error ? err.message : "查看完整号码失败");
    }
  };

  // 复制完整手机号（仅揭示成功后可用）
  const copyPhone = async (phone: string) => {
    try {
      await navigator.clipboard.writeText(phone);
      success("手机号已复制");
    } catch {
      showError("复制失败，请手动选择复制");
    }
  };

  // 发送/更新回复
  const handleReply = async () => {
    if (!detailMessage) return;
    const reply = replyDraft.trim();
    if (!reply) {
      showError("请输入备注内容");
      return;
    }

    setReplying(true);
    try {
      await apiPatch(`/api/admin/messages/${detailMessage.id}`, { reply });
      success(detailMessage.reply ? "备注已更新" : "备注已保存");
      const updated = {
        ...detailMessage,
        reply,
        repliedAt: new Date().toISOString(),
        read: true,
      };
      setDetailMessage(updated);
      fetchMessages();
    } catch {
      showError("备注保存失败");
    } finally {
      setReplying(false);
    }
  };

  // 切换已读状态（同步更新详情弹窗，避免弹窗与列表状态不一致）
  const toggleRead = async (message: Message) => {
    const nextRead = !message.read;
    try {
      await apiPatch(`/api/admin/messages/${message.id}`, { read: nextRead });
      success(nextRead ? "已标记为已读" : "已标记为未读");
      setDetailMessage((prev) =>
        prev && prev.id === message.id ? { ...prev, read: nextRead } : prev
      );
      fetchMessages();
    } catch {
      showError("操作失败");
    }
  };

  // 删除留言
  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      await apiDelete(`/api/admin/messages/${deleteTarget.id}`);
      success("留言已删除");
      setDeleteTarget(null);
      // 删光当前页最后一条时回退一页
      if (messages.length === 1 && page > 1) {
        update({ page: String(page - 1) }, { resetPage: false });
      } else {
        fetchMessages();
      }
    } catch {
      showError("删除失败");
    } finally {
      setDeleting(false);
    }
  };

  // 批量操作（返回是否成功，供确认弹窗决定是否关闭）
  const handleBatchAction = async (action: "read" | "unread" | "delete"): Promise<boolean> => {
    if (selection.selectedCount === 0) return false;
    setBatchActionLoading(action);

    try {
      const data = await apiPost<{ message: string }>("/api/admin/messages/batch", {
        ids: Array.from(selection.selectedIds),
        action,
      });

      success(data.message);
      // 批量删光当前页时回退一页
      const deletesWholePage =
        action === "delete" &&
        messages.length > 0 &&
        messages.every((m) => selection.selectedIds.has(m.id));
      selection.clear();
      if (deletesWholePage && page > 1) {
        update({ page: String(page - 1) }, { resetPage: false });
      } else {
        await fetchMessages();
      }
      return true;
    } catch (error) {
      showError(error instanceof Error ? error.message : "操作失败");
      return false;
    } finally {
      setBatchActionLoading(null);
    }
  };

  // 全选
  const handleSelectAll = (checked: boolean) => {
    selection.toggleAll(messages, checked);
  };

  const isAllSelected = selection.isAllSelected(messages);
  const isSelectionIndeterminate = selection.isIndeterminate(messages);
  const canSelect = canWriteMessages || canDeleteMessages;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="留言管理"
        description={
          <>
            共 {tabCounts.all} 条留言
            {tabCounts.unread > 0 && (
              <span className="ml-2 text-brand-primary">({tabCounts.unread} 条未读)</span>
            )}
          </>
        }
        actions={
          <Button variant="outline" size="sm" onClick={fetchMessages}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            刷新
          </Button>
        }
      />

      {/* 工具栏：搜索 + 筛选，与用户管理保持一致的单行布局 */}
      <div className="rounded-2xl border border-brand-charcoal/10 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full md:w-64 lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-charcoal/65" />
            <Input
              aria-label="搜索姓名、手机号或留言内容"
              placeholder="搜索姓名 / 手机号 / 内容"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={search ? "pl-10 pr-10" : "pl-10"}
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  update({ search: null }, { replace: true });
                }}
                aria-label="清除搜索"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-brand-charcoal/65 transition-colors hover:bg-brand-charcoal/[0.06] hover:text-brand-charcoal"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div
            role="group"
            aria-label="按阅读状态筛选"
            className="flex shrink-0 items-center gap-1 rounded-xl bg-brand-charcoal/[0.04] p-1"
          >
            {STATUS_TABS.map((t) => {
              const active = statusFilter === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => update({ status: t.key })}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40",
                    active
                      ? "bg-white font-medium text-brand-charcoal shadow-sm"
                      : "text-brand-charcoal/65 hover:bg-white/70 hover:text-brand-charcoal"
                  )}
                >
                  {t.label}
                  <span
                    className={cn(
                      "min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-xs tabular-nums",
                      active
                        ? "bg-brand-primary/10 text-brand-primary"
                        : "bg-brand-charcoal/[0.06] text-brand-charcoal/65"
                    )}
                  >
                    {tabCounts[t.key]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="w-full sm:w-36">
            <Select
              options={[
                { value: "all", label: "全部备注状态" },
                { value: "unreplied", label: "无备注" },
                { value: "replied", label: "有备注" },
              ]}
              value={repliedFilter}
              onChange={(e) => update({ replied: e.target.value })}
              aria-label="按备注状态筛选"
            />
          </div>
          <div className="w-full sm:w-36">
            <Select
              options={MESSAGE_TYPE_OPTIONS}
              value={typeFilter}
              onChange={(e) => update({ type: e.target.value })}
              aria-label="按留言类型筛选"
            />
          </div>

          {(search || statusFilter !== "all" || repliedFilter !== "all" || typeFilter) && (
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<X className="h-4 w-4" />}
              onClick={() => {
                setSearch("");
                update(
                  { search: null, status: null, replied: null, type: null },
                  { replace: true }
                );
              }}
            >
              清除筛选
            </Button>
          )}
        </div>
      </div>

      {/* 批量操作 */}
      {selection.selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-brand-primary/5 px-4 py-3">
          <span className="text-sm text-brand-charcoal/80">
            已选 <strong>{selection.selectedCount}</strong> 项
          </span>
          <div className="flex flex-wrap gap-2">
            {canWriteMessages && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBatchAction("read")}
                  loading={batchActionLoading === "read"}
                  disabled={batchActionLoading !== null && batchActionLoading !== "read"}
                >
                  标记已读
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBatchAction("unread")}
                  loading={batchActionLoading === "unread"}
                  disabled={batchActionLoading !== null && batchActionLoading !== "unread"}
                >
                  标记未读
                </Button>
              </>
            )}
            {canDeleteMessages && (
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 hover:bg-red-50"
                onClick={() => setShowBatchDeleteConfirm(true)}
                disabled={batchActionLoading !== null}
              >
                批量删除
              </Button>
            )}
          </div>
          <button
            type="button"
            onClick={selection.clear}
            className="ml-auto text-sm text-brand-charcoal/65 hover:text-brand-charcoal/80"
          >
            取消选择
          </button>
        </div>
      )}

      {/* 留言列表（移动端卡片） */}
      <div className="md:hidden">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-brand-charcoal/[0.04]" />
            ))}
          </div>
        ) : loadError ? (
          <div className="rounded-2xl border border-brand-charcoal/10 bg-white py-10 text-center">
            <p className="text-sm text-red-500">加载失败，请重试</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                setLoadError(false);
                fetchMessages();
              }}
            >
              重试
            </Button>
          </div>
        ) : messages.length === 0 ? (
          <div className="rounded-2xl border border-brand-charcoal/10 bg-white py-10">
            <Empty title="暂无留言" />
          </div>
        ) : (
          <div className="divide-y divide-brand-charcoal/10 rounded-2xl border border-brand-charcoal/10 bg-white">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn("p-4", !message.read && "bg-brand-primary/[0.03]")}
              >
                <div className="flex items-start gap-3">
                  {canSelect && (
                    <label className="-ml-2 flex h-11 w-9 flex-shrink-0 items-center justify-center">
                      <input
                        type="checkbox"
                        checked={selection.isSelected(message)}
                        onChange={() => selection.toggle(message)}
                        aria-label={`选择 ${message.name} 的留言`}
                        className="h-4 w-4 rounded border-brand-charcoal/20"
                      />
                    </label>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-brand-charcoal">
                          {message.name}
                        </p>
                        <p className="truncate text-xs text-brand-charcoal/65">{message.phone}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                        {message.type && (
                          <Badge variant="secondary" size="sm">
                            {MESSAGE_TYPE_LABELS[message.type] || message.type}
                          </Badge>
                        )}
                        <Badge variant={message.read ? "default" : "warning"} size="sm">
                          {message.read ? "已读" : "未读"}
                        </Badge>
                        {message.reply && (
                          <Badge variant="success" size="sm">
                            有备注
                          </Badge>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => viewDetail(message)}
                      aria-label={`查看 ${message.name} 的留言详情`}
                      className="mt-3 block w-full text-left"
                    >
                      <p className="line-clamp-2 text-sm text-brand-charcoal/70">
                        {message.content}
                      </p>
                    </button>
                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-brand-charcoal/10 pt-2">
                      <span className="flex items-center gap-1 text-xs text-brand-charcoal/65">
                        <Clock className="h-3.5 w-3.5" />
                        {formatRelativeTime(message.createdAt)}
                      </span>
                      <div className="flex items-center gap-1">
                        <IconButton label="查看留言" onClick={() => viewDetail(message)}>
                          <Eye className="h-4 w-4" />
                        </IconButton>
                        {canWriteMessages && (
                          <Tooltip content={message.read ? "标记为未读" : "标记为已读"} side="top">
                            <IconButton
                              label={message.read ? "标记为未读" : "标记为已读"}
                              onClick={() => toggleRead(message)}
                            >
                              {message.read ? (
                                <Mail className="h-4 w-4" />
                              ) : (
                                <MailOpen className="h-4 w-4" />
                              )}
                            </IconButton>
                          </Tooltip>
                        )}
                        {canDeleteMessages && (
                          <Tooltip content="删除" side="top">
                            <IconButton
                              label="删除留言"
                              variant="danger"
                              onClick={() => setDeleteTarget(message)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 留言列表（桌面端表格） */}
      <div className="hidden overflow-x-auto rounded-2xl border border-brand-charcoal/10 bg-white md:block">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-brand-charcoal/10 bg-brand-charcoal/[0.02] text-left">
              {canSelect && (
                <th scope="col" className="w-10 px-4 py-3 font-normal">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = isSelectionIndeterminate;
                    }}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    aria-label="全选本页留言"
                    className="h-4 w-4 rounded border-brand-charcoal/20"
                  />
                </th>
              )}
              <th scope="col" className="px-4 py-3 font-normal">
                留言人
              </th>
              <th scope="col" className="px-4 py-3 font-normal">
                类型
              </th>
              <th scope="col" className="px-4 py-3 font-normal">
                内容
              </th>
              <th scope="col" className="px-4 py-3 font-normal">
                状态
              </th>
              <th scope="col" className="px-4 py-3 font-normal">
                提交时间
              </th>
              <th scope="col" className="px-4 py-3 font-normal">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-charcoal/10">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRowSkeleton key={i} columns={canSelect ? 7 : 6} />
              ))
            ) : loadError ? (
              <tr>
                <td colSpan={canSelect ? 7 : 6} className="px-4 py-10 text-center">
                  <p className="text-sm text-red-500">加载失败，请重试</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => {
                      setLoadError(false);
                      fetchMessages();
                    }}
                  >
                    重试
                  </Button>
                </td>
              </tr>
            ) : messages.length === 0 ? (
              <tr>
                <td colSpan={canSelect ? 7 : 6}>
                  <div className="flex justify-center py-12">
                    <Empty title="暂无留言" />
                  </div>
                </td>
              </tr>
            ) : (
              messages.map((message) => (
                <tr
                  key={message.id}
                  className={cn(
                    "transition-colors hover:bg-brand-charcoal/[0.03]",
                    !message.read && "bg-brand-primary/[0.03]"
                  )}
                >
                  {canSelect && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selection.isSelected(message)}
                        onChange={() => selection.toggle(message)}
                        aria-label={`选择 ${message.name} 的留言`}
                        className="h-4 w-4 rounded border-brand-charcoal/20"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                          message.read
                            ? "bg-brand-charcoal/[0.06] text-brand-charcoal/70"
                            : "bg-brand-primary/10 text-brand-primary"
                        )}
                      >
                        {message.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p
                          className={cn(
                            "truncate text-sm",
                            message.read
                              ? "text-brand-charcoal/70"
                              : "font-medium text-brand-charcoal"
                          )}
                        >
                          {message.name}
                        </p>
                        <p className="truncate text-xs text-brand-charcoal/65">{message.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {message.type ? (
                      <Badge variant="secondary" size="sm">
                        {MESSAGE_TYPE_LABELS[message.type] || message.type}
                      </Badge>
                    ) : (
                      <span className="text-brand-charcoal/65">—</span>
                    )}
                  </td>
                  <td className="max-w-[320px] px-4 py-3">
                    <button
                      type="button"
                      onClick={() => viewDetail(message)}
                      aria-label={`查看 ${message.name} 的留言详情`}
                      className="block max-w-full truncate text-left text-sm text-brand-charcoal/70 hover:text-brand-charcoal"
                      title={message.content}
                    >
                      {message.content}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={message.read ? "default" : "warning"} size="sm">
                        {message.read ? "已读" : "未读"}
                      </Badge>
                      {message.reply && (
                        <Badge variant="success" size="sm">
                          有备注
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-brand-charcoal/65">
                    <span title={new Date(message.createdAt).toLocaleString("zh-CN")}>
                      {formatRelativeTime(message.createdAt)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <IconButton label="查看留言" onClick={() => viewDetail(message)}>
                        <Eye className="h-4 w-4" />
                      </IconButton>
                      {canWriteMessages && (
                        <Tooltip content={message.read ? "标记为未读" : "标记为已读"} side="top">
                          <IconButton
                            label={message.read ? "标记为未读" : "标记为已读"}
                            onClick={() => toggleRead(message)}
                          >
                            {message.read ? (
                              <Mail className="h-4 w-4" />
                            ) : (
                              <MailOpen className="h-4 w-4" />
                            )}
                          </IconButton>
                        </Tooltip>
                      )}
                      {canDeleteMessages && (
                        <Tooltip content="删除" side="top">
                          <IconButton
                            label="删除留言"
                            variant="danger"
                            onClick={() => setDeleteTarget(message)}
                          >
                            <Trash2 className="h-4 w-4" />
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

      {/* 分页（始终展示总数与每页条数） */}
      {total > 0 && (
        <div className="flex justify-center">
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onChange={(nextPage) => update({ page: String(nextPage) }, { resetPage: false })}
            onPageSizeChange={(size) => update({ pageSize: String(size) })}
          />
        </div>
      )}

      {/* 留言详情弹窗 */}
      <Modal
        open={!!detailMessage}
        onClose={() => {
          setDetailMessage(null);
          setRevealedPhone(null);
        }}
        title="留言详情"
        size="lg"
        mobileFullScreen
        closeOnBackdrop={false}
        closeGuard={() => !replying && confirmCloseReply()}
        footer={
          detailMessage && canWriteMessages ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-brand-charcoal/65">{replyDraft.length}/5000</span>
              <div className="flex flex-wrap justify-end gap-3">
                <Button variant="outline" onClick={() => toggleRead(detailMessage)}>
                  {detailMessage.read ? "标记为未读" : "标记为已读"}
                </Button>
                <Button onClick={handleReply} loading={replying} disabled={!replyDraft.trim()}>
                  {detailMessage.reply ? "更新备注" : "保存备注"}
                </Button>
              </div>
            </div>
          ) : undefined
        }
      >
        {detailMessage && (
          <div className="space-y-4">
            {/* 发送者与基本信息 */}
            <div className="space-y-3 rounded-lg bg-brand-charcoal/[0.03] p-4 text-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-sm font-medium text-brand-primary">
                  {detailMessage.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-brand-charcoal">{detailMessage.name}</span>
                    <Badge variant={detailMessage.read ? "default" : "warning"} size="sm">
                      {detailMessage.read ? "已读" : "未读"}
                    </Badge>
                    {detailMessage.reply && (
                      <Badge variant="success" size="sm">
                        有备注
                      </Badge>
                    )}
                  </div>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-brand-charcoal/65">
                    {revealedPhone ?? detailMessage.phone}
                    {canReadSensitivePhone && !revealedPhone && (
                      <Button variant="outline" size="sm" onClick={() => void revealPhone()}>
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        显示完整号码
                      </Button>
                    )}
                    {canReadSensitivePhone && revealedPhone && (
                      <Tooltip content="复制手机号" side="top">
                        <IconButton
                          label="复制手机号"
                          onClick={() => copyPhone(revealedPhone)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 border-t border-brand-charcoal/15 pt-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-brand-charcoal/65">类型</p>
                  <p className="mt-0.5 text-brand-charcoal/70">
                    {detailMessage.type
                      ? MESSAGE_TYPE_LABELS[detailMessage.type] || detailMessage.type
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-brand-charcoal/65">提交时间</p>
                  <p className="mt-0.5 text-brand-charcoal/70">
                    {new Date(detailMessage.createdAt).toLocaleString("zh-CN")}
                  </p>
                </div>
                {detailMessage.repliedAt && (
                  <div className="sm:col-span-2">
                    <p className="text-xs text-brand-charcoal/65">上次备注</p>
                    <p className="mt-0.5 text-brand-charcoal/70">
                      {new Date(detailMessage.repliedAt).toLocaleString("zh-CN")}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* 留言内容 */}
            <div className="rounded-lg border border-brand-charcoal/10 p-4">
              <p className="text-xs text-brand-charcoal/65">留言内容</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-brand-charcoal/80">
                {detailMessage.content}
              </p>
            </div>

            {/* 内部备注区域（不会发送给用户） */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-brand-charcoal">内部备注</h3>
                {detailMessage.repliedAt && (
                  <span className="text-xs text-brand-charcoal/65">
                    上次备注：{new Date(detailMessage.repliedAt).toLocaleString("zh-CN")}
                  </span>
                )}
              </div>
              <textarea
                value={replyDraft}
                onChange={(e) => setReplyDraft(e.target.value)}
                rows={4}
                maxLength={5000}
                disabled={!canWriteMessages}
                placeholder="仅供后台回访跟进，不会发送给用户"
                className="w-full resize-y rounded-lg border border-brand-charcoal/15 bg-white px-3 py-2 text-sm text-brand-charcoal placeholder:text-brand-charcoal/65 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
              {!canWriteMessages && (
                <p className="text-xs text-brand-charcoal/65">只读查看（无备注权限）</p>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* 删除确认 */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="确认删除"
        description={`确定要删除来自「${deleteTarget?.name}」的留言吗？此操作无法撤销。`}
        confirmText="删除"
        loading={deleting}
        type="danger"
      />

      {/* 批量删除确认 */}
      <ConfirmDialog
        open={showBatchDeleteConfirm}
        onClose={() => setShowBatchDeleteConfirm(false)}
        onConfirm={async () => {
          const ok = await handleBatchAction("delete");
          if (ok) setShowBatchDeleteConfirm(false);
        }}
        title="批量删除"
        description={`确定要删除选中的 ${selection.selectedCount} 项？此操作不可恢复。`}
        confirmText="确定删除"
        loading={batchActionLoading === "delete"}
        type="danger"
      />

      {totpModal}
    </div>
  );
}

export default function AdminMessagesPage() {
  return (
    <RequirePermission permission="messages:read">
      <AdminMessagesContent />
    </RequirePermission>
  );
}
