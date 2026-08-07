import Link from "next/link";
import { redirect } from "next/navigation";
import {
  MessageSquare,
  Briefcase,
  Plus,
  Eye,
  Clock,
  Key,
  MonitorStop,
  FileSearch,
  Shield,
  Users,
  TrendingUp,
  ShoppingCart,
} from "lucide-react";
import { StatsCard } from "@/components/admin";
import { Empty } from "@/components/ui/Empty";
import { cn } from "@/lib/utils";
import { getCurrentAdmin } from "@/lib/auth";
import { getAdminStats, getSsoStats } from "@/lib/admin-stats";

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

// 快捷操作
const quickActions = [
  { title: "新增产品", href: "/admin/products/new", icon: Plus },
  { title: "发布职位", href: "/admin/jobs/new", icon: Briefcase },
  { title: "查看网站", href: "/", icon: Eye, external: true },
];

// 订单状态徽章
const ORDER_STATUS_MAP: Record<string, { label: string; className: string }> = {
  PENDING: { label: "待支付", className: "bg-amber-50 text-amber-600 border-amber-200" },
  PAYING: { label: "支付中", className: "bg-blue-50 text-blue-600 border-blue-200" },
  PAID: { label: "已支付", className: "bg-emerald-50 text-emerald-600 border-emerald-200" },
  PROCESSING: { label: "处理中", className: "bg-blue-50 text-blue-600 border-blue-200" },
  SHIPPED: { label: "已发货", className: "bg-purple-50 text-purple-600 border-purple-200" },
  DELIVERED: { label: "已签收", className: "bg-teal-50 text-teal-600 border-teal-200" },
  COMPLETED: { label: "已完成", className: "bg-gray-50 text-gray-600 border-gray-200" },
  CANCELLED: { label: "已取消", className: "bg-gray-100 text-gray-500 border-gray-200" },
  REFUNDING: { label: "退款中", className: "bg-orange-50 text-orange-600 border-orange-200" },
  REFUNDED: { label: "已退款", className: "bg-red-50 text-red-500 border-red-200" },
};

function OrderStatusBadge({ status }: { status: string }) {
  const config = ORDER_STATUS_MAP[status] || {
    label: status,
    className: "bg-gray-100 text-gray-500 border-gray-200",
  };
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs ${config.className}`}
    >
      {config.label}
    </span>
  );
}

// SSO 快捷操作
const ssoQuickActions = [
  { title: "OAuth Client 管理", href: "/admin/oauth-clients", icon: Key },
  { title: "SSO 会话管理", href: "/admin/oauth/sessions", icon: MonitorStop },
  { title: "SSO 审计日志", href: "/admin/oauth/audit", icon: FileSearch },
];

export default async function AdminDashboard() {
  // 服务端验证管理员身份，未登录直接重定向
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect("/admin-login");
  }

  let stats;
  let statsError = false;
  try {
    stats = await getAdminStats();
  } catch {
    statsError = true;
  }

  let ssoStats = null;
  if (admin.role === "owner") {
    try {
      ssoStats = await getSsoStats();
    } catch {
      // SSO 统计获取失败不阻断整个仪表盘
    }
  }

  if (statsError || !stats) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-medium text-brand-charcoal">仪表盘</h1>
        </div>
        <div className="flex flex-col items-center justify-center rounded-xl bg-white py-16 shadow-sm">
          <div className="rounded-full bg-red-50 p-4">
            <TrendingUp className="h-8 w-8 text-red-400" />
          </div>
          <h2 className="mt-4 text-lg font-medium text-brand-charcoal">数据加载失败</h2>
          <p className="mt-1 text-sm text-brand-charcoal/50">无法获取仪表盘统计数据，请稍后重试</p>
          <a
            href="/admin"
            className="mt-4 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-primary/90"
          >
            重新加载
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-medium text-brand-charcoal">仪表盘</h1>
        <p className="mt-1 text-sm text-brand-charcoal/50">欢迎回来，查看网站概览数据</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="今日销售额"
          value={`¥${stats.todayRevenue.toFixed(2)}`}
          icon={<TrendingUp className="h-6 w-6" />}
          description="今日已支付订单金额"
        />
        <Link href="/admin/orders?status=PENDING" className="block">
          <StatsCard
            title="待处理订单"
            value={stats.pendingOrders}
            icon={<ShoppingCart className="h-6 w-6" />}
            description="待支付订单，点击查看"
          />
        </Link>
        <StatsCard
          title="用户总数"
          value={stats.totalUsers}
          icon={<Users className="h-6 w-6" />}
          description="注册用户"
        />
        <StatsCard
          title="未读留言"
          value={stats.unreadMessages}
          icon={<MessageSquare className="h-6 w-6" />}
          description="待处理"
        />
      </div>

      {/* SSO 概览 */}
      {ssoStats && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-brand-charcoal flex items-center gap-2">
              <Shield className="h-5 w-5 text-brand-primary" />
              SSO 概览
            </h2>
            <span className="text-xs text-brand-charcoal/50">仅超级管理员可见</span>
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
              value={`${ssoStats.successRate}%`}
              icon={<MonitorStop className="h-6 w-6" />}
              description="本月 SSO 事件成功占比"
            />
          </div>
        </div>
      )}

      {/* 下方内容区域 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 最近订单 */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium text-brand-charcoal">最近订单</h2>
            <Link href="/admin/orders" className="text-sm text-brand-primary hover:underline">
              查看全部
            </Link>
          </div>

          {stats.recentOrders && stats.recentOrders.length > 0 ? (
            <div className="space-y-3">
              {stats.recentOrders.map((order) => (
                <Link
                  key={order.id}
                  href={`/admin/orders/${order.id}`}
                  className="block rounded-lg p-3 transition-colors hover:bg-brand-charcoal/[0.03]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-brand-charcoal/70">{order.orderNo}</span>
                    <span className="text-xs text-brand-charcoal/50">
                      {formatRelativeTime(order.createdAt)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-brand-charcoal">
                      ¥{Number(order.payAmount).toFixed(2)}
                    </span>
                    <OrderStatusBadge status={order.status} />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <Empty title="暂无订单" />
          )}
        </div>

        {/* 最近留言 */}
        <div className="rounded-xl bg-white p-6 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium text-brand-charcoal">最近留言</h2>
            <Link href="/admin/messages" className="text-sm text-brand-primary hover:underline">
              查看全部
            </Link>
          </div>

          {stats.recentMessages && stats.recentMessages.length > 0 ? (
            <div className="space-y-4">
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
                          ? "bg-brand-charcoal/8 text-brand-charcoal/60"
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
                            message.read ? "text-brand-charcoal/60" : "text-brand-charcoal"
                          )}
                        >
                          {message.name}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-brand-charcoal/50">
                          <Clock className="h-3 w-3" />
                          {formatRelativeTime(message.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm text-brand-charcoal/50">{message.content}</p>
                    </div>
                    {!message.read && <span className="h-2 w-2 rounded-full bg-brand-primary" />}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <Empty title="暂无留言" />
          )}
        </div>

        {/* 快捷操作 */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-medium text-brand-charcoal">快捷操作</h2>
          <div className="space-y-2">
            {quickActions.map((action) => {
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

          {admin.role === "owner" && (
            <>
              <div className="my-4 border-t border-brand-charcoal/10" />
              <h3 className="mb-3 text-sm font-medium text-brand-charcoal/70">SSO 管理</h3>
              <div className="space-y-2">
                {ssoQuickActions.map((action) => {
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
        </div>
      </div>
    </div>
  );
}
