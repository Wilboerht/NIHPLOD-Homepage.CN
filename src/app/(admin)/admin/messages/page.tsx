"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Mail, MailOpen, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import { Empty } from "@/components/ui/Empty";
import { cn } from "@/lib/utils";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api-client";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useRowSelection } from "@/hooks/useRowSelection";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { formatRelativeTime } from "@/lib/format";
import { RequirePermission } from "@/components/admin/RequirePermission";

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

function AdminMessagesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success, error: showError } = useToast();
  const { can: canAdmin } = useAdminPermissions();
  const canDeleteMessages = canAdmin("messages:delete");
  const canWriteMessages = canAdmin("messages:write");

  // 状态
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    const size = Number(searchParams.get("pageSize"));
    return Number.isFinite(size) && size >= 1 ? Math.floor(size) : 20;
  });
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("");
  // 勾选状态：翻页/搜索/筛选变化时自动清空
  const selection = useRowSelection<Message>(
    (m) => m.id,
    `${page}|${pageSize}|${debouncedSearch}|${statusFilter}|${typeFilter}`
  );
  const [batchActionLoading, setBatchActionLoading] = useState<string | null>(null);

  // 详情弹窗
  const [detailMessage, setDetailMessage] = useState<Message | null>(null);

  // 回复
  const [replyDraft, setReplyDraft] = useState("");
  const [replying, setReplying] = useState(false);

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
      }>("/api/admin/messages", {
        page,
        pageSize,
        search: debouncedSearch,
        status: statusFilter === "all" ? undefined : statusFilter,
        type: typeFilter || undefined,
      });
      if (!isLatest()) return;
      setMessages(data.items);
      setTotal(data.pagination.total);
      setUnreadCount(data.unreadCount);
      setLoadError(false);
    } catch {
      if (!isLatest()) return;
      setLoadError(true);
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, statusFilter, typeFilter, takeLatestMessages]);

  useEffect(() => {
    deferInEffect(fetchMessages);
  }, [fetchMessages]);

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

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
    setDetailMessage(message);
    setReplyDraft(message.reply ?? "");
    if (!message.read) {
      await markAsRead(message);
    }
  };

  // 发送/更新回复
  const handleReply = async () => {
    if (!detailMessage) return;
    const reply = replyDraft.trim();
    if (!reply) {
      showError("请输入回复内容");
      return;
    }

    setReplying(true);
    try {
      await apiPatch(`/api/admin/messages/${detailMessage.id}`, { reply });
      success(detailMessage.reply ? "回复已更新" : "回复已发送");
      const updated = {
        ...detailMessage,
        reply,
        repliedAt: new Date().toISOString(),
        read: true,
      };
      setDetailMessage(updated);
      fetchMessages();
    } catch {
      showError("回复失败");
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
        setPage(page - 1);
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
  const handleBatchAction = async (
    action: "read" | "unread" | "delete"
  ): Promise<boolean> => {
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
        setPage(page - 1);
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

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-brand-charcoal">留言管理</h1>
          <p className="mt-1 text-sm text-brand-charcoal/50">
            共 {total} 条留言
            {unreadCount > 0 && (
              <span className="ml-2 text-brand-primary">({unreadCount} 条未读)</span>
            )}
          </p>
        </div>
      </div>

      {/* 工具栏 */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-white p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="relative w-60">
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-charcoal/40" />
            <Input
              placeholder="搜索留言..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select
            options={[
              { value: "all", label: "全部状态" },
              { value: "unread", label: "未读" },
              { value: "read", label: "已读" },
            ]}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="w-32"
          />
          <Select
            options={[
              { value: "", label: "全部类型" },
              { value: "consultation", label: "产品咨询" },
              { value: "cooperation", label: "商务合作" },
              { value: "feedback", label: "使用反馈" },
              { value: "complaint", label: "投诉建议" },
              { value: "application", label: "入驻申请" },
              { value: "other", label: "其他问题" },
            ]}
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="w-32"
          />
        </div>

        {selection.selectedCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-brand-charcoal/50">
              已选 {selection.selectedCount} 项
            </span>
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
        )}
      </div>

      {/* 留言列表 */}
      <div className="rounded-xl bg-white shadow-sm">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-red-50 p-4">
              <Mail className="h-8 w-8 text-red-400" />
            </div>
            <h2 className="mt-4 text-lg font-medium text-brand-charcoal">加载失败</h2>
            <p className="mt-1 text-sm text-brand-charcoal/50">无法获取留言列表，请检查网络连接</p>
            <button
              onClick={() => {
                setLoadError(false);
                fetchMessages();
              }}
              className="mt-4 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-primary/90"
            >
              重试
            </button>
          </div>
        ) : messages.length === 0 ? (
          <Empty className="h-64" title="暂无留言" />
        ) : (
          <>
            {/* 表头 */}
            <div className="border-brand-charcoal/8 flex items-center gap-4 border-b px-6 py-3 text-sm font-medium text-brand-charcoal/50">
              {(canWriteMessages || canDeleteMessages) && (
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
              )}
              <span className="flex-1">留言内容</span>
              <span className="hidden w-32 sm:block">联系方式</span>
              <span className="hidden w-32 md:block">时间</span>
              <span className="w-24">操作</span>
            </div>

            {/* 列表 */}
            <div className="divide-brand-charcoal/8 divide-y">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex items-center gap-4 px-6 py-4 transition-colors hover:bg-brand-charcoal/[0.03]",
                    !message.read && "bg-brand-primary/5"
                  )}
                >
                  {/* 选择框 */}
                  {(canWriteMessages || canDeleteMessages) && (
                    <input
                      type="checkbox"
                      checked={selection.isSelected(message)}
                      onChange={() => selection.toggle(message)}
                      aria-label={`选择 ${message.name} 的留言`}
                      className="mt-1 h-4 w-4 rounded border-brand-charcoal/20"
                    />
                  )}

                  {/* 留言内容 */}
                  <div
                    className="min-w-0 flex-1 cursor-pointer"
                    onClick={() => viewDetail(message)}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium",
                          message.read
                            ? "bg-brand-charcoal/8 text-brand-charcoal/60"
                            : "bg-brand-primary/10 text-brand-primary"
                        )}
                      >
                        {message.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "font-medium",
                              message.read ? "text-brand-charcoal/60" : "text-brand-charcoal"
                            )}
                          >
                            {message.name}
                          </span>
                          <span className="text-sm text-brand-charcoal/50">{message.phone}</span>
                          {message.type && (
                            <Badge variant="secondary" size="sm">
                              {MESSAGE_TYPE_LABELS[message.type] || message.type}
                            </Badge>
                          )}
                          {!message.read && (
                            <Badge variant="warning" size="sm">
                              未读
                            </Badge>
                          )}
                          {message.reply && (
                            <Badge variant="success" size="sm">
                              已回复
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 truncate text-sm text-brand-charcoal/50">
                          {message.content}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 联系方式 */}
                  <div className="hidden w-32 items-center text-sm text-brand-charcoal/50 sm:flex">
                    {message.phone}
                  </div>

                  {/* 时间 */}
                  <div className="hidden w-32 items-center gap-1 text-sm text-brand-charcoal/50 md:flex">
                    <Clock className="h-3.5 w-3.5" />
                    {formatRelativeTime(message.createdAt)}
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex w-24 items-center gap-1">
                    {canWriteMessages && (
                      <Tooltip content={message.read ? "标记为未读" : "标记为已读"} side="top">
                        <button
                          onClick={() => toggleRead(message)}
                          className="rounded p-2 text-brand-charcoal/50 hover:bg-brand-charcoal/[0.06] hover:text-brand-charcoal"
                        >
                          {message.read ? (
                            <Mail className="h-4 w-4" />
                          ) : (
                            <MailOpen className="h-4 w-4" />
                          )}
                        </button>
                      </Tooltip>
                    )}
                    {canDeleteMessages && (
                      <Tooltip content="删除" side="top">
                        <button
                          onClick={() => setDeleteTarget(message)}
                          className="rounded p-2 text-brand-charcoal/50 hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 分页（始终展示总数与每页条数） */}
      {total > 0 && (
        <div className="flex justify-center">
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
              const params = new URLSearchParams(searchParams.toString());
              params.set("pageSize", String(size));
              router.push(`/admin/messages?${params.toString()}`);
            }}
          />
        </div>
      )}

      {/* 留言详情弹窗 */}
      <Modal
        open={!!detailMessage}
        onClose={() => setDetailMessage(null)}
        title="留言详情"
        size="lg"
      >
        {detailMessage && (
          <div className="space-y-6">
            {/* 发送者信息 */}
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary/10 text-lg font-medium text-brand-primary">
                {detailMessage.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-brand-charcoal">{detailMessage.name}</span>
                  {detailMessage.read ? (
                    <Badge variant="default" size="sm">
                      已读
                    </Badge>
                  ) : (
                    <Badge variant="warning" size="sm">
                      未读
                    </Badge>
                  )}
                </div>
                <span className="text-sm text-brand-charcoal/50">{detailMessage.phone}</span>
              </div>
            </div>

            {/* 时间与类型 */}
            <div className="flex items-center gap-4 text-sm text-brand-charcoal/50">
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {new Date(detailMessage.createdAt).toLocaleString("zh-CN")}
              </span>
              {detailMessage.type && (
                <Badge variant="secondary" size="sm">
                  {MESSAGE_TYPE_LABELS[detailMessage.type] || detailMessage.type}
                </Badge>
              )}
            </div>

            {/* 留言内容 */}
            <div className="rounded-lg bg-brand-charcoal/[0.03] p-4">
              <p className="whitespace-pre-wrap text-brand-charcoal/80">{detailMessage.content}</p>
            </div>

            {/* 回复区域 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-brand-charcoal">管理员回复</h3>
                {detailMessage.repliedAt && (
                  <span className="text-xs text-brand-charcoal/40">
                    上次回复：{new Date(detailMessage.repliedAt).toLocaleString("zh-CN")}
                  </span>
                )}
              </div>
              <textarea
                value={replyDraft}
                onChange={(e) => setReplyDraft(e.target.value)}
                rows={4}
                maxLength={5000}
                disabled={!canWriteMessages}
                placeholder="输入回复内容（仅记录在后台用于回访跟进，用户端暂不展示）"
                className="w-full resize-y rounded-lg border border-brand-charcoal/15 bg-white px-3 py-2 text-sm text-brand-charcoal placeholder:text-brand-charcoal/30 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-brand-charcoal/40">
                  {canWriteMessages ? `${replyDraft.length}/5000` : "只读查看（无回复权限）"}
                </span>
                {canWriteMessages && (
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => toggleRead(detailMessage)}>
                      {detailMessage.read ? "标记为未读" : "标记为已读"}
                    </Button>
                    <Button onClick={handleReply} loading={replying} disabled={!replyDraft.trim()}>
                      {detailMessage.reply ? "更新回复" : "发送回复"}
                    </Button>
                  </div>
                )}
              </div>
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
