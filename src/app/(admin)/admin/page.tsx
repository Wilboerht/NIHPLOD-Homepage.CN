import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Package,
  FolderTree,
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
} from "lucide-react";
import { StatsCard } from "@/components/admin";
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

  const [stats, ssoStats] = await Promise.all([
    getAdminStats(),
    admin.role === "owner" ? getSsoStats() : null,
  ]);

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
          title="产品数量"
          value={stats.products}
          icon={<Package className="h-6 w-6" />}
          description="全部产品"
        />
        <StatsCard
          title="分类数量"
          value={stats.categories}
          icon={<FolderTree className="h-6 w-6" />}
          description="产品分类"
        />
        <StatsCard
          title="未读留言"
          value={stats.unreadMessages}
          icon={<MessageSquare className="h-6 w-6" />}
          description="待处理"
        />
        <StatsCard
          title="在招职位"
          value={stats.jobs}
          icon={<Briefcase className="h-6 w-6" />}
          description="已发布"
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
            <div className="py-8 text-center text-sm text-brand-charcoal/50">暂无留言</div>
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
