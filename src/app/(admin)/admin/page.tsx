import Link from "next/link";
import { redirect } from "next/navigation";
import {
  MessageSquare,
  Briefcase,
  Package,
  Plus,
  Eye,
  Clock,
  Key,
  MonitorStop,
  FileSearch,
  Shield,
  Users,
  TrendingUp,
  ClipboardCheck,
  Gift,
  UserX,
  Webhook,
  CheckCircle2,
} from "lucide-react";
import { StatsCard, PageHeader, PanelCard } from "@/components/admin";
import { Empty } from "@/components/ui/Empty";
import { cn } from "@/lib/utils";
import { getCurrentAdmin } from "@/lib/auth";
import { getAdminStats, getSsoStats } from "@/lib/admin-stats";
import { hasAdminPermission } from "@/lib/admin-permissions";

// 格式化相对时间（基于服务端渲染时刻）
function formatRelativeTime(dateString: string) {
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
}

// 快捷操作（带权限点时按当前管理员权限过滤，避免点了才 403）
const quickActions = [
  {
    title: "新增产品",
    href: "/admin/products/new",
    icon: Plus,
    permission: "products:write" as const,
  },
  {
    title: "发布职位",
    href: "/admin/jobs/new",
    icon: Briefcase,
    permission: "jobs:write" as const,
  },
  {
    title: "处理未读留言",
    href: "/admin/messages",
    icon: MessageSquare,
    permission: "messages:read" as const,
  },
  {
    title: "审核消费补录",
    href: "/admin/spent-adjustments",
    icon: ClipboardCheck,
    permission: "spent:read" as const,
  },
  { title: "查看网站", href: "/", icon: Eye, external: true },
];

// SSO 快捷操作
const ssoQuickActions = [
  {
    title: "OAuth Client 管理",
    href: "/admin/oauth-clients",
    icon: Key,
    permission: "sso:clients:read" as const,
  },
  {
    title: "SSO 会话管理",
    href: "/admin/oauth/sessions",
    icon: MonitorStop,
    permission: "sso:read" as const,
  },
  {
    title: "SSO 审计日志",
    href: "/admin/oauth/audit",
    icon: FileSearch,
    permission: "sso:read" as const,
  },
];

