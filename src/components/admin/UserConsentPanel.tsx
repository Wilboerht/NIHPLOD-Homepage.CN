"use client";

import { useCallback, useEffect, useState } from "react";
import { deferInEffect } from "@/hooks/deferInEffect";
import { AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";
import { apiGet, ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Empty";
import { PanelCard } from "@/components/admin/PanelCard";
import { cn } from "@/lib/utils";
import type {
  ConsentDocumentKey,
  ConsentDocumentState,
  ConsentDocumentStatus,
  ConsentOverallState,
  ConsentProjectStatus,
  UserConsentOverview,
} from "@/types/user-consent";

const DOCUMENT_LABELS: Record<ConsentDocumentKey, string> = {
  privacy: "隐私政策",
  terms: "服务条款",
  marketing: "营销同意（可选）",
  face: "面部照片",
  health: "健康信息",
  ai: "AI 分析",
};

const DOCUMENT_ORDER: ConsentDocumentKey[] = [
  "privacy",
  "terms",
  "marketing",
  "face",
  "health",
  "ai",
];

const STATE_LABELS: Record<ConsentOverallState, string> = {
  current: "当前版本已同意",
  outdated: "已同意旧版本",
  revoked: "已撤回",
  missing: "未同意",
  unversioned: "无版本号",
  not_applicable: "不适用",
  not_linked: "未关联",
  degraded: "查询失败",
};

const STATE_VARIANTS: Record<
  ConsentOverallState,
  "success" | "warning" | "danger" | "neutral" | "outline"
> = {
  current: "success",
  outdated: "warning",
  revoked: "danger",
  missing: "neutral",
  unversioned: "warning",
  not_applicable: "outline",
  not_linked: "outline",
  degraded: "danger",
};

const DOCUMENT_STATE_LABELS: Record<ConsentDocumentState, string> = {
  current: "当前版本",
  outdated: "旧版本",
  revoked: "已撤回",
  missing: "未同意",
  unversioned: "无版本号",
  not_applicable: "不适用",
};

const DOCUMENT_STATE_VARIANTS: Record<
  ConsentDocumentState,
  "success" | "warning" | "danger" | "neutral" | "outline"
> = {
  current: "success",
  outdated: "warning",
  revoked: "danger",
  missing: "neutral",
  unversioned: "warning",
  not_applicable: "outline",
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

function CoverageBadge({ state }: { state: ConsentOverallState }) {
  return (
    <Badge variant={STATE_VARIANTS[state]} size="sm">
      {STATE_LABELS[state]}
    </Badge>
  );
}

function DocumentItem({
  document,
  status,
}: {
  document: ConsentDocumentKey;
  status: ConsentDocumentStatus;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface-muted/50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink-muted">{DOCUMENT_LABELS[document]}</span>
        <Badge variant={DOCUMENT_STATE_VARIANTS[status.state]} size="sm">
          {DOCUMENT_STATE_LABELS[status.state]}
        </Badge>
      </div>
      <div className="mt-1.5 text-xs text-brand-charcoal">
        {status.documentVersion != null
          ? `v${status.documentVersion} · ${status.version ?? "-"}`
          : status.version
            ? `v${status.version}`
            : "无版本号"}
        {status.grantedAt ? (
          <span className="ml-2 text-ink-faint">{formatDateTime(status.grantedAt)}</span>
        ) : null}
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: ConsentProjectStatus }) {
  const documents = DOCUMENT_ORDER.flatMap((key) => {
    const status = project.documents[key];
    return status ? [{ key, status }] : [];
  });

  return (
    <PanelCard
      title={
        <span className="inline-flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-ink-faint" />
          {project.label}
        </span>
      }
      action={<CoverageBadge state={project.overall} />}
    >
      {documents.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map(({ key, status }) => (
            <DocumentItem key={key} document={key} status={status} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          {project.state === "not_linked" ? "暂未关联到可查询的授权记录" : "暂时无法查询授权状态"}
        </p>
      )}

      {project.note ? (
        <p className="mt-3 text-xs leading-relaxed text-ink-muted">{project.note}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-faint">
        <span>最近更新：{formatDateTime(project.lastUpdatedAt)}</span>
        {project.state === "degraded" ? (
          <span className="text-status-danger-fg">上游服务暂时不可用</span>
        ) : null}
      </div>

      {project.events.length > 0 ? (
        <details className="mt-3 rounded-lg border border-line bg-surface-muted/30">
          <summary className="cursor-pointer list-none px-3 py-2 text-xs text-ink-muted">
            查看最近授权记录（{project.events.length}）
          </summary>
          <ul className="space-y-1 border-t border-line px-3 py-2">
            {project.events.map((event, index) => (
              <li
                key={`${event.occurredAt}-${event.document}-${event.action}-${index}`}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted"
              >
                <Badge variant={event.action === "GRANTED" ? "success" : "danger"} size="sm">
                  {event.action === "GRANTED" ? "同意" : "撤回"}
                </Badge>
                <span>
                  {DOCUMENT_LABELS[event.document as ConsentDocumentKey] ?? event.document}
                </span>
                <span>v{event.version}</span>
                <span>{formatDateTime(event.occurredAt)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </PanelCard>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-white p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <div className="h-3 w-16 animate-pulse rounded bg-surface-hover" />
              <div className="h-6 w-20 animate-pulse rounded bg-surface-hover" />
            </div>
          ))}
        </div>
      </div>
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-32 animate-pulse rounded-xl border border-line bg-surface-muted"
        />
      ))}
    </div>
  );
}

export function UserConsentPanel({ userId }: { userId: string }) {
  const [overview, setOverview] = useState<UserConsentOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiGet<UserConsentOverview>(`/api/admin/users/${userId}/consents`);
      setOverview(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "加载授权状态失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    deferInEffect(load);
  }, [load]);

  if (loading && !overview) return <PanelSkeleton />;

  if (error) {
    return (
      <Empty
        title="授权状态加载失败"
        description={error}
        action={
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            重试
          </Button>
        }
      />
    );
  }

  if (!overview) {
    return <Empty title="暂无授权状态" description="该用户还没有可查询的授权记录" />;
  }

  return (
    <div className="space-y-4">
      <PanelCard
        title="授权总览"
        action={
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
            刷新
          </Button>
        }
      >
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-brand-charcoal">
          <span>
            当前版本：隐私 <strong>v{overview.currentVersions.main.privacy}</strong>
            {" / "}
            条款 <strong>v{overview.currentVersions.main.terms}</strong>
            {overview.currentVersions.skin
              ? `；测肤 v${overview.currentVersions.skin.privacy}`
              : ""}
          </span>
          <span className="text-xs text-ink-muted">
            当前版本已同意 {overview.summary.current} 项
            {overview.summary.outdated > 0 ? `，旧版 ${overview.summary.outdated} 项` : ""}
            {overview.summary.missing > 0 ? `，未同意 ${overview.summary.missing} 项` : ""}
            {overview.summary.notLinked > 0 ? `，未关联 ${overview.summary.notLinked} 项` : ""}
          </span>
        </div>

        {overview.warnings.length > 0 ? (
          <ul className="mt-3 space-y-1.5 rounded-lg border border-status-warning-line bg-status-warning-soft px-3 py-2.5">
            {overview.warnings.map((warning) => (
              <li
                key={warning}
                className="flex items-start gap-2 text-xs text-status-warning-strong"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-ink-muted">未发现当前版本授权缺口。</p>
        )}
      </PanelCard>

      {overview.projects.map((project) => (
        <ProjectCard key={project.key} project={project} />
      ))}
    </div>
  );
}
