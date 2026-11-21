"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ChevronRight,
  ExternalLink,
  Eye,
  History,
  Plus,
  RefreshCw,
  Save,
  Send,
} from "lucide-react";
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
import { useLegalDraftAutosave } from "@/hooks/useLegalDraftAutosave";
import {
  clearLegalLocalDraft,
  readLegalLocalDraft,
  type LegalLocalDraft,
} from "@/lib/legal-local-draft";
import { createLegalSectionId } from "@/lib/legal-content";
import { LegalSectionEditor } from "./LegalSectionEditor";
import { LegalPublishStatusCard, LegalStatusPills } from "./LegalDocumentStatus";
import { LegalSectionOutline } from "./LegalSectionOutline";
import { LegalPreview } from "./LegalPreview";
import { LegalPublishDialog } from "./LegalPublishDialog";
import { LegalVersionHistory } from "./LegalVersionHistory";
import {
  cloneLegalContent,
  legalContentComparableSignature,
  legalContentSignature,
  validatePublishableContent,
} from "./legal-utils";
import type {
  LegalAdminDocumentDetail,
  LegalDocumentContent,
  LegalDocumentSlug,
  LegalMateriality,
} from "@/types/legal";

interface LegalDocumentEditorProps {
  slug: LegalDocumentSlug;
}

