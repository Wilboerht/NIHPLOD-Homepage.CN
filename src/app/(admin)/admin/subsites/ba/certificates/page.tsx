"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, FileCheck2, Plus, RefreshCw, Search } from "lucide-react";
import { apiGet, apiPost, apiRequest, getApiErrorMessage } from "@/lib/api-client";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";
import { deferInEffect } from "@/hooks/deferInEffect";
import { PageHeader } from "@/components/admin/PageHeader";
import { PanelCard } from "@/components/admin/PanelCard";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
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
  const [items, setItems] = useState<BaCertificateListItem[]>([]);
  const [meta, setMeta] = useState<BaCertificateMeta | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
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
  const loadRequestRef = useRef(0);
  const submitKeyRef = useRef<{ signature: string; key: string } | null>(null);

  const pageSize = 20;

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
        setPage(nextTotalPages);
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
    setFormOpen(true);
  };

  const updateDraft = (key: keyof BaCertificateDraft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const uploadSeal = async (file: File | null) => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const data = await apiRequest<{ url: string }>("/api/admin/subsites/ba/certificates/seal", {
        method: "POST",
        body: formData,
        timeoutMs: 60000,
      });
      updateDraft("sealImage", data.url);
      toast.success("签章已上传");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "签章上传失败"));
    }
  };

  const preview = async () => {
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
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "预览失败");
    } finally {
      setPreviewLoading(false);
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
      setFormOpen(false);
      await load();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "提交失败"));
    } finally {
      setActionLoading(false);
    }
  };

  const openDetail = async (id: string) => {
    try {
      const data = await apiGet<BaCertificateDetail>(
        `/api/admin/subsites/ba/certificates/${encodeURIComponent(id)}`
      );
      setDetail(data);
      setDetailOpen(true);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "加载证书详情失败"));
    }
  };

  const runAction = async (action: "issue" | "reject" | "revoke" | "delete") => {
    if (!detail) return;
    let reason = "";
    if (action !== "issue") {
      reason =
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
    }
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
      setDetailOpen(false);
      await load();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "操作失败"));
    } finally {
      setActionLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
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

      <PanelCard className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-charcoal/40" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="搜索证书编号、公司或店铺"
                className="h-10 w-full rounded-lg border border-brand-charcoal/15 bg-white pl-9 pr-3 text-sm outline-none focus:border-brand-primary"
              />
            </div>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className="h-10 rounded-lg border border-brand-charcoal/15 bg-white px-3 text-sm"
            >
              <option value="ALL">全部状态</option>
              <option value="PENDING">待审核</option>
              <option value="ISSUED">已签发</option>
              <option value="UPCOMING">待生效</option>
              <option value="invalid">已失效</option>
            </select>
          </div>
          <span className="text-xs text-brand-charcoal/60">共 {total} 条</span>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-brand-charcoal/10 text-left text-xs text-brand-charcoal/60">
                <th className="py-2 pr-3">证书编号</th>
                <th className="py-2 pr-3">公司 / 店铺</th>
                <th className="py-2 pr-3">授权范围</th>
                <th className="py-2 pr-3">状态</th>
                <th className="py-2 pr-3">有效期</th>
                <th className="py-2 pr-3">操作人</th>
                <th className="py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-brand-charcoal/50">
                    加载中…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-brand-charcoal/50">
                    暂无证书
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="border-b border-brand-charcoal/5 align-top">
                    <td className="py-3 pr-3 font-mono text-xs">{item.certNumber}</td>
                    <td className="py-3 pr-3">
                      <div className="font-medium">{item.companyName}</div>
                      <div className="text-xs text-brand-charcoal/55">{item.shopName}</div>
                    </td>
                    <td className="max-w-[260px] py-3 pr-3">
                      <div className="line-clamp-2 text-xs leading-relaxed text-brand-charcoal/70">
                        {item.scopeText}
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      <Badge variant={STATUS_VARIANTS[item.displayStatus] ?? "secondary"}>
                        {STATUS_LABELS[item.displayStatus] ?? item.displayStatus}
                      </Badge>
                    </td>
                    <td className="py-3 pr-3 text-xs">
                      {item.startDate} ~ {item.endDate}
                    </td>
                    <td className="py-3 pr-3 text-xs">{item.auditorName ?? "-"}</td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => void openDetail(item.id)}>
                          详情
                        </Button>
                        {item.allowedActions.downloadPng && can("ba:certificates:download") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              void downloadCertificate(item.id, "png", item.certNumber)
                            }
                          >
                            <Download className="mr-1 h-3.5 w-3.5" />
                            PNG
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            上一页
          </Button>
          <span className="text-xs text-brand-charcoal/60">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            下一页
          </Button>
        </div>
      </PanelCard>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={formMode === "issue" ? "直接核发证书" : "提报待审证书"}
        size="xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              取消
            </Button>
            <Button variant="outline" onClick={() => void preview()} loading={previewLoading}>
              生成预览
            </Button>
            <Button onClick={() => void submitDraft()} loading={actionLoading}>
              {formMode === "issue" ? "确认核发" : "提交审核"}
            </Button>
          </div>
        }
      >
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
            {formMode === "issue" && canIssue && (
              <div>
                <label className="text-sm font-medium text-brand-charcoal">自定义签章</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => void uploadSeal(event.target.files?.[0] ?? null)}
                  className="mt-1 block w-full text-xs"
                />
              </div>
            )}
          </div>
          <div className="space-y-3">
            <label className="text-sm font-medium text-brand-charcoal">授权范围</label>
            <textarea
              value={draft.scopeText}
              onChange={(event) => updateDraft("scopeText", event.target.value)}
              rows={10}
              className="w-full rounded-lg border border-brand-charcoal/15 p-3 text-sm outline-none focus:border-brand-primary"
            />
          </div>
        </div>
        {previewUrl && (
          <div className="mt-4 overflow-hidden rounded-lg border border-brand-charcoal/10 bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="证书预览" className="mx-auto max-h-[560px] w-auto" />
          </div>
        )}
      </Modal>

      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={detail?.certificate.certNumber ?? "证书详情"}
        size="xl"
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
                <Button onClick={() => void runAction("issue")} loading={actionLoading}>
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
                  <div className="text-xs text-brand-charcoal/50">状态</div>
                  <Badge variant={STATUS_VARIANTS[detail.certificate.displayStatus] ?? "secondary"}>
                    {STATUS_LABELS[detail.certificate.displayStatus] ??
                      detail.certificate.displayStatus}
                  </Badge>
                </div>
                <div>
                  <div className="text-xs text-brand-charcoal/50">有效期</div>
                  <div>
                    {detail.certificate.startDate} ~ {detail.certificate.endDate}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-brand-charcoal/50">公司</div>
                  <div>{detail.certificate.companyName}</div>
                </div>
                <div>
                  <div className="text-xs text-brand-charcoal/50">店铺</div>
                  <div>{detail.certificate.shopName}</div>
                </div>
                <div>
                  <div className="text-xs text-brand-charcoal/50">手机号</div>
                  <div>{detail.certificate.phoneMasked ?? "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-brand-charcoal/50">提报人</div>
                  <div>{detail.certificate.auditorName ?? "-"}</div>
                </div>
              </div>
              <div>
                <div className="text-xs text-brand-charcoal/50">授权范围</div>
                <p className="whitespace-pre-wrap leading-relaxed">
                  {detail.certificate.scopeText}
                </p>
              </div>
              <div>
                <div className="mb-2 text-xs text-brand-charcoal/50">操作时间线</div>
                <div className="space-y-2">
                  {detail.timeline.length === 0 ? (
                    <p className="text-xs text-brand-charcoal/50">暂无记录</p>
                  ) : (
                    detail.timeline.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-lg border border-brand-charcoal/10 p-3 text-xs"
                      >
                        <div className="font-medium">{item.action}</div>
                        {item.comment && (
                          <div className="mt-1 text-brand-charcoal/70">{item.comment}</div>
                        )}
                        {item.reason && (
                          <div className="mt-1 text-brand-charcoal/60">原因：{item.reason}</div>
                        )}
                        <div className="mt-1 text-brand-charcoal/45">
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
              <div className="overflow-hidden rounded-lg border border-brand-charcoal/10 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/admin/subsites/ba/certificates/${detail.certificate.id}/preview`}
                  alt="证书预览"
                  className="w-full"
                />
              </div>
              {detail.certificate.allowedActions.downloadPng && can("ba:certificates:download") && (
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
              {detail.certificate.allowedActions.downloadPdf && can("ba:certificates:download") && (
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
