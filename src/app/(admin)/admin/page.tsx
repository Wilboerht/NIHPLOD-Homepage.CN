"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Package,
  FolderTree,
  MessageSquare,
  Briefcase,
  Plus,
  Eye,
  Clock,
} from "lucide-react";
import { StatsCard, StatsCardSkeleton } from "@/components/admin";
import { cn } from "@/lib/utils";
import { apiGet } from "@/lib/api-client";

interface StatsData {
  products: number;
  categories: number;
  unreadMessages: number;
  jobs: number;
  recentMessages: {
    id: string;
    name: string;
    phone: string;
    content: string;
    read: boolean;
    createdAt: string;
  }[];
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const data = await apiGet<StatsData>("/api/admin/stats");
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  // 格式化相对时间
  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) return "刚刚";
    if (diffMinutes < 60) return `${diffMinutes}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    return date.toLocaleDateString("zh-CN");
  };

  // 快捷操作
  const quickActions = [
    { title: "新增产品", href: "/admin/products/new", icon: Plus },
    { title: "发布职位", href: "/admin/jobs/new", icon: Briefcase },
    { title: "查看网站", href: "/", icon: Eye, external: true },
  ];

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">仪表盘</h1>
        <p className="mt-1 text-sm text-gray-500">欢迎回来，查看网站概览数据</p>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
          {error}
          <button
            onClick={fetchStats}
            className="ml-2 underline hover:no-underline"
          >
            重试
          </button>
        </div>
      )}

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          <>
            <StatsCardSkeleton />
            <StatsCardSkeleton />
            <StatsCardSkeleton />
            <StatsCardSkeleton />
          </>
        ) : (
          <>
            <StatsCard
              title="产品数量"
              value={stats?.products ?? 0}
              icon={Package}
              description="全部产品"
            />
            <StatsCard
              title="分类数量"
              value={stats?.categories ?? 0}
              icon={FolderTree}
              description="产品分类"
            />
            <StatsCard
              title="未读留言"
              value={stats?.unreadMessages ?? 0}
              icon={MessageSquare}
              description="待处理"
            />
            <StatsCard
              title="在招职位"
              value={stats?.jobs ?? 0}
              icon={Briefcase}
              description="已发布"
            />
          </>
        )}
      </div>

      {/* 下方内容区域 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 最近留言 */}
        <div className="lg:col-span-2 rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium text-gray-900">最近留言</h2>
            <Link
              href="/admin/messages"
              className="text-sm text-brand-gold hover:underline"
            >
              查看全部
            </Link>
          </div>

          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-gray-200" />
                    <div className="flex-1">
                      <div className="h-4 w-24 rounded bg-gray-200" />
                      <div className="mt-2 h-3 w-full rounded bg-gray-200" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : stats?.recentMessages && stats.recentMessages.length > 0 ? (
            <div className="space-y-4">
              {stats.recentMessages.map((message) => (
                <Link
                  key={message.id}
                  href={`/admin/messages/${message.id}`}
                  className="block rounded-lg p-3 transition-colors hover:bg-gray-50"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium",
                        message.read
                          ? "bg-gray-100 text-gray-600"
                          : "bg-brand-gold/10 text-brand-gold"
                      )}
                    >
                      {message.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "font-medium",
                            message.read ? "text-gray-600" : "text-gray-900"
                          )}
                        >
                          {message.name}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <Clock className="h-3 w-3" />
                          {formatRelativeTime(message.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm text-gray-500">
                        {message.content}
                      </p>
                    </div>
                    {!message.read && (
                      <span className="h-2 w-2 rounded-full bg-brand-gold" />
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-gray-400">
              暂无留言
            </div>
          )}
        </div>

        {/* 快捷操作 */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-medium text-gray-900">快捷操作</h2>
          <div className="space-y-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  target={action.external ? "_blank" : undefined}
                  className="flex items-center gap-3 rounded-lg p-3 text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-gold/10 text-brand-gold">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="font-medium">{action.title}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
