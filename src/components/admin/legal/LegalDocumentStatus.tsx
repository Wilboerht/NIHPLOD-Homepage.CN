"use client";

import { Badge } from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LegalAdminDocumentDetail } from "@/types/legal";
import type { LegalLocalDraft } from "@/lib/legal-local-draft";

interface LegalStatusPillsProps {
  document: LegalAdminDocumentDetail;
  isDirty: boolean;
  className?: string;
}

export function LegalStatusPills({ document, isDirty, className }: LegalStatusPillsProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <Badge variant={document.publishedVersion > 0 ? "success" : "secondary"}>
        {document.publishedVersion > 0 ? `线上 v${document.publishedVersion}` : "尚未发布"}
      </Badge>
      {document.hasDraft ? <Badge variant="warning">草稿待发布</Badge> : null}
      {document.contentSource === "default" ? (
        <Badge variant="outline">系统默认内容</Badge>
      ) : null}
      {isDirty ? <Badge variant="warning">有未保存修改</Badge> : null}
    </div>
  );
}

interface LegalPublishStatusCardProps {
  document: LegalAdminDocumentDetail;
  isDirty: boolean;
  localDraft: LegalLocalDraft | null;
}

export function LegalPublishStatusCard({
  document,
  isDirty,
  localDraft,
}: LegalPublishStatusCardProps) {
  const draftMeta = [
    document.draftUpdatedBy ? `编辑：${document.draftUpdatedBy}` : null,
    document.draftUpdatedAt ? formatDateTime(document.draftUpdatedAt) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="rounded-card border border-line bg-white p-4">
      <h2 className="text-sm font-semibold text-brand-charcoal">发布状态</h2>
      <dl className="mt-3 space-y-2 text-xs text-ink-muted">
        <div className="flex items-start justify-between gap-3">
          <dt>线上版本</dt>
          <dd className="text-right font-medium text-brand-charcoal">
            {document.publishedVersion > 0 ? `v${document.publishedVersion}` : "尚未发布"}
            {document.publishedAt ? (
              <span className="mt-0.5 block font-normal text-ink-faint">
                {formatDateTime(document.publishedAt)}
              </span>
            ) : null}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt>发布人</dt>
          <dd className="text-right">{document.publishedBy ?? "—"}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt>草稿</dt>
          <dd className="text-right">
            {document.hasDraft ? "待发布" : "无草稿"}
            {draftMeta ? (
              <span className="mt-0.5 block text-ink-faint">{draftMeta}</span>
            ) : null}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt>当前编辑</dt>
          <dd className={cn("text-right", isDirty && "font-medium text-status-warning-strong")}>
            {isDirty ? "有未保存修改" : "已同步"}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt>公开页日期</dt>
          <dd className="text-right">{document.content.lastUpdated || "—"}</dd>
        </div>
        {localDraft ? (
          <div className="flex items-start justify-between gap-3 border-t border-status-warning-line pt-2 text-status-warning-strong">
            <dt>本地备份</dt>
            <dd className="text-right">
              {localDraft.savedAt ? formatDateTime(new Date(localDraft.savedAt)) : "已检测到"}
            </dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-3 border-t border-line pt-3 text-2xs leading-5 text-ink-muted">
        发布需要 TOTP 二次验证并写入审计日志；历史版本永久保留，可恢复为草稿。
      </p>
    </section>
  );
}
