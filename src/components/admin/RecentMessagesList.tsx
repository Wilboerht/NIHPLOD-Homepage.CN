"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatRelativeTime } from "@/lib/format";
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
 * 仪表盘最近留言：点击行直接打开详情弹窗，避免跳转列表页再定位。
 */
export function RecentMessagesList({ messages }: RecentMessagesListProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<RecentMessageItem | null>(null);

  const close = () => setSelected(null);

  return (
    <>
      <div className="divide-y divide-brand-charcoal/[0.06]">
        {messages.map((message) => (
          <button
            key={message.id}
            type="button"
            onClick={() => setSelected(message)}
            aria-label={`查看 ${message.name} 的留言`}
            className="flex w-full items-center gap-3 px-1 py-2.5 text-left transition-colors hover:bg-brand-charcoal/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
          >
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                message.read
                  ? "bg-brand-charcoal/[0.06] text-brand-charcoal/65"
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
                    message.read
                      ? "font-medium text-brand-charcoal/70"
                      : "font-semibold text-brand-charcoal"
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
                <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px] text-brand-charcoal/65">
                  <Clock className="h-3 w-3" />
                  {formatRelativeTime(message.createdAt)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-brand-charcoal/65">{message.content}</p>
            </div>
          </button>
        ))}
      </div>

      <Modal
        open={!!selected}
        onClose={close}
        title="留言详情"
        size="lg"
        footer={
          selected ? (
            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  close();
                  router.push("/admin/messages");
                }}
              >
                前往留言管理
              </Button>
            </div>
          ) : undefined
        }
      >
        {selected && (
          <div className="space-y-4">
            <div className="space-y-3 rounded-lg bg-brand-charcoal/[0.03] p-4 text-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-sm font-medium text-brand-primary">
                  {selected.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-brand-charcoal">{selected.name}</span>
                    <Badge variant={selected.read ? "default" : "warning"} size="sm">
                      {selected.read ? "已读" : "未读"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-brand-charcoal/65">{selected.phone}</p>
                </div>
              </div>
              <div className="border-t border-brand-charcoal/15 pt-3">
                <p className="text-xs text-brand-charcoal/65">提交时间</p>
                <p className="mt-0.5 text-brand-charcoal/70">
                  {new Date(selected.createdAt).toLocaleString("zh-CN")}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-brand-charcoal/10 p-4">
              <p className="text-xs text-brand-charcoal/65">留言内容</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-brand-charcoal/80">
                {selected.content}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
