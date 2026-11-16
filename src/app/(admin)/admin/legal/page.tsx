"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, FileText, Pencil, RefreshCw, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { apiGet, getApiErrorMessage } from "@/lib/api-client";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import type { LegalAdminDocumentSummary, LegalDocumentSlug } from "@/types/legal";

const DOCUMENT_META: Record<
  LegalDocumentSlug,
  { description: string; icon: typeof FileText; href: string }
> = {
  terms: {
    description: "规范网站与产品服务使用、购买、售后与争议解决等条款。",
    icon: ShieldCheck,
    href: "/terms",
  },
  privacy: {
    description: "说明个人信息的收集、使用、共享、存储与用户权利。",
    icon: FileText,
    href: "/privacy",
  },
};

function LegalDocumentsContent() {
  const toast = useToast();
  const router = useRouter();
  const { can } = useAdminPermissions();
  const canWrite = can("legal:write");
  const [documents, setDocuments] = useState<LegalAdminDocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const draftCount = documents.filter((document) => document.hasDraft).length;
  const publishedCount = documents.filter((document) => document.publishedVersion > 0).length;

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiGet<LegalAdminDocumentSummary[]>("/api/admin/legal");
      setDocuments(data);
    } catch (error) {
      setLoadError(getApiErrorMessage(error, "加载法务文档失败"));
      toast.error(getApiErrorMessage(error, "加载法务文档失败"));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    deferInEffect(fetchDocuments);
  }, [fetchDocuments]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="法务文档"
        description="管理服务条款与隐私政策。发布需要动态验证码，所有版本永久保留并可恢复为草稿。"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchDocuments()}
            disabled={loading}
            leftIcon={<RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
          >
            刷新
          </Button>
        }
      />

      {loadError ? (
        <div className="rounded-xl border border-status-danger-line bg-status-danger-soft p-4 text-sm text-status-danger-strong">
          {loadError}
        </div>
      ) : null}

      {!loading && documents.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line bg-surface-subtle px-4 py-3 text-xs text-ink-muted">
          <span>
            共 <strong className="font-semibold text-brand-charcoal">{documents.length}</strong> 份文档
          </span>
          <span>已发布 {publishedCount}</span>
          <span className={draftCount > 0 ? "text-status-warning-strong" : undefined}>
            待发布草稿 {draftCount}
          </span>
        </div>
      ) : null}

      {loading && documents.length === 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((item) => (
            <div
              key={item}
              className="h-56 animate-pulse rounded-card border border-line bg-white"
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {documents.map((document) => {
            const meta = DOCUMENT_META[document.slug];
            const Icon = meta.icon;
            return (
              <section
                key={document.slug}
                className="flex flex-col rounded-card border border-line bg-white p-4 sm:p-5"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold text-brand-charcoal">
                      <Link
                        href={`/admin/legal/${document.slug}`}
                        className="hover:text-brand-primary"
                      >
                        {document.title}
                      </Link>
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-ink-muted">
                      {meta.description}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Badge
                    variant={document.publishedVersion > 0 ? "success" : "secondary"}
                    size="sm"
                  >
                    {document.publishedVersion > 0
                      ? `线上 v${document.publishedVersion}`
                      : "尚未发布"}
                  </Badge>
                  {document.hasDraft ? (
                    <Badge variant="warning" size="sm">
                      草稿待发布
                    </Badge>
                  ) : null}
                  {document.contentSource === "default" ? (
                    <Badge variant="outline" size="sm">
                      系统默认内容
                    </Badge>
                  ) : null}
                </div>

                <dl className="mt-3 space-y-1.5 text-xs text-ink-muted">
                  <div className="flex items-start justify-between gap-3">
                    <dt>最近发布</dt>
                    <dd className="text-right">
                      {document.publishedAt ? (
                        <time
                          dateTime={document.publishedAt}
                          title={formatDateTime(document.publishedAt)}
                        >
                          {formatRelativeTime(document.publishedAt)}
                        </time>
                      ) : (
                        "—"
                      )}
                      {document.publishedBy ? (
                        <span className="block text-ink-faint">
                          {document.publishedBy}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt>草稿最后编辑</dt>
                    <dd className="text-right">
                      {document.draftUpdatedAt ? (
                        <time
                          dateTime={document.draftUpdatedAt}
                          title={formatDateTime(document.draftUpdatedAt)}
                        >
                          {formatRelativeTime(document.draftUpdatedAt)}
                        </time>
                      ) : (
                        "—"
                      )}
                      {document.draftUpdatedBy ? (
                        <span className="block text-ink-faint">
                          {document.draftUpdatedBy}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                </dl>

                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                  <a
                    href={meta.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-brand-primary"
                  >
                    查看线上
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                  <Button
                    variant={canWrite ? "primary" : "outline"}
                    size="sm"
                    onClick={() => router.push(`/admin/legal/${document.slug}`)}
                    leftIcon={<Pencil className="h-4 w-4" />}
                  >
                    {canWrite ? "编辑" : "查看"}
                  </Button>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {!loading && documents.length === 0 && !loadError ? (
        <p className="rounded-xl border border-line bg-white p-6 text-center text-sm text-ink-muted">
          暂无可管理的法务文档
        </p>
      ) : null}
    </div>
  );
}

export default function LegalDocumentsPage() {
  return (
    <RequirePermission permissions={["legal:read", "legal:write"]}>
      <LegalDocumentsContent />
    </RequirePermission>
  );
}
