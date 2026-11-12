"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Pencil, RefreshCw, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { apiGet, getApiErrorMessage } from "@/lib/api-client";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { formatDateTime } from "@/lib/format";
import type { LegalAdminDocumentSummary, LegalDocumentSlug } from "@/types/legal";

const DOCUMENT_META: Record<LegalDocumentSlug, { description: string; icon: typeof FileText }> = {
  terms: {
    description: "规范网站与产品服务使用、购买、售后与争议解决等条款。",
    icon: ShieldCheck,
  },
  privacy: {
    description: "说明个人信息的收集、使用、共享、存储与用户权利。",
    icon: FileText,
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
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {loadError}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {documents.map((document) => {
          const meta = DOCUMENT_META[document.slug];
          const Icon = meta.icon;
          return (
            <section
              key={document.slug}
              className="flex flex-col rounded-2xl border border-brand-charcoal/10 bg-white p-4 sm:p-5"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold text-brand-charcoal">{document.title}</h2>
                  <p className="mt-1 text-xs leading-5 text-brand-charcoal/55">
                    {meta.description}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {document.hasDraft ? (
                  <Badge variant="warning" size="sm">
                    有未发布草稿
                  </Badge>
                ) : document.publishedVersion > 0 ? (
                  <Badge variant="success" size="sm">
                    已发布 v{document.publishedVersion}
                  </Badge>
                ) : (
                  <Badge variant="secondary" size="sm">
                    默认内容（尚未发布）
                  </Badge>
                )}
                {document.contentSource === "default" ? (
                  <Badge variant="outline" size="sm">
                    代码内置默认值
                  </Badge>
                ) : null}
              </div>

              <dl className="mt-3 space-y-1.5 text-xs text-brand-charcoal/55">
                <div className="flex justify-between gap-3">
                  <dt>最近发布</dt>
                  <dd>{document.publishedAt ? formatDateTime(document.publishedAt) : "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>草稿最后编辑</dt>
                  <dd>{document.draftUpdatedAt ? formatDateTime(document.draftUpdatedAt) : "—"}</dd>
                </div>
              </dl>

              <div className="mt-4 flex flex-1 items-end justify-end">
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

      {!loading && documents.length === 0 && !loadError ? (
        <p className="rounded-xl border border-brand-charcoal/10 bg-white p-6 text-center text-sm text-brand-charcoal/55">
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
