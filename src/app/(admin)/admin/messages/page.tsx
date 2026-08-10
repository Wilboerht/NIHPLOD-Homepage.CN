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

interface Message {
  id: string;
  name: string;
  phone: string;
  type: string | null;
  content: string;
  read: boolean;
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

export default function AdminMessagesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success, error: showError } = useToast();

  // 状态
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(parseInt(searchParams.get("pageSize") || "20"));
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 详情弹窗
  const [detailMessage, setDetailMessage] = useState<Message | null>(null);

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);

  // 获取留言列表
  const fetchMessages = useCallback(async () => {
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
      setMessages(data.items);
      setTotal(data.pagination.total);
      setUnreadCount(data.unreadCount);
      setLoadError(false);
    } catch (error) {
      console.error("获取留言列表失败:", error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, statusFilter, typeFilter]);

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

  // 标记已读
  const markAsRead = async (message: Message) => {
    if (message.read) return;

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
    if (!message.read) {
      await markAsRead(message);
    }
  };

  // 切换已读状态
  const toggleRead = async (message: Message) => {
    try {
      await apiPatch(`/api/admin/messages/${message.id}`, { read: !message.read });
      success(message.read ? "已标记为未读" : "已标记为已读");
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

  // 批量操作
  const handleBatchAction = async (action: "read" | "unread" | "delete") => {
    if (selectedIds.size === 0) return;

    try {
      const data = await apiPost<{ message: string }>("/api/admin/messages/batch", {
        ids: Array.from(selectedIds),
        action,
      });

      success(data.message);
      setSelectedIds(new Set());
      // 批量删光当前页时回退一页
      if (action === "delete" && selectedIds.size >= messages.length && page > 1) {
        setPage(page - 1);
      } else {
        fetchMessages();
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : "操作失败");
    }
  };

  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return "刚刚";
    if (diffHours < 24) return `${diffHours} 小时前`;
    if (diffDays < 7) return `${diffDays} 天前`;
    return date.toLocaleDateString("zh-CN");
  };

  // 全选
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(messages.map((m) => m.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const isAllSelected = messages.length > 0 && selectedIds.size === messages.length;

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

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-brand-charcoal/50">已选 {selectedIds.size} 项</span>
            <Button size="sm" variant="outline" onClick={() => handleBatchAction("read")}>
              标记已读
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBatchAction("unread")}>
              标记未读
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 hover:bg-red-50"
              onClick={() => setShowBatchDeleteConfirm(true)}
            >
              批量删除
            </Button>
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
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={(e) => handleSelectAll(e.target.checked)}
                className="h-4 w-4 rounded border-brand-charcoal/20"
              />
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
                  <input
                    type="checkbox"
                    checked={selectedIds.has(message.id)}
                    onChange={(e) => {
                      const newSelected = new Set(selectedIds);
                      if (e.target.checked) {
                        newSelected.add(message.id);
                      } else {
                        newSelected.delete(message.id);
                      }
                      setSelectedIds(newSelected);
                    }}
                    className="mt-1 h-4 w-4 rounded border-brand-charcoal/20"
                  />

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
                    {formatDate(message.createdAt)}
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex w-24 items-center gap-1">
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
                    <Tooltip content="删除" side="top">
                      <button
                        onClick={() => setDeleteTarget(message)}
                        className="rounded p-2 text-brand-charcoal/50 hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 分页 */}
      {total > pageSize && (
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

            {/* 操作按钮 */}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => toggleRead(detailMessage)}>
                {detailMessage.read ? "标记为未读" : "标记为已读"}
              </Button>
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
          await handleBatchAction("delete");
          setShowBatchDeleteConfirm(false);
        }}
        title="批量删除"
        description={`确定要删除选中的 ${selectedIds.size} 项？此操作不可恢复。`}
        confirmText="确定删除"
        type="danger"
      />
    </div>
  );
}
