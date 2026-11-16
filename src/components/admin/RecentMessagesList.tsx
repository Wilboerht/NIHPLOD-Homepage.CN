"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { formatRelativeTime } from "@/lib/format";
import { apiPatch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export interface RecentMessageItem {
  id: string;
  name: string;
  phone: string;
  content: string;
  read: boolean;
  createdAt: string;
}

interface RecentMessagesListProps {
  messages: RecentMessageItem[];
}

/**
 * 仪表盘最近留言：点击行就地展开详情，避免在仪表盘弹窗里再套一层弹窗。
 */
export function RecentMessagesList({ messages }: RecentMessagesListProps) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(messages);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const openMessage = (message: RecentMessageItem) => {
    setExpandedId((current) => (current === message.id ? null : message.id));
    if (message.read) return;

    // 乐观更新已读状态；失败时回滚并提示
    setItems((prev) => prev.map((item) => (item.id === message.id ? { ...item, read: true } : item)));
    void apiPatch(`/api/admin/messages/${message.id}`, { read: true })
      .then(() => {
        window.dispatchEvent(new Event("admin:nav-counts-refresh"));
        router.refresh();
      })
      .catch((error) => {
        setItems((prev) =>
          prev.map((item) => (item.id === message.id ? { ...item, read: false } : item))
        );
        toast.apiError(error, "标记已读失败");
      });
  };

  return (
    <div className="divide-y divide-line-subtle">
      {items.map((message) => {
        const expanded = expandedId === message.id;
        return (
          <div key={message.id}>
            <button
              type="button"
              onClick={() => openMessage(message)}
              aria-expanded={expanded}
              aria-label={`${expanded ? "收起" : "查看"} ${message.name} 的留言`}
              className="flex w-full items-center gap-3 px-1 py-2.5 text-left transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
            >
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                  message.read
                    ? "bg-surface-hover text-ink-muted"
                    : "bg-brand-primary/10 text-brand-primary"
                )}
              >
                {message.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "truncate text-sm",
                      message.read ? "font-medium text-brand-charcoal/70" : "font-semibold text-ink"
                    )}
                  >
                    {message.name}
                  </span>
                  {!message.read && (
                    <span
                      aria-label="未读"
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary"
                    />
                  )}
                  <span className="ml-auto flex shrink-0 items-center gap-1 text-2xs text-ink-muted">
                    <Clock className="h-3 w-3" />
                    {formatRelativeTime(message.createdAt)}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-ink-muted">{message.content}</p>
              </div>
            </button>

            {expanded && (
              <div
                role="region"
                aria-label={`${message.name} 的留言详情`}
                className="mb-2 space-y-3 rounded-xl bg-surface-subtle p-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{message.name}</span>
                  <Badge variant={message.read ? "neutral" : "warning"} size="sm">
                    {message.read ? "已读" : "未读"}
                  </Badge>
                  <span className="text-xs text-ink-muted">{message.phone}</span>
                  <time
                    dateTime={message.createdAt}
                    className="ml-auto text-xs text-ink-muted"
                    title={new Date(message.createdAt).toLocaleString("zh-CN")}
                  >
                    {formatRelativeTime(message.createdAt)}
                  </time>
                </div>
                <p className="whitespace-pre-wrap text-sm text-brand-charcoal/80">
                  {message.content}
                </p>
                <div className="flex justify-end">
                  <Link
                    href="/admin/messages"
                    className="text-xs font-medium text-brand-primary hover:underline"
                  >
                    前往留言管理
                  </Link>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
