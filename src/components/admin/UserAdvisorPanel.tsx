"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  ExternalLink,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { apiGet, apiPatch, ApiError } from "@/lib/api-client";
import { buildAdvisorAdminLink } from "@/lib/advisor-admin-link";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Empty } from "@/components/ui/Empty";
import { useToast } from "@/components/ui/Toast";
import { PanelCard } from "@/components/admin/PanelCard";
import { StatStrip } from "@/components/admin/StatStrip";
import { AdvisorReports } from "@/components/admin/users/AdvisorReports";
import { cn } from "@/lib/utils";
import type { AdvisorOverviewPayload, AdvisorUserOverview } from "@/types/advisor-user";

const SKIN_STATE_LABELS: Record<string, string> = {
  great: "很好",
  good: "良好",
  normal: "一般",
  bad: "较差",
  terrible: "很差",
};

const MEMBERSHIP_LABELS: Record<string, string> = {
  REGULAR: "普通会员",
  SILVER: "银卡会员",
  GOLD: "金卡会员",
  DIAMOND: "钻石卡会员",
};

const MAIN_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "正常",
  SUSPENDED: "冻结",
  BANNED: "封禁",
  DELETED: "已注销",
};

const DEGRADED_MESSAGES: Record<string, string> = {
  not_configured: "未配置测肤子站内部接口密钥",
  unauthorized: "主站与测肤子站之间的内部鉴权失败",
  rate_limited: "测肤子站请求过于频繁，请稍后重试",
  upstream_error: "测肤子站暂时不可用",
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDay(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function requestOverview(userId: string): Promise<AdvisorOverviewPayload> {
  return apiGet<AdvisorOverviewPayload>(`/api/admin/users/${userId}/advisor`);
}

function PanelSkeleton() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-brand-charcoal/10 bg-white p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <div className="h-3 w-16 animate-pulse rounded bg-brand-charcoal/[0.06]" />
              <div className="h-6 w-20 animate-pulse rounded bg-brand-charcoal/[0.06]" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-brand-charcoal/10 bg-white p-4">
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-10 animate-pulse rounded-lg bg-brand-charcoal/[0.04]" />
          ))}
        </div>
      </div>
    </div>
  );
}

