"use client";

/**
 * 代客补录弹窗（管理端）
 *
 * 客服收到用户补录请求时代为填写：先检索并选择目标用户，再录入渠道/订单号/凭证。
 * 提交后仅生成 PENDING 申请，不直接入账；拥有 spent:review 的管理员可自行审核，
 * 仅有 spent:create 的客服需由其他有审核权限的管理员处理（资金操作分离）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, ImagePlus, Loader2, Search, Send, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { localDateStr } from "@/lib/local-date";
import { levelDisplay } from "@/lib/membership";
import {
  MAX_DEALER_NAME_LENGTH,
  MAX_IMAGES,
  SPENT_CHANNELS,
  SPENT_CHANNEL_LABELS,
} from "@/lib/spent-adjustment-meta";

interface AdminUserOption {
  id: string;
  phone: string;
  nickname: string | null;
  status: "ACTIVE" | "SUSPENDED" | "BANNED" | "DELETED";
  membershipLevel: string;
}

export interface CreatedApplication {
  id: string;
  status: string;
  statusLabel: string;
}

const USER_STATUS_LABELS: Record<AdminUserOption["status"], string> = {
  ACTIVE: "正常",
  SUSPENDED: "冻结",
  BANNED: "封禁",
  DELETED: "已注销",
};

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function SpentOnBehalfModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (application: CreatedApplication) => void;
}) {
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<AdminUserOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUserOption | null>(null);

  const [channel, setChannel] = useState<(typeof SPENT_CHANNELS)[number]>("TMALL");
  const [orderNo, setOrderNo] = useState("");
  const [dealerName, setDealerName] = useState("");
  const [amountClaimed, setAmountClaimed] = useState("");
  const [purchasedAt, setPurchasedAt] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const localPreviewsRef = useRef<Record<string, string>>({});
  const requestIdRef = useRef<string | null>(null);
  const requestIdSignatureRef = useRef("");
  const takeLatestSearch = useLatestRequest();
  const { error: showError } = useToast();

  const clearLocalPreviews = useCallback(() => {
    Object.values(localPreviewsRef.current).forEach((url) => URL.revokeObjectURL(url));
    localPreviewsRef.current = {};
    setLocalPreviews({});
  }, []);

  const resetAll = useCallback(() => {
    setSearch("");
    setSearchResults([]);
    setSearchError(null);
    setSelectedUser(null);
    setChannel("TMALL");
    setOrderNo("");
    setDealerName("");
    setAmountClaimed("");
    setPurchasedAt("");
    setImages([]);
    setNote("");
    setUploading(false);
    setSubmitting(false);
    requestIdRef.current = null;
    requestIdSignatureRef.current = "";
    clearLocalPreviews();
  }, [clearLocalPreviews]);

  // 卸载时释放本地预览 blob，避免内存泄漏
  useEffect(() => {
    return () => {
      Object.values(localPreviewsRef.current).forEach((url) => URL.revokeObjectURL(url));
      localPreviewsRef.current = {};
    };
  }, []);

  // 清空搜索框时同步清空结果（避免在 effect 中同步 setState）
  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (!value.trim()) {
      // 使在途搜索请求失效，避免清空后旧响应回填结果
      takeLatestSearch();
      setSearchResults([]);
      setSearching(false);
      setSearchError(null);
    }
  };

  // 搜索目标用户（300ms 防抖，竞态保护）
  useEffect(() => {
    if (!open || selectedUser) return;
    const keyword = search.trim();
    if (!keyword) return;

    const timer = setTimeout(async () => {
      const isLatest = takeLatestSearch();
      setSearching(true);
      try {
        const result = await apiGet<{ users: AdminUserOption[] }>("/api/admin/users", {
          search: keyword,
          pageSize: 8,
        });
        if (!isLatest()) return;
        setSearchResults(result.users);
        setSearchError(null);
      } catch (e) {
        if (!isLatest()) return;
        setSearchResults([]);
        setSearchError(e instanceof ApiError ? e.message : "搜索用户失败");
      } finally {
        if (isLatest()) setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [open, search, selectedUser, takeLatestSearch]);

  const isDirty =
    Boolean(selectedUser) &&
    (orderNo.trim() !== "" ||
      dealerName.trim() !== "" ||
      amountClaimed !== "" ||
      purchasedAt !== "" ||
      images.length > 0 ||
      note.trim() !== "");
  const { confirmClose } = useUnsavedChanges(isDirty && open);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !selectedUser) return;
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
        formData.append("userId", selectedUser.id);
        try {
          const data = await apiPost<{ url: string; private: boolean }>(
            "/api/admin/spent-adjustments/upload",
            formData,
            { timeoutMs: 60000 }
          );
          setImages((prev) => [...prev, data.url]);
          const previewUrl = URL.createObjectURL(file);
          localPreviewsRef.current = { ...localPreviewsRef.current, [data.url]: previewUrl };
          setLocalPreviews((prev) => ({ ...prev, [data.url]: previewUrl }));
        } catch (e) {
          showError(e instanceof ApiError ? e.message : "图片上传失败");
        }
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeImage = (url: string) => {
    setImages((prev) => prev.filter((item) => item !== url));
    setLocalPreviews((prev) => {
      const local = prev[url];
      if (local) URL.revokeObjectURL(local);
      const next = { ...prev };
      delete next[url];
      localPreviewsRef.current = next;
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!selectedUser) {
      showError("请先选择用户");
      return;
    }
    if (selectedUser.status !== "ACTIVE") {
      showError("该用户当前状态不可提交消费补录");
      return;
    }
    if (!orderNo.trim()) {
      showError("请填写订单号或小票号");
      return;
    }
    if (channel === "DEALER" && !dealerName.trim()) {
      showError("请填写经销商名称");
      return;
    }
    if (amountClaimed) {
      const amount = Number(amountClaimed);
      if (!Number.isInteger(amount) || amount <= 0) {
        showError("消费金额需为正整数（元）");
        return;
      }
    }

    setSubmitting(true);
    try {
      const requestSignature = JSON.stringify({
        userId: selectedUser.id,
        channel,
        orderNo: orderNo.trim(),
        dealerName: channel === "DEALER" ? dealerName.trim() : "",
        amountClaimed: amountClaimed ? Number(amountClaimed) : null,
        purchasedAt,
        images,
        note: note.trim(),
      });
      if (requestIdRef.current && requestIdSignatureRef.current !== requestSignature) {
        requestIdRef.current = null;
      }
      if (!requestIdRef.current) {
        requestIdRef.current = createRequestId();
      }
      requestIdSignatureRef.current = requestSignature;

      const result = await apiPost<{ application: CreatedApplication; idempotent: boolean }>(
        "/api/admin/spent-adjustments",
        {
          userId: selectedUser.id,
          requestId: requestIdRef.current,
          channel,
          orderNo: orderNo.trim(),
          dealerName: channel === "DEALER" ? dealerName.trim() : undefined,
          amountClaimed: amountClaimed ? Number(amountClaimed) : undefined,
          purchasedAt: purchasedAt || undefined,
          images,
          note: note.trim() || undefined,
        }
      );

      requestIdRef.current = null;
      requestIdSignatureRef.current = "";
      resetAll();
      onCreated(result.application);
    } catch (e) {
      showError(e instanceof ApiError ? e.message : "提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    Boolean(selectedUser) &&
    selectedUser?.status === "ACTIVE" &&
    orderNo.trim() !== "" &&
    (channel !== "DEALER" || dealerName.trim() !== "") &&
    !uploading &&
    !submitting;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="代客补录消费记录"
      description="适用于用户委托客服代填：提交后进入待审核队列，不直接计入消费"
      size="lg"
      mobileFullScreen
      closeOnBackdrop={false}
      closeGuard={() => !submitting && !uploading && confirmClose()}
      footer={
        <div className="flex flex-wrap justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => {
              if (confirmClose()) onClose();
            }}
            disabled={submitting}
          >
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            loading={submitting}
            disabled={!canSubmit}
            leftIcon={<Send className="h-4 w-4" />}
          >
            提交待审核
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* 目标用户 */}
        <section>
          <p className="mb-2 text-xs font-medium text-brand-charcoal/70">
            目标用户 <span className="text-red-500">*</span>
          </p>
          {selectedUser ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-charcoal/15 bg-brand-charcoal/[0.02] px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm text-brand-charcoal">
                  {selectedUser.nickname || "未设置昵称"}
                  <span className="ml-2 text-xs text-brand-charcoal/65">{selectedUser.phone}</span>
                </p>
                <p className="mt-0.5 text-xs text-brand-charcoal/65">
                  {levelDisplay(selectedUser.membershipLevel)} ·{" "}
                  {USER_STATUS_LABELS[selectedUser.status]}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={uploading}
                onClick={() => {
                  setSelectedUser(null);
                  handleSearchChange("");
                  // 凭证按目标用户前缀存储，更换用户后旧凭证归属不匹配，必须清空
                  setImages([]);
                  clearLocalPreviews();
                }}
              >
                更换
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-charcoal/65" />
                <Input
                  aria-label="搜索用户"
                  placeholder="输入手机号 / 昵称 / 用户 ID"
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-10"
                  data-autofocus
                />
              </div>
              {searching && (
                <p className="flex items-center gap-1.5 text-xs text-brand-charcoal/65">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  搜索中...
                </p>
              )}
              {searchError && <p className="text-xs text-red-500">{searchError}</p>}
              {!searching && !searchError && search.trim() && searchResults.length === 0 && (
                <p className="text-xs text-brand-charcoal/65">未找到用户，请核对手机号或用户 ID</p>
              )}
              {searchResults.length > 0 && (
                <div className="max-h-56 divide-y divide-brand-charcoal/10 overflow-y-auto rounded-lg border border-brand-charcoal/15">
                  {searchResults.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => setSelectedUser(user)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-brand-charcoal/[0.04]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-brand-charcoal/80">
                          {user.nickname || "未设置昵称"}
                          <span className="ml-2 text-xs text-brand-charcoal/65">{user.phone}</span>
                        </span>
                        <span className="mt-0.5 block text-xs text-brand-charcoal/65">
                          {levelDisplay(user.membershipLevel)} · {USER_STATUS_LABELS[user.status]}
                        </span>
                      </span>
                      <Check className="h-4 w-4 shrink-0 text-brand-charcoal/40" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {selectedUser && selectedUser.status !== "ACTIVE" && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-red-500">
              <AlertCircle className="h-3.5 w-3.5" />
              该用户当前状态不可提交消费补录
            </p>
          )}
        </section>

        <div className="border-t border-brand-charcoal/10" />

        {/* 补录信息 */}
        <section className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium text-brand-charcoal/70">
              购买渠道 <span className="text-red-500">*</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {SPENT_CHANNELS.map((item) => {
                const active = channel === item;
                return (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setChannel(item)}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      active
                        ? "border-brand-primary/40 bg-brand-primary/10 font-medium text-brand-primary"
                        : "border-brand-charcoal/15 text-brand-charcoal/70 hover:border-brand-charcoal/30"
                    }`}
                  >
                    {active && <Check className="h-3 w-3" />}
                    {SPENT_CHANNEL_LABELS[item]}
                  </button>
                );
              })}
            </div>
          </div>

          {channel === "DEALER" && (
            <Input
              label="经销商名称"
              required
              maxLength={MAX_DEALER_NAME_LENGTH}
              value={dealerName}
              onChange={(e) => setDealerName(e.target.value)}
              placeholder="如：XX 美妆集合店 / XX 贸易有限公司"
            />
          )}

          <Input
            label="订单号 / 小票号"
            required
            maxLength={64}
            value={orderNo}
            onChange={(e) => setOrderNo(e.target.value)}
            placeholder="如：天猫订单号 / 线下小票号"
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="消费金额（元，选填）"
              type="number"
              min={1}
              max={1000000}
              value={amountClaimed}
              onChange={(e) => setAmountClaimed(e.target.value)}
              placeholder="以核实金额为准"
            />
            <Input
              label="消费日期（选填）"
              type="date"
              value={purchasedAt}
              max={localDateStr(new Date())}
              onChange={(e) => setPurchasedAt(e.target.value)}
            />
          </div>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-brand-charcoal/70">
                凭证截图 <span className="font-normal text-brand-charcoal/65">（选填）</span>
              </p>
              <span className="text-[11px] text-brand-charcoal/65">
                {images.length}/{MAX_IMAGES}
              </span>
            </div>
            <div className="flex flex-wrap gap-3">
              {images.map((url, index) => (
                <div
                  key={url}
                  className="group relative h-20 w-20 overflow-hidden rounded-lg border border-brand-charcoal/15"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={localPreviews[url] ?? url}
                    alt={`凭证 ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(url)}
                    aria-label={`删除凭证 ${index + 1}`}
                    className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {images.length < MAX_IMAGES && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || !selectedUser}
                  className="flex h-20 w-40 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-brand-charcoal/25 text-brand-charcoal/65 transition-colors hover:border-brand-charcoal/40 hover:text-brand-charcoal disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <ImagePlus className="h-5 w-5" />
                      <span className="text-[11px]">上传凭证截图</span>
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
            {!selectedUser && (
              <p className="mt-1 text-xs text-brand-charcoal/65">请先选择目标用户再上传凭证</p>
            )}
          </section>

          <Textarea
            label="备注（选填）"
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="用户提供的补充说明（如订单含多个商品、退款情况等）"
          />
        </section>
      </div>
    </Modal>
  );
}