export function LegalDocumentEditor({ slug }: LegalDocumentEditorProps) {
  const toast = useToast();
  const { can } = useAdminPermissions();
  const canWrite = can("legal:write");
  const { requireTotp, totpModal } = useTotpConfirm();

  const [document, setDocument] = useState<LegalAdminDocumentDetail | null>(null);
  const [content, setContent] = useState<LegalDocumentContent | null>(null);
  const [baseline, setBaseline] = useState("");
  const [baselineContent, setBaselineContent] = useState<LegalDocumentContent | null>(null);
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
  const [localDraft, setLocalDraft] = useState<LegalLocalDraft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const isDirty = content ? legalContentSignature(content) !== baseline : false;
  const { confirmClose } = useUnsavedChanges(isDirty);
  useLegalDraftAutosave({ slug, content, isDirty, enabled: canWrite });

  const sectionStateById = useMemo(() => {
    const states: Record<string, { invalid: boolean; changed: boolean }> = {};
    if (!content) return states;
    const previous = new Map(
      (baselineContent?.sections ?? []).map((section) => [section.id, section])
    );
    for (const section of content.sections) {
      const before = previous.get(section.id);
      states[section.id] = {
        invalid: !section.title.trim() || !section.body.trim(),
        changed: !before || before.title !== section.title || before.body !== section.body,
      };
    }
    return states;
  }, [baselineContent, content]);
  const invalidSectionCount = Object.values(sectionStateById).filter(
    (state) => state.invalid
  ).length;

  const applyDocument = useCallback(
    (next: LegalAdminDocumentDetail, options?: { resetExpanded?: boolean }) => {
      setDocument(next);
      setContent(cloneLegalContent(next.content));
      setBaselineContent(cloneLegalContent(next.content));
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

      const stored = readLegalLocalDraft(slug);
      if (
        stored &&
        legalContentComparableSignature(stored.content) !==
          legalContentComparableSignature(data.content)
      ) {
        setLocalDraft(stored);
      } else {
        if (stored) clearLegalLocalDraft(slug);
        setLocalDraft(null);
      }
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
    setLocalDraft(null);
    setFormError(null);
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
    setLocalDraft(null);
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
    setLocalDraft(null);
    const section = { id: createLegalSectionId(), title: "新章节", body: "" };
    setContent((previous) =>
      previous ? { ...previous, sections: [...previous.sections, section] } : previous
    );
    setExpanded((previous) => new Set(previous).add(section.id));
  };

  const scrollToSection = (id: string) => {
    setExpanded((previous) => new Set(previous).add(id));
    window.requestAnimationFrame(() => {
      window.document
        .getElementById(`legal-section-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const expandAllSections = () => {
    if (!content) return;
    setExpanded(new Set(content.sections.map((section) => section.id)));
  };

  const collapseAllSections = () => {
    setExpanded(new Set());
  };

  const removeSection = () => {
    if (!removeSectionId) return;
    setLocalDraft(null);
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
    if (!content || !document || publishing || saving) return;
    const invalidSectionIds = content.sections
      .filter((section) => !section.title.trim())
      .map((section) => section.id);
    if (invalidSectionIds.length > 0) {
      setFormError(`有 ${invalidSectionIds.length} 个章节未填写标题，请补全后再保存。`);
      setExpanded((previous) => {
        const next = new Set(previous);
        for (const id of invalidSectionIds) next.add(id);
        return next;
      });
      scrollToSection(invalidSectionIds[0]);
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const data = await apiPut<LegalAdminDocumentDetail>(`/api/admin/legal/${slug}/draft`, {
        content,
        expectedRevision: document.draftRevision,
      });
      applyDocument(data);
      clearLegalLocalDraft(slug);
      setLocalDraft(null);
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
    if (!content || !document || saving || publishing) return;
    const validation = validatePublishableContent(content);
    if (!validation.ok) {
      setFormError(validation.message ?? "请先补全内容");
      if (validation.emptySectionIds.length > 0) {
        setExpanded((previous) => {
          const next = new Set(previous);
          for (const id of validation.emptySectionIds) next.add(id);
          return next;
        });
        scrollToSection(validation.emptySectionIds[0]);
      }
      return;
    }
    setFormError(null);
    setPublishOpen(true);
  };

  const confirmPublish = async (note: string, materiality: LegalMateriality) => {
    if (!content || !document || saving || publishing) return;
    const publishNote = note.trim();
    if (publishNote.length < 2) {
      toast.error("请填写发布说明（至少 2 个字符）");
      return;
    }
    setFormError(null);
    setPublishing(true);
    const payload = {
      content,
      expectedRevision: document.draftRevision,
      note: publishNote,
      materiality,
      requiresReconsent: materiality === "MATERIAL",
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
      clearLegalLocalDraft(slug);
      setLocalDraft(null);
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
    if (!document || saving || publishing || discarding) return;
    setDiscarding(true);
    try {
      const data = await apiDelete<LegalAdminDocumentDetail>(`/api/admin/legal/${slug}/draft`, {
        expectedRevision: document.draftRevision,
      });
      applyDocument(data);
      clearLegalLocalDraft(slug);
      setLocalDraft(null);
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
      <div className="flex min-h-[50vh] items-center justify-center text-ink-muted">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        加载中...
      </div>
    );
  }

  if (loadError || !document || !content) {
    return (
      <div className="space-y-4">
        <PageHeader title="法务文档" />
        <div className="rounded-xl border border-status-danger-line bg-status-danger-soft p-4 text-sm text-status-danger-strong">
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

  const contentMatchesPublished =
    document.publishedContent !== null &&
    legalContentComparableSignature(content) ===
      legalContentComparableSignature(document.publishedContent);
  const busy = saving || publishing || discarding;
  const publishDisabled = busy || (document.publishedVersion > 0 && contentMatchesPublished);

  const restoreLocalDraft = () => {
    if (!localDraft) return;
    setContent(cloneLegalContent(localDraft.content));
    setLocalDraft(null);
    toast.info("已恢复本地修改，请确认后保存或发布");
  };

  const discardLocalDraft = () => {
    clearLegalLocalDraft(slug);
    setLocalDraft(null);
  };

  const publicHref = `/${document.slug}`;

  return (
    <div className="space-y-6">
      <nav aria-label="面包屑" className="flex flex-wrap items-center gap-1 text-xs text-ink-muted">
        <Link
          href="/admin/legal"
          className="transition-colors hover:text-brand-charcoal"
          onClick={(event) => {
            if (!confirmClose()) event.preventDefault();
          }}
        >
          法务文档
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="text-brand-charcoal/75">{document.title}</span>
      </nav>

      <PageHeader
        title={`${document.title} · 法务文档`}
        description="先保存草稿并预览，确认无误后再发布新版本。公开页和嵌入页会同步更新。"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(publicHref, "_blank", "noopener,noreferrer")}
            leftIcon={<ExternalLink className="h-4 w-4" />}
          >
            查看线上
          </Button>
        }
      />

      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-30 -mx-4 border-y border-line bg-brand-cream/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-0 lg:rounded-xl lg:border lg:px-4 lg:py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <LegalStatusPills document={document} isDirty={isDirty} />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPreviewOpen(true)}
              leftIcon={<Eye className="h-4 w-4" />}
            >
              预览
            </Button>
            <Button
              variant="ghost"
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
                  disabled={!isDirty || busy}
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
        </div>
      </div>

      {formError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-status-danger-line bg-status-danger-soft px-4 py-3 text-sm text-status-danger-strong"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{formError}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const firstInvalid = content.sections.find(
                (section) => !section.title.trim() || !section.body.trim()
              );
              if (firstInvalid) scrollToSection(firstInvalid.id);
            }}
          >
            定位到首个问题
          </Button>
        </div>
      ) : null}

      {canWrite && localDraft ? (
        <div className="rounded-xl border border-status-warning-line bg-status-warning-soft p-4 text-sm text-status-warning-strong">
          <p className="font-medium">检测到本浏览器中未提交的法务草稿</p>
          <p className="mt-1 text-xs leading-5 text-status-warning-strong">
            保存于{" "}
            {localDraft.savedAt ? new Date(localDraft.savedAt).toLocaleString("zh-CN") : "未知时间"}
            ，可能是上次关闭页面时尚未保存的内容。恢复前请确认是否仍需要这些修改。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={restoreLocalDraft}>
              恢复本地修改
            </Button>
            <Button size="sm" variant="outline" onClick={discardLocalDraft}>
              忽略本地修改
            </Button>
          </div>
        </div>
      ) : null}

      {document.contentSource === "default" ? (
        <div className="rounded-xl border border-status-info-line bg-status-info-soft p-4 text-sm text-status-info-strong">
          <p className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {document.publishedVersion > 0
              ? "线上已发布内容校验失败，当前展示代码内置默认内容；请检查后重新发布。"
              : "当前展示代码内置默认内容。首次发布会生成 v1，并把公开页的“最近更新”更新为发布当天。"}
          </p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <section className="rounded-card border border-line bg-white p-4 sm:p-6">
            <h2 className="text-base font-medium text-brand-charcoal">基本信息</h2>
            <p className="mt-1 text-xs text-ink-muted">
              标题固定为「{document.title}」，避免与导航、页面标题不一致；“最近更新”由发布自动维护。
            </p>
            <div className="mt-4">
              <Textarea
                label="页面描述"
                value={content.description}
                readOnly={!canWrite}
                maxLength={500}
                rows={2}
                onChange={(event) => {
                  setLocalDraft(null);
                  setContent((previous) =>
                    previous ? { ...previous, description: event.target.value } : previous
                  );
                }}
                hint={`${content.description.length}/500`}
              />
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-medium text-brand-charcoal">章节</h2>
                <p className="text-xs text-ink-muted">
                  共 {content.sections.length} 章
                  {invalidSectionCount > 0
                    ? ` · ${invalidSectionCount} 个章节待完善`
                    : " · 全部章节已填写"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={collapseAllSections}
                  disabled={expanded.size === 0}
                >
                  全部收起
                </Button>
                <Button variant="ghost" size="sm" onClick={expandAllSections}>
                  全部展开
                </Button>
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
            </div>

            {content.sections.map((section, index) => (
              <LegalSectionEditor
                key={section.id}
                section={section}
                index={index}
                total={content.sections.length}
                expanded={expanded.has(section.id)}
                readOnly={!canWrite}
                changed={sectionStateById[section.id]?.changed}
                invalidTitle={!section.title.trim()}
                invalidBody={!section.body.trim()}
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

            {canWrite ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={addSection}
                disabled={content.sections.length >= 80}
                leftIcon={<Plus className="h-4 w-4" />}
              >
                在末尾添加章节
              </Button>
            ) : null}
          </section>

          {canWrite && document.hasDraft ? (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-status-danger-fg hover:bg-status-danger-soft hover:text-status-danger-fg"
                onClick={() => setDiscardOpen(true)}
                disabled={busy}
              >
                丢弃草稿
              </Button>
            </div>
          ) : null}
        </div>

        <aside className="order-first space-y-4 lg:sticky lg:top-24 lg:order-none lg:self-start">
          <LegalPublishStatusCard document={document} isDirty={isDirty} localDraft={localDraft} />
          <LegalSectionOutline
            sections={content.sections}
            stateById={sectionStateById}
            onSelect={scrollToSection}
          />
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
        slug={slug}
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
          clearLegalLocalDraft(slug);
          setLocalDraft(null);
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