export default async function AdminDashboard() {
  // 服务端验证管理员身份，未登录直接重定向
  const admin = await getCurrentAdmin();
  if (!admin) {
    // reauth=1 让 middleware 放行登录页，避免失效 token 造成无限重定向
    redirect("/admin-login?reauth=1");
  }

  // 无 dashboard:read 权限（个人覆盖可撤销）时不渲染统计数据
  if (!hasAdminPermission(admin, "dashboard:read")) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2">
        <Shield className="h-10 w-10 text-brand-charcoal/65" />
        <p className="text-lg font-medium text-brand-charcoal/70">无权访问仪表盘</p>
        <p className="text-sm text-brand-charcoal/65">请联系超级管理员开通 dashboard:read 权限</p>
      </div>
    );
  }

  let stats;
  let statsError = false;
  try {
    stats = await getAdminStats(admin);
  } catch {
    statsError = true;
  }

  let ssoStats = null;
  if (hasAdminPermission(admin, "sso:read")) {
    try {
      ssoStats = await getSsoStats();
    } catch {
      // SSO 统计获取失败不阻断整个仪表盘
    }
  }

  // 待处理事项：按权限裁剪（admin-stats 已按权限裁剪字段，无权限的项为 undefined 不渲染）
  const pendingItems = stats
    ? [
        {
          title: "待审核消费补录",
          count: stats.pendingSpentAdjustments,
          href: "/admin/spent-adjustments",
          icon: ClipboardCheck,
        },
        {
          title: "待履约积分兑换",
          count: stats.pendingRedemptions,
          href: "/admin/point-gifts",
          icon: Gift,
        },
        {
          title: "注销失败人工队列",
          count: stats.failedAccountDeletions,
          href: "/admin/account-deletions",
          icon: UserX,
        },
        {
          title: "Webhook 失败队列",
          count: stats.webhookFailures,
          href: "/admin/webhook-failures",
          icon: Webhook,
        },
      ].filter((item): item is typeof item & { count: number } => item.count !== undefined)
    : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="仪表盘" description="欢迎回来，查看网站概览数据" />

      {/* 业务统计：独立降级，失败不影响 SSO 统计与快捷操作 */}
      {statsError || !stats ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-brand-charcoal/10 bg-white py-16">
          <div className="rounded-full bg-red-50 p-4">
            <TrendingUp className="h-8 w-8 text-red-400" />
          </div>
          <h2 className="mt-4 text-base font-medium text-brand-charcoal">业务统计加载失败</h2>
          <p className="mt-1 text-sm text-brand-charcoal/65">无法获取仪表盘统计数据，请稍后重试</p>
          <a
            href="/admin"
            className="mt-4 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-primary/90"
          >
            重新加载
          </a>
        </div>
      ) : (
        <>
          {/* 统计卡片：按权限裁剪，没有权限的域不渲染 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.totalUsers !== undefined && (
              <StatsCard
                title="用户总数"
                value={stats.totalUsers}
                icon={<Users className="h-6 w-6" />}
                description="账号总数（含已注销）"
              />
            )}
            {stats.unreadMessages !== undefined && (
              <StatsCard
                title="未读留言"
                value={stats.unreadMessages}
                icon={<MessageSquare className="h-6 w-6" />}
                description="待处理"
              />
            )}
            {stats.products !== undefined && (
              <StatsCard
                title="产品总数"
                value={stats.products}
                icon={<Package className="h-6 w-6" />}
                description={
                  stats.categories !== undefined
                    ? `${stats.categories} 个分类 · 含草稿`
                    : "全部产品（含草稿）"
                }
              />
            )}
            {stats.jobs !== undefined && (
              <StatsCard
                title="在招职位"
                value={stats.jobs}
                icon={<Briefcase className="h-6 w-6" />}
                description="已发布职位"
              />
            )}
          </div>
          <p className="-mt-2 text-right text-xs text-brand-charcoal/65">统计数据每 5 分钟更新</p>

          {/* 待处理事项：按权限裁剪，计数为 0 时置灰显示勾号 */}
          {pendingItems.length > 0 && (
            <div className="flex flex-col gap-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-brand-charcoal">
                <Clock className="h-4 w-4 text-brand-primary" />
                待处理
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {pendingItems.map((item) => {
                  const Icon = item.icon;
                  const hasPending = item.count > 0;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "rounded-2xl border border-brand-charcoal/10 bg-white p-5 transition-colors",
                        hasPending ? "hover:border-brand-primary/30" : "opacity-60"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <p className="text-sm text-brand-charcoal/65">{item.title}</p>
                          <p
                            className={cn(
                              "mt-1 text-2xl font-semibold tracking-tight",
                              hasPending ? "text-brand-primary" : "text-brand-charcoal/65"
                            )}
                          >
                            {item.count}
                          </p>
                          <p className="mt-1 text-xs text-brand-charcoal/65">
                            {hasPending ? "点击查看处理" : "暂无待办"}
                          </p>
                        </div>
                        <div
                          className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-lg",
                            hasPending
                              ? "bg-brand-primary/10 text-brand-primary"
                              : "bg-brand-charcoal/8 text-brand-charcoal/65"
                          )}
                        >
                          {hasPending ? (
                            <Icon className="h-6 w-6" />
                          ) : (
                            <CheckCircle2 className="h-6 w-6" />
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* SSO 概览 */}
      {ssoStats && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-brand-charcoal">
              <Shield className="h-4 w-4 text-brand-primary" />
              SSO 概览
            </h2>
            <span className="text-xs text-brand-charcoal/65">需要 SSO 权限</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatsCard
              title="活跃 Client"
              value={ssoStats.activeClients}
              icon={<Key className="h-6 w-6" />}
              description="已启用的 OAuth Client"
            />
            <StatsCard
              title="活跃会话"
              value={ssoStats.activeSessions}
              icon={<Users className="h-6 w-6" />}
              description="当前在线的 SSO 会话"
            />
            <StatsCard
              title="今日 SSO 事件"
              value={ssoStats.todayEvents}
              icon={<TrendingUp className="h-6 w-6" />}
              description="今日授权/Token/登出等事件"
            />
            <StatsCard
              title="本月授权成功率"
              value={ssoStats.successRate === null ? "—" : `${ssoStats.successRate}%`}
              icon={<MonitorStop className="h-6 w-6" />}
              description="本月 authorize 事件成功占比"
            />
          </div>
        </div>
      )}

      {/* 下方内容区域 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 最近留言：仅 messages:read 渲染（业务统计降级时不渲染） */}
        {stats?.recentMessages !== undefined && (
          <PanelCard
            title="最近留言"
            className="lg:col-span-2"
            action={
              <Link href="/admin/messages" className="text-sm text-brand-primary hover:underline">
                查看全部
              </Link>
            }
          >
            {stats.recentMessages && stats.recentMessages.length > 0 ? (
              <div className="flex flex-col gap-3">
                {stats.recentMessages.map((message) => (
                  <Link
                    key={message.id}
                    href="/admin/messages"
                    className="block rounded-lg p-3 transition-colors hover:bg-brand-charcoal/[0.03]"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium",
                          message.read
                            ? "bg-brand-charcoal/8 text-brand-charcoal/70"
                            : "bg-brand-primary/10 text-brand-primary"
                        )}
                      >
                        {message.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={cn(
                              "font-medium",
                              message.read ? "text-brand-charcoal/70" : "text-brand-charcoal"
                            )}
                          >
                            {message.name}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-brand-charcoal/65">
                            <Clock className="h-3 w-3" />
                            {formatRelativeTime(message.createdAt)}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-sm text-brand-charcoal/65">
                          {message.content}
                        </p>
                      </div>
                      {!message.read && <span className="h-2 w-2 rounded-full bg-brand-primary" />}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <Empty title="暂无留言" />
            )}
          </PanelCard>
        )}

        {/* 快捷操作 */}
        <PanelCard title="快捷操作">
          <div className="flex flex-col gap-2">
            {quickActions
              .filter(
                (action) => !action.permission || hasAdminPermission(admin, action.permission)
              )
              .map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    target={action.external ? "_blank" : undefined}
                    className="flex items-center gap-3 rounded-lg p-3 text-brand-charcoal/80 transition-colors hover:bg-brand-charcoal/[0.03]"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="font-medium">{action.title}</span>
                  </Link>
                );
              })}
          </div>

          {ssoQuickActions.some((action) => hasAdminPermission(admin, action.permission)) && (
            <>
              <div className="my-4 border-t border-brand-charcoal/10" />
              <h3 className="mb-3 text-sm font-medium text-brand-charcoal/70">SSO 管理</h3>
              <div className="space-y-2">
                {ssoQuickActions
                  .filter((action) => hasAdminPermission(admin, action.permission))
                  .map((action) => {
                    const Icon = action.icon;
                    return (
                      <Link
                        key={action.href}
                        href={action.href}
                        className="flex items-center gap-3 rounded-lg p-3 text-brand-charcoal/80 transition-colors hover:bg-brand-charcoal/[0.03]"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className="font-medium">{action.title}</span>
                      </Link>
                    );
                  })}
              </div>
            </>
          )}
        </PanelCard>
      </div>
    </div>
  );
}
