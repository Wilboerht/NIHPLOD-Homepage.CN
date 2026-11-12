"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, History, Plus, RefreshCw, Save, Send } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Textarea } from "@/components/ui/Textarea";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { ApiError, apiDelete, apiGet, apiPost, apiPut, getApiErrorMessage } from "@/lib/api-client";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { createLegalSectionId } from "@/lib/legal-content";
import { cn } from "@/lib/utils";
import { LegalSectionEditor } from "./LegalSectionEditor";
import { LegalPreview } from "./LegalPreview";
import { LegalPublishDialog } from "./LegalPublishDialog";
import { LegalVersionHistory } from "./LegalVersionHistory";
import {
  cloneLegalContent,
  legalContentSignature,
  validatePublishableContent,
} from "./legal-utils";
import type {
  LegalAdminDocumentDetail,
  LegalDocumentContent,
  LegalDocumentSlug,
} from "@/types/legal";

interface LegalDocumentEditorProps {
  slug: LegalDocumentSlug;
}

export function LegalDocumentEditor({ slug }: LegalDocumentEditorProps) {
  const toast = useToast();
  const router = useRouter();
  const { can } = useAdminPermissions();
  const canWrite = can("legal:write");
  const { requireTotp, totpModal } = useTotpConfirm();

  const [document, setDocument] = useState<LegalAdminDocumentDetail | null>(null);
  const [content, setContent] = useState<LegalDocumentContent | null>(null);
  const [baseline, setBaseline] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [removeSectionId, setRemoveSectionId] = useState<string | null>(null);

  const isDirty = content ? legalContentSignature(content) !== baseline : false;
  const { confirmClose } = useUnsavedChanges(isDirty);

  const applyDocument = useCallback(
    (next: LegalAdminDocumentDetail, options?: { resetExpanded?: boolean }) => {
      setDocument(next);
      setContent(cloneLegalContent(next.content));
      setBaseline(legalContentSignature(next.content));
      if (options?.resetExpanded) {
        setExpanded(new Set(next.content.sections.slice(0, 1).map((section) => section.id)));
      }
    },
    []
  );

  const loadDocument = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiGet<LegalAdminDocumentDetail>(`/api/admin/legal/${slug}`);
      applyDocument(data, { resetExpanded: true });
    } catch (error) {
      setLoadError(getApiErrorMessage(error, "加载法务文档失败"));
    } finally {
      setLoading(false);
    }
  }, [applyDocument, slug]);

  useEffect(() => {
    deferInEffect(loadDocument);
  }, [loadDocument]);

  const updateSection = (
    id: string,
    patch: Partial<Pick<LegalDocumentContent["sections"][number], "title" | "body">>
  ) => {
    setContent((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        sections: previous.sections.map((section) =>
          section.id === id ? { ...section, ...patch } : section
        ),
      };
    });
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    setContent((previous) => {
      if (!previous) return previous;
      const target = index + direction;
      if (target < 0 || target >= previous.sections.length) return previous;
      const sections = [...previous.sections];
      [sections[index], sections[target]] = [sections[target], sections[index]];
      return { ...previous, sections };
    });
  };

  const addSection = () => {
    const section = { id: createLegalSectionId(), title: "新章节", body: "" };
    setContent((previous) =>
      previous ? { ...previous, sections: [...previous.sections, section] } : previous
    );
    setExpanded((previous) => new Set(previous).add(section.id));
  };

  const removeSection = () => {
    if (!removeSectionId) return;
    setContent((previous) =>
      previous
        ? {
            ...previous,
            sections: previous.sections.filter((section) => section.id !== removeSectionId),
          }
        : previous
    );
    setRemoveSectionId(null);
  };

  const handleSaveDraft = async () => {
    if (!content || !document) return;
    if (content.sections.some((section) => !section.title.trim())) {
      toast.error("存在未填写标题的章节，请先补全");
      return;
    }
    setSaving(true);
    try {
      const data = await apiPut<LegalAdminDocumentDetail>(`/api/admin/legal/${slug}/draft`, {
        content,
        expectedRevision: document.draftRevision,
      });
      applyDocument(data);
      toast.success("草稿已保存");
    } catch (error) {
      if (error instanceof ApiError && error.code === "STALE_UPDATE") {
        toast.error("草稿已被其他管理员修改，正在刷新最新内容");
        void loadDocument();
      } else {
        toast.error(getApiErrorMessage(error, "保存草稿失败"));
      }
    } finally {
      setSaving(false);
    }
  };

  const handlePublishClick = () => {
    if (!content || !document) return;
    const validation = validatePublishableContent(content);
    if (!validation.ok) {
      toast.error(validation.message ?? "请先补全内容");
      if (validation.emptySectionIds.length > 0) {
        setExpanded((previous) => {
          const next = new Set(previous);
          for (const id of validation.emptySectionIds) next.add(id);
          return next;
        });
      }
      return;
    }
    setPublishOpen(true);
  };

  const confirmPublish = async (note: string) => {
    if (!content || !document) return;
    const publishNote = note.trim();
    if (publishNote.length < 2) {
      toast.error("请填写发布说明（至少 2 个字符）");
      return;
    }
    setPublishing(true);
    const payload = {
      content,
      expectedRevision: document.draftRevision,
      note: publishNote,
    };

    const submit = () =>
      apiPost<LegalAdminDocumentDetail>(`/api/admin/legal/${slug}/publish`, payload);

    try {
      let data: LegalAdminDocumentDetail;
      try {
        data = await submit();
      } catch (error) {
        if (!isTotpRequired(error)) throw error;
        const verified = await requireTotp(error instanceof ApiError ? error.code : undefined);
        if (!verified) return;
        data = await submit();
      }

      applyDocument(data);
      setPublishOpen(false);
      toast.success(`已发布 v${data.publishedVersion}`);
    } catch (error) {
      if (error instanceof ApiError && error.code === "STALE_UPDATE") {
        toast.error("草稿已被其他管理员修改，正在刷新最新内容");
        void loadDocument();
      } else if (error instanceof ApiError && error.code === "NO_CHANGES") {
        toast.info("内容与当前线上版本一致，无需发布");
        setPublishOpen(false);
      } else {
        toast.error(getApiErrorMessage(error, "发布失败"));
      }
    } finally {
      setPublishing(false);
    }
  };

  const handleDiscardDraft = async () => {
    if (!document) return;
    setDiscarding(true);
    try {
      const data = await apiDelete<LegalAdminDocumentDetail>(`/api/admin/legal/${slug}/draft`, {
        expectedRevision: document.draftRevision,
      });
      applyDocument(data);
      setDiscardOpen(false);
      toast.success("草稿已丢弃");
    } catch (error) {
      if (error instanceof ApiError && error.code === "STALE_UPDATE") {
        toast.error("草稿已被其他管理员修改，正在刷新最新内容");
        setDiscardOpen(false);
        void loadDocument();
      } else if (error instanceof ApiError && error.code === "NO_DRAFT") {
        toast.info("草稿已被其他管理员处理，正在刷新最新内容");
        setDiscardOpen(false);
        void loadDocument();
      } else {
        toast.error(getApiErrorMessage(error, "丢弃草稿失败"));
      }
    } finally {
      setDiscarding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-brand-charcoal/55">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        加载中...
      </div>
    );
  }

  if (loadError || !document || !content) {
    return (
      <div className="space-y-4">
        <PageHeader title="法务文档" />
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {loadError ?? "文档不存在"}
        </div>
        <Button
          variant="outline"
          onClick={() => void loadDocument()}
          leftIcon={<RefreshCw className="h-4 w-4" />}
        >
          重试
        </Button>
      </div>
    );
  }

  const statusBadge = document.hasDraft ? (
    <Badge variant="warning">有未发布草稿</Badge>
  ) : document.publishedVersion > 0 ? (
    <Badge variant="success">已发布 v{document.publishedVersion}</Badge>
  ) : (
    <Badge variant="secondary">默认内容（尚未发布）</Badge>
  );

  const draftMeta = [
    document.draftUpdatedBy ? `最后编辑：${document.draftUpdatedBy}` : null,
    document.draftUpdatedAt ? new Date(document.draftUpdatedAt).toLocaleString("zh-CN") : null,
  ]
    .filter(Boolean)
    .join("，");

  const publishDisabled =
    publishing ||
    (!isDirty && document.publishedVersion > 0 && document.contentSource !== "default");

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${document.title} · 法务文档`}
        description="章节正文为纯文本，支持空行分段与轻量 Markdown；发布后会同步到公开页与嵌入页。"
        accessory={statusBadge}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirmClose()) router.push("/admin/legal");
              }}
            >
              返回列表
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewOpen(true)}
              leftIcon={<Eye className="h-4 w-4" />}
            >
              预览
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHistoryOpen(true)}
              leftIcon={<History className="h-4 w-4" />}
            >
              版本历史
            </Button>
            {canWrite ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleSaveDraft()}
                  disabled={!isDirty || saving}
                  leftIcon={<Save className="h-4 w-4" />}
                >
                  {saving ? "保存中..." : "保存草稿"}
                </Button>
                <Button
                  size="sm"
                  onClick={handlePublishClick}
                  disabled={publishDisabled}
                  title={
                    publishDisabled && !publishing ? "内容与线上版本一致，无需发布" : undefined
                  }
                  leftIcon={<Send className="h-4 w-4" />}
                >
                  {publishing ? "发布中..." : "发布"}
                </Button>
              </>
            ) : (
              <Badge variant="secondary">只读</Badge>
            )}
          </div>
        }
      />

      <div
        className={cn(
          "rounded-xl border p-4 text-sm",
          document.contentSource === "default"
            ? "border-sky-200 bg-sky-50 text-sky-800"
            : document.hasDraft || isDirty
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
        )}
      >
        {document.contentSource === "default" ? (
          <p className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {document.publishedVersion > 0
              ? "线上已发布内容校验失败，当前展示代码内置默认内容；请检查后重新发布。"
              : "当前展示代码内置默认内容（尚未发布过版本）。首次发布会生成 v1，并把“最近更新”更新为发布当天。"}
          </p>
        ) : document.hasDraft ? (
          <p>有未发布草稿{draftMeta ? `（${draftMeta}）` : ""}。草稿不会影响线上内容。</p>
        ) : isDirty ? (
          <p>有未保存修改。保存草稿后才会写入数据库；发布时会直接以当前内容生成新版本。</p>
        ) : (
          <p>
            当前内容与线上 v{document.publishedVersion} 一致
            {document.publishedAt
              ? `（发布于 ${new Date(document.publishedAt).toLocaleString("zh-CN")}）`
              : ""}
            。
          </p>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-brand-charcoal/10 bg-white p-4 sm:p-6">
            <h2 className="text-base font-medium text-brand-charcoal">基本信息</h2>
            <p className="mt-1 text-xs text-brand-charcoal/50">
              标题固定为「{document.title}」，避免与导航、页面标题不一致；“最近更新”由发布自动维护。
            </p>
            <div className="mt-4">
              <Textarea
                label="页面描述"
                value={content.description}
                readOnly={!canWrite}
                maxLength={500}
                rows={2}
                onChange={(event) =>
                  setContent((previous) =>
                    previous ? { ...previous, description: event.target.value } : previous
                  )
                }
                hint={`${content.description.length}/500`}
              />
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-medium text-brand-charcoal">章节</h2>
                <p className="text-xs text-brand-charcoal/50">
                  共 {content.sections.length} 章。正文段落之间用空行分隔。
                </p>
              </div>
              {canWrite ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addSection}
                  disabled={content.sections.length >= 80}
                  leftIcon={<Plus className="h-4 w-4" />}
                >
                  添加章节
                </Button>
              ) : null}
            </div>

            {content.sections.map((section, index) => (
              <LegalSectionEditor
                key={section.id}
                section={section}
                index={index}
                total={content.sections.length}
                expanded={expanded.has(section.id)}
                readOnly={!canWrite}
                onToggle={() =>
                  setExpanded((previous) => {
                    const next = new Set(previous);
                    if (next.has(section.id)) next.delete(section.id);
                    else next.add(section.id);
                    return next;
                  })
                }
                onChange={(patch) => updateSection(section.id, patch)}
                onMove={(direction) => moveSection(index, direction)}
                onRemove={() => setRemoveSectionId(section.id)}
              />
            ))}
          </section>

          {canWrite && document.hasDraft ? (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-red-500 hover:bg-red-50 hover:text-red-600"
                onClick={() => setDiscardOpen(true)}
              >
                丢弃草稿
              </Button>
            </div>
          ) : null}
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-brand-charcoal/10 bg-white p-4">
            <h2 className="text-sm font-semibold text-brand-charcoal">发布状态</h2>
            <dl className="mt-3 space-y-2 text-xs text-brand-charcoal/65">
              <div className="flex justify-between gap-3">
                <dt>线上版本</dt>
                <dd className="font-medium text-brand-charcoal">
                  {document.publishedVersion > 0 ? `v${document.publishedVersion}` : "未发布"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>最近更新</dt>
                <dd>{content.lastUpdated}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>草稿修订号</dt>
                <dd className="font-mono">{document.draftRevision}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>当前编辑</dt>
                <dd>{isDirty ? "有未保存修改" : "已同步"}</dd>
              </div>
            </dl>
            <p className="mt-3 border-t border-brand-charcoal/10 pt-3 text-[11px] leading-5 text-brand-charcoal/50">
              发布需要动态验证码（TOTP），并写入审计日志；历史版本永久保留，可随时恢复为草稿。
            </p>
          </section>
        </aside>
      </div>

      <LegalPreview open={previewOpen} onClose={() => setPreviewOpen(false)} content={content} />

      <LegalPublishDialog
        key={publishOpen ? "publish-open" : "publish-closed"}
        open={publishOpen}
        onClose={() => {
          if (!publishing) setPublishOpen(false);
        }}
        onConfirm={confirmPublish}
        loading={publishing}
        content={content}
        baseContent={document.publishedContent}
        nextVersion={document.publishedVersion + 1}
      />

      <LegalVersionHistory
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        slug={slug}
        currentContent={content}
        revision={document.draftRevision}
        readOnly={!canWrite}
        onRestored={(next) => {
          applyDocument(next);
        }}
      />

      <ConfirmDialog
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        onConfirm={handleDiscardDraft}
        title="丢弃当前草稿？"
        description="丢弃后草稿内容将立即删除，线上已发布内容不受影响。"
        type="danger"
        confirmText="丢弃草稿"
        loading={discarding}
      />

      <ConfirmDialog
        open={Boolean(removeSectionId)}
        onClose={() => setRemoveSectionId(null)}
        onConfirm={removeSection}
        title="删除这个章节？"
        description="删除后需要保存草稿才会生效；发布前仍可通过版本历史恢复。"
        type="danger"
        confirmText="删除章节"
      />

      {totpModal}
    </div>
  );
}
