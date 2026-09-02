"use client";

/**
 * 消费补录面板（会员中心内嵌区块）
 * 用户提交全渠道消费凭证（渠道 + 订单号必填，金额/日期/截图/备注选填），
 * 管理员人工审核后累加历史消费金额，自动重算会员等级。
 * 申请列表展示审核状态与审核备注。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  ImagePlus,
  Loader2,
  Send,
  X,
  XCircle,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { fetchWithAuth, UnauthorizedError } from "@/lib/fetch-with-auth";
import { deferInEffect } from "@/hooks/deferInEffect";
import {
  SPENT_CHANNELS,
  SPENT_CHANNEL_LABELS,
  SPENT_STATUS_LABELS,
  MAX_PENDING_PER_USER,
  MAX_IMAGES,
  receiptImageSrc,
} from "@/lib/spent-adjustment-meta";

interface ApplicationItem {
  id: string;
  channel: string;
  orderNo: string;
  amountClaimed: number | null;
  purchasedAt: string | null;
  images: string[];
  note: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewAmount: number | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

const STATUS_ICONS = {
  PENDING: Clock,
  APPROVED: CheckCircle2,
  REJECTED: XCircle,
} as const;

const STATUS_COLORS = {
  PENDING: "text-stone-500",
  APPROVED: "text-emerald-600",
  REJECTED: "text-red-500",
} as const;

const STATUS_BG = {
  PENDING: "bg-stone-100",
  APPROVED: "bg-emerald-50",
  REJECTED: "bg-red-50",
} as const;

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function SpentAdjustmentPanel() {
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [channel, setChannel] = useState<string>("TMALL");
  const [orderNo, setOrderNo] = useState("");
  const [amountClaimed, setAmountClaimed] = useState("");
  const [purchasedAt, setPurchasedAt] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { error: showError, success: showSuccess } = useToast();
  const { redirectToLogin } = useAuth();

  const pendingCount = applications.filter((a) => a.status === "PENDING").length;
  const reachedPendingLimit = pendingCount >= MAX_PENDING_PER_USER;

  const loadApplications = useCallback(async () => {
    try {
      const res = await fetchWithAuth("/api/user/spent-adjustments");
      const data = await res.json();
      if (data.success) {
        setApplications(data.data.applications);
      }
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        showError("登录已过期，请重新登录");
        redirectToLogin();
        return;
      }
      showError("加载申请记录失败");
    } finally {
      setLoading(false);
    }
  }, [showError, redirectToLogin]);

  useEffect(() => {
    deferInEffect(loadApplications);
  }, [loadApplications]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const remaining = MAX_IMAGES - images.length;
      const selected = Array.from(files).slice(0, remaining);
      for (const file of selected) {
        if (!file.type.startsWith("image/")) {
          showError("仅支持图片格式");
          continue;
        }
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetchWithAuth("/api/user/spent-adjustments/upload", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data.success) {
          setImages((prev) => [...prev, data.data.url]);
        } else {
          showError(data.error?.message || "图片上传失败");
        }
      }
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        showError("登录已过期，请重新登录");
        redirectToLogin();
        return;
      }
      showError("图片上传失败");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async () => {
    if (!orderNo.trim()) {
      showError("请填写订单号或小票号");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetchWithAuth("/api/user/spent-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          orderNo: orderNo.trim(),
          amountClaimed: amountClaimed ? Number(amountClaimed) : undefined,
          purchasedAt: purchasedAt || undefined,
          images,
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showSuccess("申请已提交，等待审核");
        setShowForm(false);
        setOrderNo("");
        setAmountClaimed("");
        setPurchasedAt("");
        setImages([]);
        setNote("");
        setChannel("TMALL");
        await loadApplications();
      } else {
        showError(data.error?.message || "提交失败");
      }
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        showError("登录已过期，请重新登录");
        redirectToLogin();
        return;
      }
      showError("提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium text-stone-700">消费补录</h4>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            aria-expanded={showHistory}
            className="flex items-center gap-0.5 rounded-full border border-stone-200 px-2.5 py-0.5 text-[11px] font-light text-stone-500 transition-colors hover:border-stone-300 hover:text-stone-800"
          >
            历史
            <ChevronRight
              className={`h-3 w-3 transition-transform duration-200 ${
                showHistory ? "rotate-90" : ""
              }`}
            />
          </button>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1 text-xs font-light text-stone-500 transition-colors hover:text-stone-800"
        >
          {showForm ? (
            <>
              收起 <ChevronRight className="h-3.5 w-3.5 rotate-90 transition-transform" />
            </>
          ) : (
            <>
              提交补录申请 <ChevronRight className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      </div>

      <p className="mt-1 text-xs font-light leading-relaxed text-stone-400">
        在天猫 / 京东 / 小程序 /
        线下专柜等全渠道购买的商品，提交订单号（线下填小票号）即可补录消费金额。
        审核通过后计入历史消费，会员等级自动更新；驳回后可重新提交。
      </p>

      {/* 申请表单 */}
      {showForm && (
        <div className="mt-4 space-y-4 rounded-xl border border-stone-200/60 bg-white/40 p-5">
          {reachedPendingLimit && (
            <p className="text-xs text-amber-600">
              您已有 {pendingCount} 条待审核申请，请等待审核完成后再提交新申请。
            </p>
          )}

          {/* 渠道选择 */}
          <div>
            <p className="mb-2 text-xs text-stone-500">购买渠道</p>
            <div className="flex flex-wrap gap-2">
              {SPENT_CHANNELS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannel(c)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    channel === c
                      ? "border-stone-800 bg-stone-800 text-white"
                      : "border-stone-200 text-stone-500 hover:border-stone-300 hover:text-stone-800"
                  }`}
                >
                  {SPENT_CHANNEL_LABELS[c]}
                </button>
              ))}
            </div>
          </div>

          {/* 订单号 */}
          <div>
            <label htmlFor="spent-order-no" className="mb-1 block text-xs text-stone-500">
              订单号 / 小票号 <span className="text-stone-400">（必填）</span>
            </label>
            <input
              id="spent-order-no"
              type="text"
              maxLength={64}
              value={orderNo}
              onChange={(e) => setOrderNo(e.target.value)}
              placeholder="如：天猫订单号 / 线下小票号"
              className="w-full rounded-xl border border-stone-200 bg-white/60 px-4 py-2.5 text-sm text-stone-800 outline-none transition-colors placeholder:text-stone-300 focus:border-stone-400"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* 消费金额（选填） */}
            <div>
              <label htmlFor="spent-amount" className="mb-1 block text-xs text-stone-500">
                消费金额（元）<span className="text-stone-400">（选填，以人工核实为准）</span>
              </label>
              <input
                id="spent-amount"
                type="number"
                min={1}
                max={1000000}
                value={amountClaimed}
                onChange={(e) => setAmountClaimed(e.target.value)}
                placeholder="如：1280"
                className="w-full rounded-xl border border-stone-200 bg-white/60 px-4 py-2.5 text-sm text-stone-800 outline-none transition-colors placeholder:text-stone-300 focus:border-stone-400"
              />
            </div>
            {/* 消费日期（选填） */}
            <div>
              <label htmlFor="spent-date" className="mb-1 block text-xs text-stone-500">
                消费日期 <span className="text-stone-400">（选填）</span>
              </label>
              <input
                id="spent-date"
                type="date"
                value={purchasedAt}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setPurchasedAt(e.target.value)}
                className="w-full rounded-xl border border-stone-200 bg-white/60 px-4 py-2.5 text-sm text-stone-800 outline-none transition-colors focus:border-stone-400"
              />
            </div>
          </div>

          {/* 凭证截图（选填） */}
          <div>
            <p className="mb-2 text-xs text-stone-500">
              凭证截图 <span className="text-stone-400">（选填，最多 {MAX_IMAGES} 张）</span>
            </p>
            <div className="flex flex-wrap gap-3">
              {images.map((url, i) => (
                <div
                  key={url}
                  className="group relative h-20 w-20 overflow-hidden rounded-lg border border-stone-200"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={receiptImageSrc(url, "user")}
                    alt={`凭证 ${i + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label={`删除凭证 ${i + 1}`}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {images.length < MAX_IMAGES && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-stone-300 text-stone-400 transition-colors hover:border-stone-400 hover:text-stone-600 disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <ImagePlus className="h-5 w-5" />
                      <span className="text-[10px]">上传</span>
                    </>
                  )}
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => handleUpload(e.target.files)}
              />
            </div>
          </div>

          {/* 备注（选填） */}
          <div>
            <label htmlFor="spent-note" className="mb-1 block text-xs text-stone-500">
              备注 <span className="text-stone-400">（选填）</span>
            </label>
            <textarea
              id="spent-note"
              maxLength={500}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="补充说明（如订单含多个商品、退款情况等）"
              className="w-full resize-none rounded-xl border border-stone-200 bg-white/60 px-4 py-2.5 text-sm text-stone-800 outline-none transition-colors placeholder:text-stone-300 focus:border-stone-400"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || uploading || reachedPendingLimit}
              className="flex items-center gap-2 rounded-full bg-stone-800 px-6 py-2.5 text-xs text-white transition-colors hover:bg-stone-700 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {submitting ? "提交中..." : "提交申请"}
            </button>
          </div>
        </div>
      )}

      {/* 历史记录 - 默认收起，由标题旁「历史」按钮控制 */}
      {showHistory && (
        <div className="mt-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-stone-300" />
            </div>
          ) : applications.length === 0 ? (
            <p className="py-4 text-center text-xs text-stone-400">暂无补录申请</p>
          ) : (
            applications.map((a) => {
              const StatusIcon = STATUS_ICONS[a.status];
              return (
                <div key={a.id} className="rounded-xl border border-stone-200/60 bg-white/40 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${STATUS_BG[a.status]} ${STATUS_COLORS[a.status]}`}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {SPENT_STATUS_LABELS[a.status]}
                      </span>
                      <span className="text-[11px] text-stone-400">
                        {SPENT_CHANNEL_LABELS[a.channel as keyof typeof SPENT_CHANNEL_LABELS] ??
                          a.channel}
                      </span>
                    </div>
                    <span className="shrink-0 text-[11px] text-stone-300">
                      {formatDate(a.createdAt)}
                    </span>
                  </div>
                  <p className="mt-2 truncate text-sm font-medium text-stone-800">{a.orderNo}</p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-stone-500">
                    {a.amountClaimed != null && (
                      <span>申报 ¥{a.amountClaimed.toLocaleString()}</span>
                    )}
                    {a.purchasedAt && <span>消费日期 {formatDate(a.purchasedAt)}</span>}
                    {a.images.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Camera className="h-3 w-3" /> {a.images.length} 张凭证
                      </span>
                    )}
                  </div>
                  {a.status === "APPROVED" && a.reviewAmount != null && (
                    <p className="mt-2 rounded-lg bg-emerald-50/60 px-3 py-2 text-xs text-emerald-700">
                      已入账 ¥{a.reviewAmount.toLocaleString()}，会员等级已更新
                    </p>
                  )}
                  {a.status === "REJECTED" && a.reviewNote && (
                    <p className="mt-2 rounded-lg bg-red-50/60 px-3 py-2 text-xs text-red-600">
                      驳回原因：{a.reviewNote}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
