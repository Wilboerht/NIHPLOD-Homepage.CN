"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  Mail,
  MailOpen,
  Trash2,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  name: string;
  phone: string;
  content: string;
  read: boolean;
  createdAt: string;
}

export default function AdminMessagesPage() {
  const { success, error: showError } = useToast();

  // 状态
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 详情弹窗
  const [detailMessage, setDetailMessage] = useState<Message | null>(null);

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 获取留言列表
  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: "20",
      });
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/admin/messages?${params}`);
      const data = await res.json();

      if (data.success) {
        setMessages(data.data.items);
        setTotal(data.data.pagination.total);
        setUnreadCount(data.data.unreadCount);
      }
    } catch (error) {
      console.error("获取留言列表失败:", error);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // 标记已读
  const markAsRead = async (message: Message) => {
    if (message.read) return;

    try {
      const res = await fetch(`/api/admin/messages/${message.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      });

      if (!res.ok) throw new Error("操作失败");
      setDetailMessage((prev) =>
        prev && prev.id === message.id ? { ...prev, read: true } : prev
      );
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
      const res = await fetch(`/api/admin/messages/${message.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: !message.read }),
      });

      if (!res.ok) throw new Error("操作失败");
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
      const res = await fetch(`/api/admin/messages/${deleteTarget.id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("删除失败");

      success("留言已删除");
      setDeleteTarget(null);
      fetchMessages();
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
      const res = await fetch("/api/admin/messages/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          action,
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error?.message || "操作失败");

      success(data.data.message);
      setSelectedIds(new Set());
      fetchMessages();
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
          <h1 className="text-2xl font-semibold text-gray-900">留言管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            共 {total} 条留言
            {unreadCount > 0 && (
              <span className="ml-2 text-brand-gold">
                ({unreadCount} 条未读)
              </span>
            )}
          </p>
        </div>
      </div>

      {/* 工具栏 */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-white p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="搜索留言..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-60 rounded-lg border border-gray-200 pl-9 pr-3 text-sm focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold"
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
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">已选 {selectedIds.size} 项</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBatchAction("read")}
            >
              标记已读
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBatchAction("unread")}
            >
              标记未读
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 hover:bg-red-50"
              onClick={() => handleBatchAction("delete")}
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
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-gray-400">
            <Mail className="mb-2 h-12 w-12" />
            <p className="text-lg">暂无留言</p>
          </div>
        ) : (
          <>
            {/* 表头 */}
            <div className="flex items-center gap-4 border-b border-gray-100 px-6 py-3 text-sm font-medium text-gray-500">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={(e) => handleSelectAll(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="flex-1">留言内容</span>
              <span className="hidden w-32 sm:block">联系方式</span>
              <span className="hidden w-32 md:block">时间</span>
              <span className="w-24">操作</span>
            </div>

            {/* 列表 */}
            <div className="divide-y divide-gray-100">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex items-center gap-4 px-6 py-4 transition-colors hover:bg-gray-50",
                    !message.read && "bg-brand-gold/5"
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
                    className="mt-1 h-4 w-4 rounded border-gray-300"
                  />

                  {/* 留言内容 */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => viewDetail(message)}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium",
                          message.read
                            ? "bg-gray-100 text-gray-600"
                            : "bg-brand-gold/10 text-brand-gold"
                        )}
                      >
                        {message.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "font-medium",
                              message.read ? "text-gray-600" : "text-gray-900"
                            )}
                          >
                            {message.name}
                          </span>
                          <span className="text-sm text-gray-400">
                            {message.phone}
                          </span>
                          {!message.read && (
                            <Badge variant="warning" size="sm">
                              未读
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 truncate text-sm text-gray-500">
                          {message.content}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 联系方式 */}
                  <div className="hidden w-32 text-sm text-gray-500 sm:flex items-center">
                    {message.phone}
                  </div>

                  {/* 时间 */}
                  <div className="hidden w-32 text-sm text-gray-500 md:flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDate(message.createdAt)}
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-1 w-24">
                    <button
                      onClick={() => toggleRead(message)}
                      className="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      title={message.read ? "标记为未读" : "标记为已读"}
                    >
                      {message.read ? (
                        <Mail className="h-4 w-4" />
                      ) : (
                        <MailOpen className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => setDeleteTarget(message)}
                      className="rounded p-2 text-gray-400 hover:bg-red-50 hover:text-red-500"
                      title="删除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 分页 */}
      {total > 20 && (
        <div className="flex justify-center">
          <Pagination
            page={page}
            pageSize={20}
            total={total}
            onChange={setPage}
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
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-gold/10 text-lg font-medium text-brand-gold">
                {detailMessage.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">
                    {detailMessage.name}
                  </span>
                  {detailMessage.read ? (
                    <Badge variant="default" size="sm">已读</Badge>
                  ) : (
                    <Badge variant="warning" size="sm">未读</Badge>
                  )}
                </div>
                <span className="text-sm text-gray-500">
                  {detailMessage.phone}
                </span>
              </div>
            </div>

            {/* 时间 */}
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Clock className="h-4 w-4" />
              {new Date(detailMessage.createdAt).toLocaleString("zh-CN")}
            </div>

            {/* 留言内容 */}
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="whitespace-pre-wrap text-gray-700">
                {detailMessage.content}
              </p>
            </div>

            {/* 操作按钮 */}
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => toggleRead(detailMessage)}
              >
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
    </div>
  );
}
