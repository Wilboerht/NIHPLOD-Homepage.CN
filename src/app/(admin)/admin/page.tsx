import Link from "next/link";
import { redirect } from "next/navigation";
import {
  MessageSquare,
  Briefcase,
  Package,
  Clock,
  Key,
  MonitorStop,
  Shield,
  ShieldCheck,
  Users,
  TrendingUp,
  ClipboardCheck,
  Gift,
  UserX,
  Webhook,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import {
  StatStrip,
  PageHeader,
  PanelCard,
  CollapsiblePanel,
  type StatStripItem,
} from "@/components/admin";
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
  const totalPending = pendingItems.reduce((sum, item) => sum + item.count, 0);

  // 概览指标：按权限裁剪，无权限的域不渲染
  const overviewItems: StatStripItem[] = [];
  if (stats?.totalUsers !== undefined) {
    overviewItems.push({
      label: "用户总数",
      value: stats.totalUsers.toLocaleString("zh-CN"),
      icon: <Users className="h-3.5 w-3.5" />,
      description: "含已注销账号",
    });
  }
  if (stats?.unreadMessages !== undefined) {
    overviewItems.push({
      label: "未读留言",
      value: stats.unreadMessages.toLocaleString("zh-CN"),
      icon: <MessageSquare className="h-3.5 w-3.5" />,
      description: stats.unreadMessages > 0 ? "待处理" : "暂无未读",
      muted: stats.unreadMessages === 0,
    });
  }
  if (stats?.products !== undefined) {
    overviewItems.push({
      label: "产品总数",
      value: stats.products.toLocaleString("zh-CN"),
      icon: <Package className="h-3.5 w-3.5" />,
      description:
        stats.categories !== undefined ? `${stats.categories} 个分类 · 含草稿` : "含草稿",
    });
  }
  if (stats?.jobs !== undefined) {
    overviewItems.push({
      label: "在招职位",
      value: stats.jobs.toLocaleString("zh-CN"),
      icon: <Briefcase className="h-3.5 w-3.5" />,
      description: "已发布职位",
    });
  }

  const ssoItems: StatStripItem[] = ssoStats
    ? [
        {
          label: "活跃 Client",
          value: ssoStats.activeClients.toLocaleString("zh-CN"),
          icon: <Key className="h-3.5 w-3.5" />,
          description: "已启用的 OAuth Client",
        },
        {
          label: "活跃会话",
          value: ssoStats.activeSessions.toLocaleString("zh-CN"),
          icon: <MonitorStop className="h-3.5 w-3.5" />,
          description: "当前在线的 SSO 会话",
        },
        {
          label: "今日事件",
          value: ssoStats.todayEvents.toLocaleString("zh-CN"),
          icon: <TrendingUp className="h-3.5 w-3.5" />,
          description: "授权 / Token / 登出等",
        },
        {
          label: "本月成功率",
          value: ssoStats.successRate === null ? "—" : `${ssoStats.successRate}%`,
          icon: <ShieldCheck className="h-3.5 w-3.5" />,
          description: "authorize 成功占比",
        },
      ]
    : [];

  const recentMessages = stats?.recentMessages;
  const showRecentMessages = recentMessages !== undefined;
  const twoColumnBottom = showRecentMessages && !!ssoStats;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="仪表盘" description="欢迎回来，站点数据每 5 分钟更新" />

      {/* 业务统计：独立降级，失败不影响 SSO 统计 */}
      {statsError || !stats ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-brand-charcoal/10 bg-white py-12">
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
          {/* 待处理：行动优先，紧凑条目替代大卡片 */}
          {pendingItems.length > 0 && (
            <PanelCard
              title={
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-brand-primary" />
                  待处理
                </span>
              }
              action={
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-xs",
                    totalPending > 0 ? "text-brand-charcoal/65" : "text-emerald-600"
                  )}
                >
                  {totalPending > 0 ? (
                    `共 ${totalPending} 项`
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      已全部处理
                    </>
                  )}
                </span>
              }
            >
              {totalPending === 0 ? (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-50/70 px-3 py-3 text-sm text-emerald-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  所有队列已清零，暂无待处理事项
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 md:auto-cols-fr md:grid-flow-col md:grid-cols-none">
                  {pendingItems.map((item) => {
                    const Icon = item.icon;
                    const hasPending = item.count > 0;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex min-h-[64px] items-center gap-2.5 rounded-xl p-3 transition-colors",
                          hasPending
                            ? "bg-brand-primary/[0.04] hover:bg-brand-primary/[0.08]"
                            : "bg-brand-charcoal/[0.02] hover:bg-brand-charcoal/[0.04]"
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                            hasPending
                              ? "bg-brand-primary/10 text-brand-primary"
                              : "bg-brand-charcoal/[0.06] text-brand-charcoal/65"
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs text-brand-charcoal/65">
                            {item.title}
                          </span>
                          <span
                            className={cn(
                              "text-lg font-semibold tabular-nums",
                              hasPending ? "text-brand-primary" : "text-brand-charcoal/65"
                            )}
                          >
                            {item.count}
                          </span>
                        </span>
                        {hasPending && (
                          <ChevronRight className="h-4 w-4 shrink-0 text-brand-charcoal/65" />
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </PanelCard>
          )}

          {/* 概览：一个容器 + 细分隔线，替代四个独立卡片 */}
          {overviewItems.length > 0 && (
            <PanelCard>
              <StatStrip items={overviewItems} />
            </PanelCard>
          )}
        </>
      )}

      {/* 最近留言 + SSO 概览：SSO 默认收起，不抢占首屏 */}
      {(showRecentMessages || ssoStats) && (
        <div className={cn("grid grid-cols-1 gap-5", twoColumnBottom && "lg:grid-cols-3")}>
          {showRecentMessages && (
            <PanelCard
              title="最近留言"
              action={
                <Link href="/admin/messages" className="text-xs text-brand-primary hover:underline">
                  查看全部
                </Link>
              }
              className={cn(twoColumnBottom && "lg:col-span-2")}
            >
              {recentMessages && recentMessages.length > 0 ? (
                <div className="divide-y divide-brand-charcoal/[0.06]">
                  {recentMessages.map((message) => (
                    <Link
                      key={message.id}
                      href="/admin/messages"
                      className="flex items-center gap-3 px-1 py-2.5 transition-colors hover:bg-brand-charcoal/[0.03]"
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
                        <p className="mt-0.5 truncate text-xs text-brand-charcoal/65">
                          {message.content}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <Empty title="暂无留言" className="py-10" />
              )}
            </PanelCard>
          )}

          {ssoStats && (
            <CollapsiblePanel
              title={
                <>
                  <Shield className="h-4 w-4 text-brand-primary" />
                  SSO 概览
                </>
              }
              summary={`${ssoStats.activeClients} Client · ${ssoStats.activeSessions} 会话 · 今日 ${ssoStats.todayEvents} 事件`}
              className={cn(twoColumnBottom && "self-start")}
            >
              <StatStrip items={ssoItems} layout={twoColumnBottom ? "grid" : "strip"} />
              <Link
                href="/admin/oauth/stats"
                className="mt-3 inline-flex items-center gap-1 text-xs text-brand-primary hover:underline"
              >
                查看完整统计
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </CollapsiblePanel>
          )}
        </div>
      )}

      {/* 有 dashboard:read 但没有任何可查看域时避免空白页 */}
      {stats && !statsError && overviewItems.length === 0 && !showRecentMessages && !ssoStats && (
        <Empty
          className="rounded-2xl border border-brand-charcoal/10 bg-white py-12"
          title="暂无可查看的统计"
          description="请联系超级管理员分配权限"
        />
      )}
    </div>
  );
}
