"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Award,
  Building2,
  Check,
  Clock,
  Copy,
  FileCheck2,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  Users,
} from "lucide-react";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";
import { PageHeader } from "@/components/admin/PageHeader";
import { PanelCard } from "@/components/admin/PanelCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { RequirePermission } from "@/components/admin/RequirePermission";
import type { BaDashboardPayload } from "@/types/ba-dashboard";

const COMPLAINT_STATUS_LABELS: Record<string, string> = {
  PENDING: "待处理",
  INVESTIGATING: "调查中",
  RESOLVED: "已解决",
  REJECTED: "已驳回",
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon: React.ReactNode;
}) {
  return (
    <PanelCard className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-brand-charcoal/60">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-brand-charcoal">{value}</p>
          {hint && <p className="mt-1 text-[11px] text-brand-charcoal/50">{hint}</p>}
        </div>
        <span className="rounded-lg bg-brand-primary/[0.06] p-2 text-brand-primary">{icon}</span>
      </div>
    </PanelCard>
  );
}

function BaDashboardContent() {
  const [payload, setPayload] = useState<BaDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<{ username: string; password: string } | null>(
    null
  );
  const [copied, setCopied] = useState(false);
  const takeLatest = useLatestRequest();
  const { success, error: showError } = useToast();
  const { requireTotp, totpModal } = useTotpConfirm();

  const withStepUp = async <T,>(action: () => Promise<T>): Promise<T | null> => {
    try {
      return await action();
    } catch (err) {
      if (!isTotpRequired(err)) throw err;
      const verified = await requireTotp(err instanceof ApiError ? err.code : undefined);
      if (!verified) return null;
      return await action();
    }
  };

  const load = useCallback(async () => {
    const isLatest = takeLatest();
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<BaDashboardPayload>("/api/admin/subsites/ba/overview");
      if (!isLatest()) return;
      setPayload(data);
    } catch (err) {
      if (!isLatest()) return;
      setError(err instanceof ApiError ? err.message : "加载 BA 看板失败");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [takeLatest]);

  useEffect(() => {
    deferInEffect(load);
  }, [load]);

  const handleResetEmergencyPassword = async () => {
    setResetting(true);
    try {
      const data = await withStepUp(() =>
        apiPost<{ username: string; password: string }>(
          "/api/admin/subsites/ba/emergency-account/reset-password",
          {}
        )
      );
      if (!data) return;
      setResetOpen(false);
      setCopied(false);
      setResetResult(data);
      success("应急密码已重置，请立即保存新密码");
      void load();
    } catch (err) {
      showError(err instanceof ApiError ? err.message : "重置应急密码失败");
    } finally {
      setResetting(false);
    }
  };

  const handleCopyPassword = async () => {
    if (!resetResult) return;
    try {
      await navigator.clipboard.writeText(resetResult.password);
      setCopied(true);
      success("新密码已复制");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      showError("复制失败，请手动选择密码");
    }
  };

  const dashboard = payload?.dashboard ?? null;
  const canReadComplaints = payload?.canReadComplaints ?? false;
  const canManageEmergencyAccount = payload?.canManageEmergencyAccount ?? false;
  const emergencyAccount = dashboard?.emergencyAccount ?? null;
  const recentComplaints = dashboard?.complaints.recent ?? [];
  const recentAudit = dashboard?.recentAudit ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="BA 证书平台"
        description="品牌授权与打假举报概览（只读）"
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? "mr-1.5 h-4 w-4 animate-spin" : "mr-1.5 h-4 w-4"} />
            刷新
          </Button>
        }
      />

      {error && (
        <PanelCard className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</PanelCard>
      )}

      {payload?.degraded && (
        <PanelCard className="border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              BA 服务暂时不可用：{payload.reason === "not_configured" ? "内部 API 未配置" : "请稍后重试"}
            </span>
          </div>
        </PanelCard>
      )}

      {loading && !dashboard ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <PanelCard key={index} className="h-24 animate-pulse bg-brand-charcoal/[0.03]">
              <span className="sr-only">加载中</span>
            </PanelCard>
          ))}
        </div>
      ) : dashboard ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="有效证书"
              value={dashboard.certificates.valid}
              hint={`累计 ${dashboard.certificates.total}`}
              icon={<FileCheck2 className="h-5 w-5" />}
            />
            <StatCard
              label="待审证书"
              value={dashboard.certificates.pending}
              icon={<Clock className="h-5 w-5" />}
            />
            <StatCard
              label="30 天内到期"
              value={dashboard.certificates.expiring30d}
              icon={<ShieldAlert className="h-5 w-5" />}
            />
            <StatCard
              label="待处理举报"
              value={dashboard.complaints.pending}
              hint={`调查中 ${dashboard.complaints.investigating}`}
              icon={<AlertTriangle className="h-5 w-5" />}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <StatCard label="经销商" value={dashboard.dealers.total} icon={<Building2 className="h-5 w-5" />} />
            <StatCard
              label="管理员"
              value={dashboard.admins.total}
              hint={`SSO ${dashboard.admins.sso} / 本地 ${dashboard.admins.local}`}
              icon={<Users className="h-5 w-5" />}
            />
            <StatCard
              label="本月已解决举报"
              value={dashboard.complaints.resolvedThisMonth}
              icon={<Award className="h-5 w-5" />}
            />
          </div>

          {emergencyAccount && (
            <PanelCard className="p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-brand-primary/[0.06] p-2 text-brand-primary">
                      <KeyRound className="h-5 w-5" />
                    </span>
                    <h2 className="text-sm font-semibold text-brand-charcoal">应急账号</h2>
                    <Badge variant={emergencyAccount.enabled ? "success" : "secondary"}>
                      {emergencyAccount.enabled ? "已启用" : "未启用"}
                    </Badge>
                    <Badge variant={emergencyAccount.totpConfigured ? "success" : "warning"}>
                      {emergencyAccount.totpConfigured ? "TOTP 已配置" : "TOTP 未配置"}
                    </Badge>
                    {emergencyAccount.isBanned && <Badge variant="danger">已禁用</Badge>}
                    {emergencyAccount.exists ? (
                      emergencyAccount.authSource === "local" ? (
                        <Badge variant="outline">本地账号</Badge>
                      ) : (
                        <Badge variant="warning">非本地账号</Badge>
                      )
                    ) : (
                      <Badge variant="warning">未创建</Badge>
                    )}
                  </div>
                  <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-xs text-brand-charcoal/50">用户名</dt>
                      <dd className="mt-0.5 font-mono text-brand-charcoal">
                        {emergencyAccount.username}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-brand-charcoal/50">密码</dt>
                      <dd className="mt-0.5 font-mono text-brand-charcoal">••••••••</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-brand-charcoal/50">最近登录</dt>
                      <dd className="mt-0.5 text-brand-charcoal">
                        {formatDateTime(emergencyAccount.lastLoginAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-brand-charcoal/50">BA 角色</dt>
                      <dd className="mt-0.5 text-brand-charcoal">{emergencyAccount.role ?? "—"}</dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-xs text-brand-charcoal/50">
                    密码只保存哈希，无法查看原密码；重置后新密码只显示一次，请立即保存。
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
                  {canManageEmergencyAccount && emergencyAccount.exists ? (
                    <Button variant="outline" size="sm" onClick={() => setResetOpen(true)}>
                      <KeyRound className="mr-1.5 h-4 w-4" />
                      重置密码
                    </Button>
                  ) : (
                    <p className="max-w-xs text-xs text-brand-charcoal/50 lg:text-right">
                      {emergencyAccount.exists
                        ? "仅 BA 超级管理员可重置应急密码"
                        : "请先在 BA 服务器运行 npm run init:break-glass"}
                    </p>
                  )}
                </div>
              </div>
            </PanelCard>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <PanelCard className="p-4">
              <h2 className="text-sm font-semibold text-brand-charcoal">最近举报</h2>
              {canReadComplaints ? (
                recentComplaints.length > 0 ? (
                  <ul className="mt-3 divide-y divide-brand-charcoal/5">
                    {recentComplaints.map((item) => (
                      <li key={item.id}>
                        <a
                          href={`/admin/messages?source=ba&id=${encodeURIComponent(item.id)}`}
                          className="flex items-center justify-between gap-3 py-2.5 text-sm transition-colors hover:text-brand-primary"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {item.channel || item.descriptionPreview}
                            </span>
                            <span className="block truncate text-xs text-brand-charcoal/55">
                              {item.descriptionPreview}
                            </span>
                          </span>
                          <Badge variant={item.status === "PENDING" ? "warning" : "secondary"}>
                            {COMPLAINT_STATUS_LABELS[item.status] ?? item.status}
                          </Badge>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-brand-charcoal/55">暂无举报</p>
                )
              ) : (
                <p className="mt-3 text-sm text-brand-charcoal/55">
                  需要 BA 举报查看权限才能看到举报摘要。
                </p>
              )}
            </PanelCard>

            <PanelCard className="p-4">
              <h2 className="text-sm font-semibold text-brand-charcoal">最近审计</h2>
              {recentAudit.length > 0 ? (
                <ul className="mt-3 divide-y divide-brand-charcoal/5">
                  {recentAudit.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="min-w-0 truncate">{item.action}</span>
                      <span className="shrink-0 text-xs text-brand-charcoal/55">
                        {item.actorName || "系统"} · {formatDateTime(item.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-brand-charcoal/55">暂无审计记录</p>
              )}
            </PanelCard>
          </div>

          <p className="text-xs text-brand-charcoal/45">
            数据生成时间：{formatDateTime(dashboard.generatedAt)}
          </p>
        </>
      ) : null}

      <ConfirmDialog
        open={resetOpen}
        onClose={() => {
          if (!resetting) setResetOpen(false);
        }}
        onConfirm={handleResetEmergencyPassword}
        title="重置 BA 应急密码"
        description="当前应急密码会立即失效，新密码只显示一次。确认继续？"
        type="danger"
        confirmText="重置密码"
        loading={resetting}
      />

      <Modal
        open={!!resetResult}
        onClose={() => {
          setResetResult(null);
          setCopied(false);
        }}
        title="新的应急账号密码"
        size="md"
        closeOnBackdrop={false}
        closeOnEscape={false}
        showCloseButton={false}
        footer={
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setResetResult(null);
                setCopied(false);
              }}
            >
              我已保存
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            新密码只显示一次。关闭后无法再次查看，请立即保存到密码管理器。
          </div>
          <div>
            <p className="text-xs font-medium text-brand-charcoal/60">用户名</p>
            <code className="mt-1 block rounded-lg bg-brand-charcoal/[0.05] px-3 py-2.5 font-mono text-sm">
              {resetResult?.username}
            </code>
          </div>
          <div>
            <p className="text-xs font-medium text-brand-charcoal/60">新密码</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg bg-brand-charcoal/[0.05] px-3 py-2.5 font-mono text-sm">
                {resetResult?.password}
              </code>
              <Button variant="outline" size="sm" onClick={() => void handleCopyPassword()}>
                {copied ? (
                  <Check className="mr-1.5 h-4 w-4" />
                ) : (
                  <Copy className="mr-1.5 h-4 w-4" />
                )}
                {copied ? "已复制" : "复制"}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {totpModal}
    </div>
  );
}

export default function BaSubsiteDashboardPage() {
  return (
    <RequirePermission permissions={["ba:access", "ba:admin"]}>
      <BaDashboardContent />
    </RequirePermission>
  );
}