function OverviewContent({
  userId,
  overview,
  advisorDeepLink,
  canOpenAdvisor,
  canReadReport,
  actions,
}: {
  userId: string;
  overview: AdvisorUserOverview;
  advisorDeepLink: string;
  canOpenAdvisor: boolean;
  canReadReport: boolean;
  actions?: ReactNode;
}) {
  const { account, usage, counts } = overview;
  if (!account) return null;

  const quota = usage.quota;
  const dailyLimitText = quota.dailyLimit == null ? "不限" : `${quota.dailyLimit} 次/日`;
  const lifetimeText =
    quota.lifetimeLimit == null
      ? "不限次数"
      : usage.remaining != null
        ? `剩余 ${usage.remaining} 次`
        : "—";
  const customLimit = account.dailyTestLimit !== 10;

  return (
    <div className="space-y-4">
      <PanelCard>
        <StatStrip
          items={[
            {
              label: "子站账号",
              value: (
                <Badge variant={account.role === "disabled" ? "danger" : "success"}>
                  {account.role === "disabled" ? "已禁用" : "正常"}
                </Badge>
              ),
              description: MEMBERSHIP_LABELS[usage.level || ""] || "会员等级未知",
            },
            {
              label: "今日用量",
              value: `${usage.todayUsed}${quota.dailyLimit == null ? "" : ` / ${quota.dailyLimit}`}`,
              description: dailyLimitText,
            },
            {
              label: "终身已用",
              value: usage.totalUsed,
              description: lifetimeText,
            },
            {
              label: "今日打卡",
              value: usage.todayCheckedIn ? "已打卡" : "未打卡",
              description: usage.todayCheckedIn ? "已完成手动打卡" : "尚无手动打卡",
            },
          ]}
        />
      </PanelCard>

      <PanelCard title="账号与配额">
        <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-brand-charcoal/65">子站首次登录</dt>
            <dd className="mt-1 text-brand-charcoal">{formatDateTime(account.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-brand-charcoal/65">最后活跃</dt>
            <dd className="mt-1 text-brand-charcoal">{formatDateTime(account.lastActiveAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-brand-charcoal/65">累计测肤</dt>
            <dd className="mt-1 text-brand-charcoal">
              {counts.sessions} 次
              <span className="ml-2 text-xs text-brand-charcoal/65">
                完成 {counts.completedSessions} 次
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-brand-charcoal/65">日记记录</dt>
            <dd className="mt-1 text-brand-charcoal">{counts.diaryEntries} 条</dd>
          </div>
        </dl>
        <div
          className={cn(
            "mt-4 rounded-lg px-3 py-2 text-xs",
            customLimit
              ? "border border-amber-200 bg-amber-50 text-amber-800"
              : "bg-brand-charcoal/[0.03] text-brand-charcoal/70"
          )}
        >
          {customLimit
            ? `管理员已自定义每日测肤上限为 ${account.dailyTestLimit} 次（该设置会解除终身次数限制）`
            : `每日上限与会员等级默认配额一致（${dailyLimitText}），未做单独自定义`}
        </div>
        {actions && <div className="mt-4 border-t border-brand-charcoal/10 pt-4">{actions}</div>}
      </PanelCard>

      {canReadReport ? (
        <AdvisorReports userId={userId} />
      ) : (
        <div className="rounded-xl border border-brand-charcoal/10 bg-white px-3 py-2.5 text-xs text-brand-charcoal/55">
          需要完整报告权限（advisor:report:read）才能查看报告正文；当前仅展示账号、配额和摘要。
        </div>
      )}

      <details className="rounded-xl border border-brand-charcoal/10 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm text-brand-charcoal">
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-brand-charcoal/45" />
            最近护肤日记
          </span>
          <span className="text-[11px] text-brand-charcoal/45">
            {overview.recentDiary.length > 0 ? `${overview.recentDiary.length} 条` : "暂无"}
          </span>
        </summary>
        <div className="border-t border-brand-charcoal/10 px-3 py-2">
          {overview.recentDiary.length === 0 ? (
            <p className="py-2 text-xs text-brand-charcoal/55">暂无护肤日记</p>
          ) : (
            <div className="divide-y divide-brand-charcoal/[0.06]">
              {overview.recentDiary.map((entry) => (
                <div
                  key={`${entry.date}-${entry.skinState}`}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-brand-charcoal">{formatDay(entry.date)}</span>
                    <Badge variant="secondary" size="sm">
                      {SKIN_STATE_LABELS[entry.skinState] || entry.skinState}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {entry.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-brand-charcoal/[0.04] px-2 py-0.5 text-[11px] text-brand-charcoal/70"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </details>

      {canOpenAdvisor && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-charcoal/10 bg-brand-charcoal/[0.02] px-3 py-2.5">
          <p className="text-xs text-brand-charcoal/60">
            需要调整配额、查看推荐规则或子站其他后台功能时，前往测肤子站。
          </p>
          <a
            href={advisorDeepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-brand-primary hover:underline"
          >
            在测肤子站打开
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      )}
    </div>
  );
}

export function UserAdvisorPanel({ userId, mainStatus }: { userId: string; mainStatus: string }) {
  const { can } = useAdminPermissions();
  const toast = useToast();
  const { requireTotp, totpModal } = useTotpConfirm();
  const takeLatest = useLatestRequest();
  const [payload, setPayload] = useState<AdvisorOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [limitEditing, setLimitEditing] = useState(false);
  const [limitInput, setLimitInput] = useState(10);
  const [savingLimit, setSavingLimit] = useState(false);
  const [roleTarget, setRoleTarget] = useState<"user" | "disabled" | null>(null);
  const [roleSaving, setRoleSaving] = useState(false);

  const canWrite = can("advisor:users:write");
  const canOpenAdvisor = can("advisor:access") || can("advisor:admin");
  const canReadReport = can("advisor:report:read");
  const mainActive = mainStatus === "ACTIVE";

  useEffect(() => {
    const isLatest = takeLatest();
    requestOverview(userId)
      .then((data) => {
        if (!isLatest()) return;
        setPayload(data);
        setError("");
      })
      .catch((err) => {
        if (!isLatest()) return;
        setPayload(null);
        setError(err instanceof ApiError ? err.message : "加载测肤档案失败，请稍后重试");
      })
      .finally(() => {
        if (isLatest()) setLoading(false);
      });
  }, [takeLatest, userId]);

  const reload = useCallback(() => {
    const isLatest = takeLatest();
    setLoading(true);
    setError("");
    setLimitEditing(false);
    requestOverview(userId)
      .then((data) => {
        if (!isLatest()) return;
        setPayload(data);
        setError("");
      })
      .catch((err) => {
        if (!isLatest()) return;
        setPayload(null);
        setError(err instanceof ApiError ? err.message : "加载测肤档案失败，请稍后重试");
      })
      .finally(() => {
        if (isLatest()) setLoading(false);
      });
  }, [takeLatest, userId]);

  const startEditLimit = useCallback(() => {
    const account = payload?.overview?.account;
    if (!account) return;
    setLimitInput(account.dailyTestLimit);
    setLimitEditing(true);
  }, [payload]);

  const saveLimit = useCallback(async () => {
    if (!Number.isInteger(limitInput) || limitInput < 0 || limitInput > 9999) {
      toast.error("请输入 0–9999 之间的整数");
      return;
    }
    setSavingLimit(true);
    try {
      const submit = () =>
        apiPatch(`/api/admin/users/${userId}/advisor`, { dailyTestLimit: limitInput });
      try {
        await submit();
      } catch (error) {
        if (!isTotpRequired(error)) throw error;
        const verified = await requireTotp(error instanceof ApiError ? error.code : undefined);
        if (!verified) return;
        await submit();
      }
      toast.success("每日测肤上限已更新");
      setLimitEditing(false);
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "网络异常，请稍后重试");
    } finally {
      setSavingLimit(false);
    }
  }, [limitInput, reload, requireTotp, toast, userId]);

  const confirmRoleChange = useCallback(async () => {
    if (!roleTarget) return;
    setRoleSaving(true);
    try {
      const submit = () => apiPatch(`/api/admin/users/${userId}/advisor`, { role: roleTarget });
      try {
        await submit();
      } catch (error) {
        if (!isTotpRequired(error)) throw error;
        const verified = await requireTotp(error instanceof ApiError ? error.code : undefined);
        if (!verified) {
          setRoleTarget(null);
          return;
        }
        await submit();
      }
      toast.success(roleTarget === "disabled" ? "已禁用测肤子站账号" : "已启用测肤子站账号");
      setRoleTarget(null);
      reload();
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("网络异常，请稍后重试");
    } finally {
      setRoleSaving(false);
    }
  }, [reload, requireTotp, roleTarget, toast, userId]);

  if (loading) return <PanelSkeleton />;

  if (error) {
    return (
      <Empty
        icon={<AlertTriangle className="h-8 w-8 text-amber-500" />}
        title="加载测肤档案失败"
        description={error}
        action={
          <Button size="sm" variant="outline" onClick={reload}>
            重试
          </Button>
        }
        className="py-10"
      />
    );
  }

  if (!payload) return null;

  if (payload.degraded) {
    return (
      <Empty
        icon={<AlertTriangle className="h-8 w-8 text-amber-500" />}
        title="测肤子站暂不可用"
        description={DEGRADED_MESSAGES[payload.reason || ""] || "请稍后重试"}
        action={
          <Button
            size="sm"
            variant="outline"
            leftIcon={<RefreshCw className="h-4 w-4" />}
            onClick={reload}
          >
            重新加载
          </Button>
        }
        className="py-10"
      />
    );
  }

  if (!payload.overview || !payload.overview.account) {
    return (
      <Empty
        icon={<Sparkles className="h-8 w-8 text-brand-charcoal/65" />}
        title="该用户尚未使用过 AI 测肤"
        description="用户在测肤子站首次登录后，这里会显示账号状态、配额和测肤记录。"
        action={
          canOpenAdvisor ? (
            <a
              href={buildAdvisorAdminLink(`/admin/users?userId=${userId}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-primary hover:underline"
            >
              前往测肤子站
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : undefined
        }
        className="py-10"
      />
    );
  }

  const advisorDeepLink = buildAdvisorAdminLink(`/admin/users?userId=${userId}`);
  const account = payload.overview.account;

  const actions =
    canWrite && mainStatus !== "DELETED" ? (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-brand-charcoal">每日测肤上限</p>
            <p className="mt-0.5 text-xs text-brand-charcoal/65">
              0–9999 次；设置 10 次即恢复会员默认配额
            </p>
          </div>
          {limitEditing ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={9999}
                value={limitInput}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setLimitInput(
                    Number.isFinite(next) ? Math.max(0, Math.min(9999, Math.trunc(next))) : 0
                  );
                }}
                aria-label="每日测肤上限"
                className="w-24 rounded-lg border border-brand-charcoal/20 px-2 py-1.5 text-center text-sm tabular-nums focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary/20"
              />
              <Button size="sm" onClick={saveLimit} loading={savingLimit}>
                保存
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setLimitEditing(false)}
                disabled={savingLimit}
              >
                取消
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="font-mono text-xl font-semibold tabular-nums text-brand-charcoal">
                {account.dailyTestLimit}
              </span>
              <Button size="sm" variant="outline" onClick={startEditLimit}>
                修改
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-brand-charcoal/10 pt-3">
          <div>
            <p className="text-sm font-medium text-brand-charcoal">子站账号状态</p>
            <p className="mt-0.5 text-xs text-brand-charcoal/65">
              {account.role === "disabled"
                ? "用户当前无法在测肤子站测肤或查看历史。"
                : "禁用仅影响测肤子站，不影响主站账号。"}
            </p>
          </div>
          {account.role === "disabled" ? (
            <Button size="sm" onClick={() => setRoleTarget("user")} disabled={!mainActive}>
              启用子站账号
            </Button>
          ) : (
            <Button
              size="sm"
              variant="danger"
              onClick={() => setRoleTarget("disabled")}
              disabled={!mainActive}
            >
              禁用子站账号
            </Button>
          )}
        </div>

        {!mainActive && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            主站账号当前状态为「{MAIN_STATUS_LABELS[mainStatus] || mainStatus}
            」，主站状态变化会同步禁用子站账号；主站恢复正常后才能手动启用。
          </p>
        )}
      </div>
    ) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-brand-charcoal/50" />
          <h3 className="text-sm font-medium text-brand-charcoal">测肤子站（smart.nihplod.cn）</h3>
        </div>
        <Button size="sm" variant="ghost" onClick={reload}>
          刷新
        </Button>
      </div>
      <OverviewContent
        userId={userId}
        overview={payload.overview}
        advisorDeepLink={advisorDeepLink}
        canOpenAdvisor={canOpenAdvisor}
        canReadReport={canReadReport}
        actions={actions}
      />
      <ConfirmDialog
        open={roleTarget !== null}
        onClose={() => setRoleTarget(null)}
        onConfirm={confirmRoleChange}
        title={roleTarget === "disabled" ? "禁用测肤子站账号" : "启用测肤子站账号"}
        description={
          roleTarget === "disabled"
            ? "禁用后该用户将无法在测肤子站测肤或查看历史记录；主站账号不受影响。"
            : "启用后该用户可重新在测肤子站登录并使用测肤功能。"
        }
        type={roleTarget === "disabled" ? "danger" : "info"}
        confirmText={roleTarget === "disabled" ? "确认禁用" : "确认启用"}
        loading={roleSaving}
      />
      {totpModal}
    </div>
  );
}
