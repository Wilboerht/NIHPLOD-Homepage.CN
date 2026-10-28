import Link from "next/link";
import { AlertTriangle, ChevronDown, ChevronRight, Clock, ShieldCheck, Users } from "lucide-react";
import type { OwnerGovernanceData } from "@/lib/admin-dashboard-governance";
import { APPROVAL_POLICIES, type ApprovalPolicyKey } from "@/lib/admin-approval-policy";
import { PERMISSION_LABELS } from "@/lib/admin-permissions";
import { formatDateTimeSeconds, formatRelativeTime } from "@/lib/format";
import { Badge } from "./Badge";
import { DashboardModalCard } from "./DashboardModalCard";

function CountBox({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "danger" | "warning" | "primary";
}) {
  return (
    <div className="min-w-0 rounded-xl bg-brand-charcoal/[0.03] px-3 py-2.5">
      <p className="truncate text-[11px] text-brand-charcoal/65">{label}</p>
      <p
        className={
          value > 0 && tone === "danger"
            ? "mt-0.5 text-xl font-semibold tabular-nums text-red-600"
            : value > 0 && tone === "warning"
              ? "mt-0.5 text-xl font-semibold tabular-nums text-amber-700"
              : value > 0 && tone === "primary"
                ? "mt-0.5 text-xl font-semibold tabular-nums text-brand-primary"
                : "mt-0.5 text-xl font-semibold tabular-nums text-brand-charcoal"
        }
      >
        {value}
      </p>
    </div>
  );
}

export function OwnerGovernanceCard({ data }: { data: OwnerGovernanceData | null }) {
  if (!data) return null;

  const pending = data.approvals.latestPending;
  const ownerOnly = data.ownerOnly.events;

  return (
    <DashboardModalCard
      title="Owner 治理"
      icon={<ShieldCheck className="h-4 w-4 text-brand-primary" />}
      summary={`待审批 ${data.approvals.pending} · 待执行 ${data.approvals.approvedAwaiting} · 非 owner 操作 ${data.ownerOnly.nonOwner}`}
      modalSize="xl"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-brand-charcoal/65">审批、owner 级权限与高风险操作概览</p>
        <Link
          href="/admin/approvals"
          className="inline-flex items-center gap-1 text-xs text-brand-primary hover:underline"
        >
          进入审批中心
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CountBox label="待我审批" value={data.approvals.pending} tone="warning" />
        <CountBox label="已通过待执行" value={data.approvals.approvedAwaiting} tone="primary" />
        <CountBox label="Owner 专属操作（24h）" value={data.ownerOnly.total} />
        <CountBox
          label="非 owner 执行 owner 级操作"
          value={data.ownerOnly.nonOwner}
          tone="danger"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-xs font-medium text-brand-charcoal">
              <Clock className="h-3.5 w-3.5 text-amber-600" />
              待我审批
            </h3>
            <Link
              href="/admin/approvals?status=PENDING"
              className="text-[11px] text-brand-primary hover:underline"
            >
              查看全部
            </Link>
          </div>
          {pending.length === 0 ? (
            <p className="rounded-xl bg-emerald-50/70 px-3 py-3 text-sm text-emerald-700">
              暂无待审批申请
            </p>
          ) : (
            <ul className="divide-y divide-brand-charcoal/5">
              {pending.map((item) => (
                <li key={item.id}>
                  <Link
                    href="/admin/approvals?status=PENDING"
                    className="group flex items-start gap-2 py-2.5"
                  >
                    <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-brand-charcoal">
                          {APPROVAL_POLICIES[item.policyKey as ApprovalPolicyKey]?.label ??
                            item.policyKey}
                        </span>
                        <Badge variant="warning">待审批</Badge>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-brand-charcoal/65">
                        {item.requesterName || item.requesterEmail || item.requesterId} · 目标{" "}
                        {item.targetLabel || item.targetId || "-"} ·
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </span>
                    <ChevronRight className="mt-1 h-3.5 w-3.5 text-brand-charcoal/40" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-xs font-medium text-brand-charcoal">
              <Users className="h-3.5 w-3.5 text-brand-primary" />
              Owner 级权限持有人
            </h3>
            <span className="text-[11px] text-brand-charcoal/65">{data.holders.length} 人</span>
          </div>
          {data.holders.length === 0 ? (
            <p className="rounded-xl bg-emerald-50/70 px-3 py-3 text-sm text-emerald-700">
              没有非 owner 持有 owner 级权限
            </p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {data.holders.map((holder) => (
                <li
                  key={holder.id}
                  className="rounded-xl border border-brand-charcoal/10 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-brand-charcoal">
                      {holder.name || holder.email}
                    </span>
                    <Badge variant="neutral">{holder.roleLabel}</Badge>
                    <Badge variant={holder.totpEnabled ? "success" : "danger"}>
                      TOTP {holder.totpEnabled ? "已启用" : "未启用"}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] text-brand-charcoal/65">
                    {holder.permissions
                      .map((permission) => PERMISSION_LABELS[permission] ?? permission)
                      .join("、")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-4 border-t border-brand-charcoal/10 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-medium text-brand-charcoal">Owner 专属操作（近 24 小时）</h3>
          <Link
            href="/admin/audit-logs?actorType=ADMIN"
            className="text-[11px] text-brand-primary hover:underline"
          >
            查看审计
          </Link>
        </div>
        {ownerOnly.length === 0 ? (
          <p className="text-sm text-brand-charcoal/65">暂无 owner 专属操作</p>
        ) : (
          <ul className="max-h-56 divide-y divide-brand-charcoal/5 overflow-y-auto pr-1">
            {ownerOnly.map((event) => (
              <li key={event.id}>
                <Link
                  href={event.href}
                  className="flex items-center gap-2 py-2 text-xs text-brand-charcoal/75 hover:text-brand-charcoal"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {event.label} · {event.actor}
                    {event.target ? ` · ${event.target}` : ""}
                  </span>
                  {event.actorRole && event.actorRole !== "owner" && (
                    <Badge variant="danger">非 owner</Badge>
                  )}
                  <time
                    dateTime={event.createdAt}
                    title={formatDateTimeSeconds(event.createdAt)}
                    className="shrink-0 text-brand-charcoal/55"
                  >
                    {formatRelativeTime(event.createdAt)}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <details className="group mt-4 rounded-xl bg-brand-charcoal/[0.03] px-3 py-2.5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-brand-charcoal [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            保护规则
          </span>
          <ChevronDown
            aria-hidden="true"
            className="h-3.5 w-3.5 transition-transform group-open:rotate-180"
          />
        </summary>
        <ul className="mt-1.5 space-y-1 text-[11px] text-brand-charcoal/65">
          {data.protectionRules.map((rule) => (
            <li key={rule}>· {rule}</li>
          ))}
        </ul>
        {data.unenforcedActions.length > 0 && (
          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-700">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            仍待补 step-up：{data.unenforcedActions.join("、")}
          </p>
        )}
      </details>
    </DashboardModalCard>
  );
}
