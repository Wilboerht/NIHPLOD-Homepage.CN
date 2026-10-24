import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, ChevronRight, ShieldCheck, Wallet } from "lucide-react";
import type {
  MonitorEventView,
  SecurityMonitorData,
  SecurityMonitorGroup,
} from "@/lib/admin-dashboard-governance";
import { formatDateTimeSeconds, formatRelativeTime } from "@/lib/format";
import { Badge } from "./Badge";
import { CollapsiblePanel } from "./CollapsiblePanel";

function riskBadge(risk: string | null) {
  if (risk === "CRITICAL") return <Badge variant="danger">严重</Badge>;
  if (risk === "HIGH") return <Badge variant="danger">高</Badge>;
  return null;
}

function outcomeBadge(event: MonitorEventView) {
  if (event.outcome === "FAILURE") return <Badge variant="danger">失败</Badge>;
  if (event.outcome === "PENDING") return <Badge variant="warning">进行中</Badge>;
  if (event.outcome === "PARTIAL") return <Badge variant="warning">部分成功</Badge>;
  return null;
}

function EventList({ events, emptyText }: { events: MonitorEventView[]; emptyText: string }) {
  if (events.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-emerald-50/70 px-3 py-3 text-sm text-emerald-700">
        <ShieldCheck className="h-4 w-4 shrink-0" />
        {emptyText}
      </div>
    );
  }

  return (
    <ul className="-mx-1 divide-y divide-brand-charcoal/5">
      {events.map((event) => (
        <li key={event.id}>
          <Link
            href={event.href}
            className="group -mx-1 flex items-start gap-2.5 rounded-lg px-1 py-2.5 transition-colors hover:bg-brand-charcoal/[0.03]"
          >
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-charcoal/[0.04] text-brand-charcoal/65">
              {event.kind === "auth" ? (
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              ) : event.kind === "funds" || event.kind === "spent" ? (
                <Wallet className="h-3.5 w-3.5" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="truncate text-sm font-medium text-brand-charcoal">
                  {event.label}
                </span>
                {riskBadge(event.riskLevel)}
                {outcomeBadge(event)}
                {event.amount && (
                  <span className="ml-auto shrink-0 text-xs font-semibold tabular-nums text-brand-charcoal">
                    {event.amount}
                  </span>
                )}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-brand-charcoal/65">
                <span className="truncate">{event.actor}</span>
                {event.actorRole && <span className="shrink-0">· {event.actorRole}</span>}
                {event.target && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">目标 {event.target}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <time dateTime={event.createdAt} title={formatDateTimeSeconds(event.createdAt)}>
                  {formatRelativeTime(event.createdAt)}
                </time>
              </span>
            </span>
            <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-brand-charcoal/40 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function StatRow({
  items,
}: {
  items: { label: string; value: number; tone?: "danger" | "warning" }[];
}) {
  return (
    <dl className="mb-3 grid grid-cols-3 gap-2 rounded-xl bg-brand-charcoal/[0.03] px-3 py-2.5">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="truncate text-[11px] text-brand-charcoal/65">{item.label}</dt>
          <dd
            className={
              item.value > 0 && item.tone === "danger"
                ? "mt-0.5 text-lg font-semibold tabular-nums text-red-600"
                : item.value > 0 && item.tone === "warning"
                  ? "mt-0.5 text-lg font-semibold tabular-nums text-amber-700"
                  : "mt-0.5 text-lg font-semibold tabular-nums text-brand-charcoal"
            }
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MonitorCard({
  title,
  icon,
  group,
  stats,
  emptyText,
  viewAllHref,
  viewAllLabel,
}: {
  title: string;
  icon: ReactNode;
  group: SecurityMonitorGroup;
  stats: { label: string; value: number; tone?: "danger" | "warning" }[];
  emptyText: string;
  viewAllHref: string;
  viewAllLabel: string;
}) {
  return (
    <section className="rounded-xl bg-brand-charcoal/[0.02] p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-brand-charcoal">
          {icon}
          {title}
        </h3>
        <Link href={viewAllHref} className="text-xs text-brand-primary hover:underline">
          {viewAllLabel}
        </Link>
      </div>
      <StatRow items={stats} />
      <div className="mb-2 flex items-center justify-between text-[11px] text-brand-charcoal/65">
        <span>近 24 小时</span>
        <span>{group.total} 条</span>
      </div>
      <EventList events={group.events} emptyText={emptyText} />
    </section>
  );
}

export function SecurityMonitor({
  data,
  error = false,
}: {
  data: SecurityMonitorData | null;
  error?: boolean;
}) {
  if (error) {
    return (
      <CollapsiblePanel
        title={
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-brand-primary" />
            安全与资金监控
          </span>
        }
        summary="监控数据加载失败"
        defaultOpen
      >
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p>监控数据加载失败</p>
            <p className="mt-1 text-xs text-amber-700/80">请刷新页面，或前往审计日志查看。</p>
          </div>
        </div>
      </CollapsiblePanel>
    );
  }
  if (!data) return null;

  const needsAttention =
    data.sensitive.highRisk > 0 ||
    data.sensitive.authFailures > 0 ||
    data.funds.failures > 0;

  return (
    <CollapsiblePanel
      title={
        <span className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-brand-primary" />
          安全与资金监控
        </span>
      }
      summary={`敏感操作 ${data.sensitive.total} · 高危 ${data.sensitive.highRisk} · 认证失败 ${data.sensitive.authFailures} · 资金失败 ${data.funds.failures}`}
      defaultOpen={needsAttention}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MonitorCard
          title="敏感操作"
          icon={<ShieldCheck className="h-4 w-4 text-brand-primary" />}
          group={data.sensitive}
          stats={[
            { label: "高危/严重", value: data.sensitive.highRisk, tone: "danger" },
            { label: "认证失败", value: data.sensitive.authFailures, tone: "warning" },
            { label: "操作人", value: data.sensitive.actors },
          ]}
          emptyText="近 24 小时无敏感操作"
          viewAllHref="/admin/audit-logs?actorType=ADMIN&category=security"
          viewAllLabel="查看全部安全操作"
        />
        <MonitorCard
          title="资金操作"
          icon={<Wallet className="h-4 w-4 text-brand-primary" />}
          group={data.funds}
          stats={[
            { label: "人工操作", value: data.funds.manual },
            { label: "系统入账", value: data.funds.system },
            { label: "失败", value: data.funds.failures, tone: "danger" },
          ]}
          emptyText="近 24 小时无人工资金操作"
          viewAllHref="/admin/audit-logs?actorType=ALL&category=finance"
          viewAllLabel="查看全部资金操作"
        />
      </div>
    </CollapsiblePanel>
  );
}
