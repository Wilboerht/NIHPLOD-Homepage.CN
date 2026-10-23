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
  UserCheck,
  TrendingUp,
  ClipboardCheck,
  Gift,
  ChevronRight,
} from "lucide-react";
import {
  StatStrip,
  PageHeader,
  PanelCard,
  CollapsiblePanel,
  PendingQueue,
  SystemAlertBar,
  type StatStripItem,
  type PendingQueueItem,
  type SystemAlert,
} from "@/components/admin";
import { Empty } from "@/components/ui/Empty";
import { cn } from "@/lib/utils";
import { getCurrentAdmin } from "@/lib/auth";
import { getAdminStats, getSsoStats } from "@/lib/admin-stats";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { formatRelativeTime } from "@/lib/format";

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

  // 业务待办：按权限裁剪，只展示有积压的队列
  const pendingQueueItems: PendingQueueItem[] = [];
  if (stats) {
    if (stats.unreadMessages !== undefined) {
      pendingQueueItems.push({
        key: "messages",
        label: "未读留言",
        count: stats.unreadMessages,
        href: "/admin/messages?status=unread",
        icon: MessageSquare,
        oldestAt: stats.unreadMessagesOldestAt,
      });
    }
    if (stats.pendingSpentAdjustments !== undefined) {
      pendingQueueItems.push({
        key: "spent",
        label: "消费补录待审",
        count: stats.pendingSpentAdjustments,
        href: "/admin/spent-adjustments?status=PENDING",
        icon: ClipboardCheck,
        oldestAt: stats.pendingSpentAdjustmentsOldestAt,
        amountYuan: stats.pendingSpentAmount,
      });
    }
    if (stats.pendingRedemptions !== undefined) {
      pendingQueueItems.push({
        key: "redemptions",
        label: "积分兑换待履约",
        count: stats.pendingRedemptions,
        href: "/admin/point-gifts?status=PENDING",
        icon: Gift,
        oldestAt: stats.pendingRedemptionsOldestAt,
      });
    }
    if (stats.pendingApplications !== undefined) {
      pendingQueueItems.push({
        key: "applications",
        label: "简历待处理",
        count: stats.pendingApplications,
        href: "/admin/applications?status=pending",
        icon: UserCheck,
        oldestAt: stats.pendingApplicationsOldestAt,
      });
    }
  }

  // 系统告警：与业务待办分开，只在有异常时出现
  const systemAlerts: SystemAlert[] = [];
  if (stats?.failedAccountDeletions !== undefined && stats.failedAccountDeletions > 0) {
    systemAlerts.push({
      key: "account-deletions",
      label: "注销执行失败",
      count: stats.failedAccountDeletions,
      href: "/admin/account-deletions",
    });
  }
  if (stats?.webhookFailures !== undefined && stats.webhookFailures > 0) {
    systemAlerts.push({
      key: "webhooks",
      label: "Webhook 投递失败",
      count: stats.webhookFailures,
      href: "/admin/webhook-failures",
    });
  }
  if (stats?.cronFailures24h !== undefined && stats.cronFailures24h > 0) {
    systemAlerts.push({
      key: "cron",
      label: "定时任务失败",
      count: stats.cronFailures24h,
      href: "/admin/cron-tasks",
    });
  }

  // 概览指标：按权限裁剪，无权限的域不渲染
  const overviewItems: StatStripItem[] = [];
  if (stats?.totalUsers !== undefined) {
    overviewItems.push({
      label: "用户总数",
      value: stats.totalUsers.toLocaleString("zh-CN"),
      icon: <Users className="h-3.5 w-3.5" />,
      description:
        stats.newUsersToday && stats.newUsersToday > 0
          ? `今日 +${stats.newUsersToday.toLocaleString("zh-CN")}`
          : "今日暂无新增",
    });
  }
  if (stats?.totalMessages !== undefined) {
    overviewItems.push({
      label: "留言总数",
      value: stats.totalMessages.toLocaleString("zh-CN"),
      icon: <MessageSquare className="h-3.5 w-3.5" />,
      description:
        stats.messagesToday && stats.messagesToday > 0
          ? `今日 +${stats.messagesToday.toLocaleString("zh-CN")}`
          : "今日暂无新增",
    });
  }
  if (stats?.products !== undefined) {
    const draftText =
      stats.draftProducts !== undefined ? `草稿 ${stats.draftProducts}` : "全部产品";
    const categoryText = stats.categories !== undefined ? ` · ${stats.categories} 个分类` : "";
    overviewItems.push({
      label: "产品总数",
      value: stats.products.toLocaleString("zh-CN"),
      icon: <Package className="h-3.5 w-3.5" />,
      description: `${draftText}${categoryText}`,
    });
  }
  if (stats?.jobs !== undefined) {
    overviewItems.push({
      label: "在招职位",
      value: stats.jobs.toLocaleString("zh-CN"),
      icon: <Briefcase className="h-3.5 w-3.5" />,
      description:
        stats.newApplicationsThisWeek !== undefined
          ? stats.newApplicationsThisWeek > 0
            ? `本周新简历 ${stats.newApplicationsThisWeek}`
            : "本周暂无新简历"
          : "已发布职位",
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
  const hasPendingQueues = pendingQueueItems.length > 0;

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
          <SystemAlertBar alerts={systemAlerts} />

          {hasPendingQueues && <PendingQueue items={pendingQueueItems} />}

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
      {stats &&
        !statsError &&
        !hasPendingQueues &&
        overviewItems.length === 0 &&
        !showRecentMessages &&
        !ssoStats &&
        systemAlerts.length === 0 && (
          <Empty
            className="rounded-2xl border border-brand-charcoal/10 bg-white py-12"
            title="暂无可查看的统计"
            description="请联系超级管理员分配权限"
          />
        )}
    </div>
  );
}
