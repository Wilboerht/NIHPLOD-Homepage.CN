"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";
import { apiPatch, ApiError, getApiErrorMessage } from "@/lib/api-client";

export function RecordAccountLinkControl({
  kind,
  recordId,
  userId,
  onChanged,
}: {
  kind: "message" | "application";
  recordId: string;
  userId: string | null;
  onChanged: (userId: string | null) => void;
}) {
  const toast = useToast();
  const { requireTotp, totpModal } = useTotpConfirm();
  const [open, setOpen] = useState(false);
  const [nextUserId, setNextUserId] = useState(userId ?? "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (reason.trim().length < 2) return toast.error("请填写操作原因或工单号");
    setSaving(true);
    const request = () =>
      apiPatch(`/api/admin/${kind === "message" ? "messages" : "applications"}/${recordId}/link`, {
        userId: nextUserId.trim() || null,
        expectedUserId: userId,
        reason: reason.trim(),
      });
    try {
      try {
        await request();
      } catch (error) {
        if (!isTotpRequired(error)) throw error;
        const verified = await requireTotp(error instanceof ApiError ? error.code : undefined);
        if (!verified) return;
        await request();
      }
      toast.success(nextUserId.trim() ? "账户关联已更新" : "已解除账户关联");
      setOpen(false);
      onChanged(nextUserId.trim() || null);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "账户关联失败"));
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setNextUserId(userId ?? "");
          setOpen(true);
        }}
      >
        {userId ? "调整账户关联" : "关联官网账户"}
      </Button>
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title={kind === "message" ? "留言账户关联" : "简历账户关联"}
          size="sm"
          closeOnBackdrop={false}
        >
          <div className="space-y-4">
            {userId && <p className="text-xs text-brand-charcoal/65">当前关联用户 ID：{userId}</p>}
            <Input
              label="目标用户 ID（留空表示解除关联）"
              value={nextUserId}
              onChange={(e) => setNextUserId(e.target.value.trim())}
            />
            <p className="text-xs text-amber-700">
              服务端会锁定并核对目标账户手机号；与记录手机号不一致时拒绝关联。
            </p>
            <Textarea
              label="核验依据/工单号"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button loading={saving} onClick={() => void submit()}>
                保存关联
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {totpModal}
    </>
  );
}
