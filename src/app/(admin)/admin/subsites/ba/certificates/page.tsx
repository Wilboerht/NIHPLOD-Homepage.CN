"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, FileCheck2, Plus, RefreshCw } from "lucide-react";
import { apiGet, apiPost, apiRequest, getApiErrorMessage } from "@/lib/api-client";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";
import { deferInEffect } from "@/hooks/deferInEffect";
import { PageHeader } from "@/components/admin/PageHeader";
import { AdminSearchInput } from "@/components/admin/AdminSearchInput";
import { AdminHubTabs } from "@/components/admin/AdminHubTabs";
import { PanelCard } from "@/components/admin/PanelCard";
import { DataTable, RequirePermission, type Column } from "@/components/admin";
import { BaCertificateSealField } from "@/components/admin/BaCertificateSealField";
import {
  BaCertificateIssueDialog,
  type BaCertificateIssueResult,
} from "@/components/admin/BaCertificateIssueDialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useListQuery } from "@/hooks/useListQuery";
import { useUrlDetail } from "@/hooks/useUrlDetail";
import { useSensitiveReveal } from "@/hooks/useSensitiveReveal";
import { useToast } from "@/components/ui/Toast";
import type {
  BaCertificateDetail,
  BaCertificateDraft,
  BaCertificateListItem,
  BaCertificateListData,
  BaCertificateMeta,
} from "@/lib/ba-certificates";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "待审核",
  ISSUED: "已签发",
  UPCOMING: "待生效",
  EXPIRED: "已过期",
  REVOKED: "已吊销",
  REJECTED: "已拒绝",
};

const STATUS_VARIANTS: Record<string, "success" | "warning" | "danger" | "secondary"> = {
  PENDING: "warning",
  ISSUED: "success",
  UPCOMING: "warning",
  EXPIRED: "secondary",
  REVOKED: "danger",
  REJECTED: "danger",
};

const EMPTY_DRAFT: BaCertificateDraft = {
  companyName: "",
  shopName: "",
  phone: "",
  scopeText: "",
  startDate: "",
  endDate: "",
  sealImage: "",
};

function dateToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function CertificatesContent() {
  const toast = useToast();
  const { can } = useAdminPermissions();
  const { requireTotp, totpModal } = useTotpConfirm();
  const { get, getNumber, update } = useListQuery();
  const page = getNumber("page", 1);
  const statusParam = get("status", "ALL");
  const status = ["ALL", "PENDING", "ISSUED", "UPCOMING", "EXPIRED", "REVOKED", "REJECTED"].includes(
    statusParam
  )
    ? statusParam
    : "ALL";
  const search = get("search");
  const { value: certificateParam, open: openCertificateUrl, close: closeCertificateUrl } =
    useUrlDetail("certificate");
  const [items, setItems] = useState<BaCertificateListItem[]>([]);
  const [meta, setMeta] = useState<BaCertificateMeta | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"submit" | "issue">("submit");
  const [draft, setDraft] = useState<BaCertificateDraft>(EMPTY_DRAFT);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [detail, setDetail] = useState<BaCertificateDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [sealUploading, setSealUploading] = useState(false);
  const [sealFieldSessionKey, setSealFieldSessionKey] = useState(0);
  const [previewStale, setPreviewStale] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueCertificate, setIssueCertificate] = useState<BaCertificateListItem | null>(null);
  const [issueSessionKey, setIssueSessionKey] = useState(0);
  const loadRequestRef = useRef(0);
  const previewRequestRef = useRef(0);
  const previewInFlightRef = useRef(false);
  const submitKeyRef = useRef<{ signature: string; key: string } | null>(null);
  const detailLoadingRef = useRef<string | null>(null);
  const phoneReveal = useSensitiveReveal();

  const pageSize = 20;

  // 详情抽屉通过 ?certificate= 控制，只属于页面局部状态；
  // 不能让它的 URL 变化导致 update/load 身份变化并重新拉取列表。
  const updateRef = useRef(update);
  useEffect(() => {
    updateRef.current = update;
  }, [update]);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<BaCertificateListData>("/api/admin/subsites/ba/certificates", {
        page,
        pageSize,
        status,
        q: search || undefined,
      });
      if (requestId !== loadRequestRef.current) return;
      const nextTotalPages = Math.max(1, Math.ceil(data.total / pageSize));
      if (page > nextTotalPages) {
        updateRef.current({ page: String(nextTotalPages) }, { replace: true, resetPage: false });
        return;
      }
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      if (requestId === loadRequestRef.current) {
        setError(getApiErrorMessage(err, "加载证书失败"));
      }
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => deferInEffect(load), 300);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    apiGet<BaCertificateMeta>("/api/admin/subsites/ba/certificates/meta")
      .then((data) => {
        setMeta(data);
        setDraft((current) => ({
          ...current,
          scopeText: current.scopeText || data.defaultScopeText,
          startDate: current.startDate || dateToday(),
        }));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const canIssue = can("ba:certificates:issue");
  const canSubmit = can("ba:certificates:submit");

  const withStepUp = async <T,>(action: () => Promise<T>): Promise<T | null> => {
    try {
      return await action();
    } catch (err) {
      if (!isTotpRequired(err)) throw err;
      const verified = await requireTotp();
      if (!verified) return null;
      return action();
    }
  };

  const openCreate = (mode: "submit" | "issue") => {
    setEditingId(null);
    setFormMode(mode);
    setDraft({
      ...EMPTY_DRAFT,
      scopeText: meta?.defaultScopeText || "",
      startDate: dateToday(),
      endDate: "",
    });
    setPreviewUrl(null);
    setPreviewStale(false);
    setSealUploading(false);
    setSealFieldSessionKey((key) => key + 1);
    previewRequestRef.current += 1;
    previewInFlightRef.current = false;
    setPreviewLoading(false);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setPreviewUrl(null);
    setPreviewStale(false);
    setSealUploading(false);
    setSealFieldSessionKey((key) => key + 1);
    previewRequestRef.current += 1;
    previewInFlightRef.current = false;
    setPreviewLoading(false);
    submitKeyRef.current = null;
  };

  const updateDraft = (key: keyof BaCertificateDraft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    if (previewUrl || previewInFlightRef.current) {
      previewRequestRef.current += 1;
      previewInFlightRef.current = false;
      setPreviewLoading(false);
      setPreviewUrl(null);
      setPreviewStale(true);
    }
  };

  const preview = async () => {
    if (sealUploading) return;
    const requestId = ++previewRequestRef.current;
    previewInFlightRef.current = true;
    setPreviewLoading(true);
    try {
      const csrf = document.cookie.match(/(?:^|;\s*)__Host-csrf_token=([^;]+)/)?.[1];
      const response = await fetch("/api/admin/subsites/ba/certificates/preview", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "X-CSRF-Token": decodeURIComponent(csrf) } : {}),
        },
        body: JSON.stringify({ draft }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message || "预览失败");
      }
      const blob = await response.blob();
      if (requestId !== previewRequestRef.current) return;
      setPreviewUrl(URL.createObjectURL(blob));
      setPreviewStale(false);
    } catch (err) {
      if (requestId === previewRequestRef.current) {
        toast.error(err instanceof Error ? err.message : "预览失败");
      }
    } finally {
      if (requestId === previewRequestRef.current) {
        previewInFlightRef.current = false;
        setPreviewLoading(false);
      }
    }
  };

  const downloadCertificate = async (id: string, format: "png" | "pdf", certNumber: string) => {
    try {
      const response = await fetch(
        `/api/admin/subsites/ba/certificates/${encodeURIComponent(id)}/download?format=${format}`,
        { credentials: "include" }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message || "下载失败");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${certNumber}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "下载失败"));
    }
  };

  const submitDraft = async () => {
    if (sealUploading) return;
    setActionLoading(true);
    try {
      const signature = JSON.stringify({ editingId, formMode, draft });
      if (!submitKeyRef.current || submitKeyRef.current.signature !== signature) {
        submitKeyRef.current = { signature, key: crypto.randomUUID() };
      }
      const idempotencyKey = submitKeyRef.current.key;
      const result = await withStepUp(() =>
        editingId
          ? apiRequest<BaCertificateListItem>(
              `/api/admin/subsites/ba/certificates/${encodeURIComponent(editingId)}`,
              {
                method: "PATCH",
                body: { draft, idempotencyKey },
              }
            )
          : apiPost<BaCertificateListItem>("/api/admin/subsites/ba/certificates", {
              mode: formMode,
              draft,
              idempotencyKey,
            })
      );
      if (!result) return;
      submitKeyRef.current = null;
      toast.success(editingId ? "证书已更新" : formMode === "issue" ? "证书已核发" : "证书已提报");
      closeForm();
      await load();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "提交失败"));
    } finally {
      setActionLoading(false);
    }
  };

  const openDetail = async (id: string) => {
    if (detailLoadingRef.current === id) return;
    detailLoadingRef.current = id;
    phoneReveal.hide();
    openCertificateUrl(id);
    try {
      const data = await apiGet<BaCertificateDetail>(
        `/api/admin/subsites/ba/certificates/${encodeURIComponent(id)}`
      );
      if (new URLSearchParams(window.location.search).get("certificate") !== id) return;
      setDetail(data);
      setDetailOpen(true);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "加载证书详情失败"));
    } finally {
      if (detailLoadingRef.current === id) detailLoadingRef.current = null;
    }
  };

  useEffect(() => {
    if (!certificateParam) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDetailOpen(false);
      return;
    }
    if (detail?.certificate.id === certificateParam && detailOpen) return;
    void openDetail(certificateParam);
    // 仅在 URL 参数变化时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [certificateParam]);

  const runAction = async (action: "reject" | "revoke" | "delete") => {
    if (!detail) return;
    const reason =
      window
        .prompt(
          action === "delete"
            ? "请输入删除原因"
            : action === "revoke"
              ? "请输入吊销原因"
              : "请输入拒绝原因",
          ""
        )
        ?.trim() ?? "";
    if (!reason) return;
    setActionLoading(true);
    try {
      const result = await withStepUp(() =>
        apiPost(
          `/api/admin/subsites/ba/certificates/${encodeURIComponent(detail.certificate.id)}/${action}`,
          {
            reason: reason || undefined,
            idempotencyKey: crypto.randomUUID(),
          }
        )
      );
      if (result === null) return;
      toast.success("操作成功");
      phoneReveal.hide();
      setDetailOpen(false);
      await load();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "操作失败"));
    } finally {
      setActionLoading(false);
    }
  };

  const openIssueDialog = (certificate: BaCertificateListItem) => {
    phoneReveal.hide();
    setIssueSessionKey((key) => key + 1);
    setIssueCertificate(certificate);
    setIssueOpen(true);
    setDetailOpen(false);
    closeCertificateUrl();
  };

  const handleIssueConfirm = async ({
    draft: issueDraft,
    idempotencyKey,
  }: {
    draft: BaCertificateDraft;
    idempotencyKey: string;
  }): Promise<BaCertificateIssueResult> => {
    if (!issueCertificate) return "cancelled";
    const result = await withStepUp(() =>
      apiPost<BaCertificateListItem>(
        `/api/admin/subsites/ba/certificates/${encodeURIComponent(issueCertificate.id)}/issue`,
        { draft: issueDraft, idempotencyKey }
      )
    );
    if (result === null) return "cancelled";
    toast.success("证书已核发");
    setIssueOpen(false);
    setIssueCertificate(null);
    await load();
    return "issued";
  };

  const certificateColumns: Column<BaCertificateListItem>[] = [
    {
      key: "certNumber",
      title: "证书编号",
      width: "160px",
      render: (_, item) => (
        <span className="font-mono text-xs text-ink-muted">{item.certNumber}</span>
      ),
    },
    {
      key: "companyName",
      title: "公司 / 店铺",
      width: "220px",
      render: (_, item) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-brand-charcoal">{item.companyName}</p>
          <p className="truncate text-xs text-ink-muted">{item.shopName}</p>
        </div>
      ),
    },
    {
      key: "scopeText",
      title: "授权范围",
      width: "260px",
      render: (_, item) => (
        <p className="line-clamp-2 text-xs leading-relaxed text-brand-charcoal/70">
          {item.scopeText}
        </p>
      ),
    },
    {
      key: "displayStatus",
      title: "状态",
      width: "100px",
      render: (_, item) => (
        <Badge variant={STATUS_VARIANTS[item.displayStatus] ?? "secondary"}>
          {STATUS_LABELS[item.displayStatus] ?? item.displayStatus}
        </Badge>
      ),
    },
    {
      key: "validity",
      title: "有效期",
      width: "160px",
      render: (_, item) => (
        <span className="text-xs text-brand-charcoal/70">
          {item.startDate} ~ {item.endDate}
        </span>
      ),
    },
    {
      key: "auditorName",
      title: "操作人",
      width: "110px",
      render: (_, item) => (
        <span className="text-xs text-brand-charcoal/70">{item.auditorName ?? "-"}</span>
      ),
    },
    {
      key: "actions",
      title: "操作",
      width: "150px",
      align: "right",
      render: (_, item) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => void openDetail(item.id)}>
            详情
          </Button>
          {item.allowedActions.downloadPng &&
            item.artifact.pngReady &&
            can("ba:certificates:download") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void downloadCertificate(item.id, "png", item.certNumber)}
              >
                <Download className="mr-1 h-3.5 w-3.5" />
                PNG
              </Button>
            )}
        </div>
      ),
    },
  ];

  const renderCertificateMobileCard = (item: BaCertificateListItem) => (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs text-ink-muted">{item.certNumber}</p>
          <p className="mt-1 truncate font-medium text-brand-charcoal">{item.companyName}</p>
          <p className="truncate text-xs text-ink-muted">{item.shopName}</p>
        </div>
        <Badge variant={STATUS_VARIANTS[item.displayStatus] ?? "secondary"}>
          {STATUS_LABELS[item.displayStatus] ?? item.displayStatus}
        </Badge>
      </div>
      <p className="mt-2 line-clamp-2 text-xs text-brand-charcoal/70">{item.scopeText}</p>
      <p className="mt-2 text-xs text-ink-muted">
        {item.startDate} ~ {item.endDate}
      </p>
      <div className="mt-2 flex justify-end gap-1 border-t border-line pt-2">
        <Button variant="ghost" size="sm" onClick={() => void openDetail(item.id)}>
          详情
        </Button>
        {item.allowedActions.downloadPng &&
          item.artifact.pngReady &&
          can("ba:certificates:download") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void downloadCertificate(item.id, "png", item.certNumber)}
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              PNG
            </Button>
          )}
      </div>
    </div>
  );

  const today = useMemo(() => dateToday(), []);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="BA 证书管理"
        description="品牌授权证书查看、核发、吊销与下载；业务状态由 BA 子站执行。"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              刷新
            </Button>
            {canSubmit && (
              <Button variant="outline" size="sm" onClick={() => openCreate("submit")}>
                <Plus className="mr-1.5 h-4 w-4" />
                提报证书
              </Button>
            )}
            {canIssue && (
              <Button size="sm" onClick={() => openCreate("issue")}>
                <FileCheck2 className="mr-1.5 h-4 w-4" />
                直接核发
              </Button>
            )}
          </div>
        }
      />

      <AdminHubTabs section="ba" />

      <PanelCard className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row">
            <AdminSearchInput
              value={search}
              onCommit={(next) => update({ search: next || null }, { replace: true })}
              ariaLabel="搜索证书"
              placeholder="搜索证书编号、公司或店铺"
              className="flex-1"
            />
            <div className="w-full sm:w-40">
              <Select
                aria-label="按证书状态筛选"
                value={status}
                onChange={(event) =>
                  update({ status: event.target.value === "ALL" ? null : event.target.value })
                }
                options={[
                  { value: "ALL", label: "全部状态" },
                  { value: "PENDING", label: "待审核" },
                  { value: "UPCOMING", label: "待生效" },
                  { value: "ISSUED", label: "已签发" },
                  { value: "EXPIRED", label: STATUS_LABELS.EXPIRED },
                  { value: "REVOKED", label: STATUS_LABELS.REVOKED },
                  { value: "REJECTED", label: STATUS_LABELS.REJECTED },
                ]}
              />
            </div>
          </div>
          <span className="text-xs text-ink-muted">共 {total} 条</span>
        </div>

      </PanelCard>

      <DataTable
        columns={certificateColumns}
        data={items}
        loading={loading}
        error={error}
        onRetry={load}
        rowKey="id"
        minWidth="900px"
        emptyText="暂无证书"
        ariaLabel="BA 证书列表"
        onRowClick={(item) => void openDetail(item.id)}
        pagination={{
          page,
          pageSize,
          total,
          onChange: (nextPage) => update({ page: String(nextPage) }, { resetPage: false }),
        }}
        mobileCard={renderCertificateMobileCard}
      />

      <Modal
        open={formOpen}
        onClose={closeForm}
        closeGuard={() => !actionLoading}
        title={formMode === "issue" ? "直接核发证书" : "提报待审证书"}
        size="xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeForm} disabled={actionLoading}>
              取消
            </Button>
            <Button
              variant="outline"
              onClick={() => void preview()}
              loading={previewLoading}
              disabled={sealUploading || actionLoading}
            >
              生成预览
            </Button>
            <Button
              onClick={() => void submitDraft()}
              loading={actionLoading}
              disabled={sealUploading}
            >
              {formMode === "issue" ? "确认核发" : "提交审核"}
            </Button>
          </div>
        }
      >
        {formMode === "issue" && canIssue && (
          <BaCertificateSealField
            key={sealFieldSessionKey}
            value={draft.sealImage ?? ""}
            onChange={(url) => updateDraft("sealImage", url)}
            onUploadingChange={setSealUploading}
            disabled={actionLoading}
            className="mb-4"
          />
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <Input
              label="公司名称"
              value={draft.companyName}
              onChange={(event) => updateDraft("companyName", event.target.value)}
            />
            <Input
              label="店铺 / 平台名称"
              value={draft.shopName}
              onChange={(event) => updateDraft("shopName", event.target.value)}
            />
            <Input
              label="手机号"
              value={draft.phone ?? ""}
              onChange={(event) => updateDraft("phone", event.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="开始日期"
                type="date"
                value={draft.startDate ?? ""}
                onChange={(event) => updateDraft("startDate", event.target.value)}
              />
              <Input
                label="结束日期"
                type="date"
                min={today}
                value={draft.endDate ?? ""}
                onChange={(event) => updateDraft("endDate", event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-3">
            <label className="text-sm font-medium text-brand-charcoal">授权范围</label>
            <textarea
              value={draft.scopeText}
              onChange={(event) => updateDraft("scopeText", event.target.value)}
              rows={10}
              className="w-full rounded-lg border border-line-strong p-3 text-sm outline-none focus:border-brand-primary"
            />
          </div>
        </div>
        {formMode === "submit" && (
          <p className="mt-3 text-xs text-ink-muted">
            核发时由管理员确认签章（默认使用系统公章）；建议先“生成预览”核对证书信息。
          </p>
        )}
        {previewStale && !previewUrl && (
          <p className="mt-3 text-xs text-status-warning-fg" role="status">
            内容已更新，请重新生成预览。
          </p>
        )}
        {previewUrl && (
          <div className="mt-4 overflow-hidden rounded-lg border border-line bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="证书预览"
              width={800}
              height={1131}
              decoding="async"
              className="mx-auto max-h-[560px] w-auto"
            />
            <p className="mt-2 px-2 text-center text-xs text-ink-muted">
              {formMode === "submit"
                ? "预览带“审核中 · 未核发”水印，最终证书以管理员核发为准；签章由公司统一加盖。"
                : draft.sealImage
                  ? "当前预览签章：自定义签章"
                  : "当前预览签章：系统默认公章"}
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={detailOpen}
        onClose={() => {
          phoneReveal.hide();
          setDetailOpen(false);
          closeCertificateUrl();
        }}
        title={detail?.certificate.certNumber ?? "证书详情"}
        size="xl"
        variant="drawer"
        footer={
          detail && (
            <div className="flex flex-wrap justify-end gap-2">
              {detail.certificate.allowedActions.update && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setDraft({
                      companyName: detail.certificate.companyName,
                      shopName: detail.certificate.shopName,
                      phone: "",
                      scopeText: detail.certificate.scopeText,
                      startDate: detail.certificate.startDate,
                      endDate: detail.certificate.endDate,
                    });
                    setEditingId(detail.certificate.id);
                    setFormMode("submit");
                    setDetailOpen(false);
                    setFormOpen(true);
                  }}
                >
                  编辑待审
                </Button>
              )}
              {detail.certificate.allowedActions.issue && (
                <Button
                  onClick={() => openIssueDialog(detail.certificate)}
                  disabled={actionLoading}
                >
                  核发
                </Button>
              )}
              {detail.certificate.allowedActions.reject && (
                <Button
                  variant="outline"
                  onClick={() => void runAction("reject")}
                  loading={actionLoading}
                >
                  拒绝
                </Button>
              )}
              {detail.certificate.allowedActions.revoke && (
                <Button
                  variant="danger"
                  onClick={() => void runAction("revoke")}
                  loading={actionLoading}
                >
                  吊销
                </Button>
              )}
              {detail.certificate.allowedActions.delete && (
                <Button
                  variant="danger"
                  onClick={() => void runAction("delete")}
                  loading={actionLoading}
                >
                  删除
                </Button>
              )}
            </div>
          )
        }
      >
        {detail && (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-ink-muted">状态</div>
                  <Badge variant={STATUS_VARIANTS[detail.certificate.displayStatus] ?? "secondary"}>
                    {STATUS_LABELS[detail.certificate.displayStatus] ??
                      detail.certificate.displayStatus}
                  </Badge>
                </div>
                <div>
                  <div className="text-xs text-ink-muted">有效期</div>
                  <div>
                    {detail.certificate.startDate} ~ {detail.certificate.endDate}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-ink-muted">公司</div>
                  <div>{detail.certificate.companyName}</div>
                </div>
                <div>
                  <div className="text-xs text-ink-muted">店铺</div>
                  <div>{detail.certificate.shopName}</div>
                </div>
                <div>
                  <div className="text-xs text-ink-muted">手机号</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span>
                      {phoneReveal.revealed && detail.certificate.phone
                        ? detail.certificate.phone
                        : detail.certificate.phoneMasked ?? "-"}
                    </span>
                    {detail.certificate.phone && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => (phoneReveal.revealed ? phoneReveal.hide() : phoneReveal.reveal())}
                      >
                        {phoneReveal.revealed
                          ? `隐藏（${phoneReveal.remainingSeconds}s）`
                          : "查看完整手机号"}
                      </Button>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-ink-muted">提报人</div>
                  <div>{detail.certificate.auditorName ?? "-"}</div>
                </div>
              </div>
              <div>
                <div className="text-xs text-ink-muted">授权范围</div>
                <p className="whitespace-pre-wrap leading-relaxed">
                  {detail.certificate.scopeText}
                </p>
              </div>
              <div>
                <div className="mb-2 text-xs text-ink-muted">操作时间线</div>
                <div className="space-y-2">
                  {detail.timeline.length === 0 ? (
                    <p className="text-xs text-ink-muted">暂无记录</p>
                  ) : (
                    detail.timeline.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-lg border border-line p-3 text-xs"
                      >
                        <div className="font-medium">{item.action}</div>
                        {item.comment && (
                          <div className="mt-1 text-brand-charcoal/70">{item.comment}</div>
                        )}
                        {item.reason && (
                          <div className="mt-1 text-ink-muted">原因：{item.reason}</div>
                        )}
                        <div className="mt-1 text-ink-faint">
                          {item.actorName ?? "-"} ·{" "}
                          {new Date(item.createdAt).toLocaleString("zh-CN")}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-3">
              {(detail.certificate.displayStatus === "PENDING" ||
                detail.certificate.displayStatus === "REJECTED" ||
                (detail.certificate.artifact.pngReady && can("ba:certificates:download"))) ? (
                <div className="overflow-hidden rounded-lg border border-line bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/admin/subsites/ba/certificates/${detail.certificate.id}/preview`}
                    alt="证书预览"
                    width={800}
                    height={1131}
                    decoding="async"
                    className="h-auto w-full"
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-line bg-surface-subtle p-4 text-xs text-ink-muted">
                  证书文件尚未生成，或当前账号没有下载权限。
                </div>
              )}
              {detail.certificate.allowedActions.downloadPng && detail.certificate.artifact.pngReady && can("ba:certificates:download") && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    void downloadCertificate(
                      detail.certificate.id,
                      "png",
                      detail.certificate.certNumber
                    )
                  }
                >
                  <Download className="mr-2 h-4 w-4" />
                  下载 PNG
                </Button>
              )}
              {detail.certificate.allowedActions.downloadPdf && detail.certificate.artifact.pdfReady && can("ba:certificates:download") && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    void downloadCertificate(
                      detail.certificate.id,
                      "pdf",
                      detail.certificate.certNumber
                    )
                  }
                >
                  <Download className="mr-2 h-4 w-4" />
                  下载 PDF
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <BaCertificateIssueDialog
        key={issueSessionKey}
        open={issueOpen}
        certificate={issueCertificate}
        onClose={() => {
          setIssueOpen(false);
          setIssueCertificate(null);
        }}
        onConfirm={handleIssueConfirm}
      />

      {totpModal}
    </div>
  );
}

export default function BaCertificatesPage() {
  return (
    <RequirePermission permission="ba:certificates:read">
      <CertificatesContent />
    </RequirePermission>
  );
}

