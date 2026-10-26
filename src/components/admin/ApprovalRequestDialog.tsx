"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { apiPost, ApiError } from "@/lib/api-client";
import {
  APPROVAL_POLICIES,
  APPROVAL_POLICY_LIST,
  type ApprovalPolicyKey,
} from "@/lib/admin-approval-policy";

export interface ApprovalInitialValues {
  userId?: string;
  amount?: number | string;
  note?: string;
  redemptionId?: string;
  applicationId?: string;
  reviewAmount?: number | string;
  reviewNote?: string;
  adminId?: string;
  status?: "ACTIVE" | "SUSPENDED" | "BANNED";
  reason?: string;
}

interface ApprovalRequestDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  initialPolicyKey?: ApprovalPolicyKey;
  initialValues?: ApprovalInitialValues;
  lockPolicy?: boolean;
}

export function ApprovalRequestDialog({
  open,
  onClose,
  onCreated,
  initialPolicyKey = "points.adjust",
  initialValues,
  lockPolicy = false,
}: ApprovalRequestDialogProps) {
  const toast = useToast();
  const [policyKey, setPolicyKey] = useState<ApprovalPolicyKey>(initialPolicyKey);
  const [userId, setUserId] = useState(initialValues?.userId ?? "");
  const [amount, setAmount] = useState(
    initialValues?.amount !== undefined ? String(initialValues.amount) : ""
  );
  const [note, setNote] = useState(initialValues?.note ?? "");
  const [redemptionId, setRedemptionId] = useState(initialValues?.redemptionId ?? "");
  const [applicationId, setApplicationId] = useState(initialValues?.applicationId ?? "");
  const [reviewAmount, setReviewAmount] = useState(
    initialValues?.reviewAmount !== undefined ? String(initialValues.reviewAmount) : ""
  );
  const [reviewNote, setReviewNote] = useState(initialValues?.reviewNote ?? "");
  const [adminId, setAdminId] = useState(initialValues?.adminId ?? "");
  const [status, setStatus] = useState<"ACTIVE" | "SUSPENDED" | "BANNED">(
    initialValues?.status ?? "SUSPENDED"
  );
  const [reason, setReason] = useState(initialValues?.reason ?? "");
  const [submitting, setSubmitting] = useState(false);

  const policy = APPROVAL_POLICIES[policyKey];

  const policyOptions = useMemo(
    () => APPROVAL_POLICY_LIST.map((item) => ({ value: item.key, label: item.label })),
    []
  );

  const buildPayload = (): Record<string, unknown> | null => {
    switch (policyKey) {
      case "points.adjust": {
        const parsed = Number(amount);
        if (!userId.trim() || !Number.isFinite(parsed) || parsed === 0) return null;
        return { userId: userId.trim(), amount: Math.trunc(parsed), note: note.trim() };
      }
      case "redemption.cancel":
        if (!redemptionId.trim()) return null;
        return { redemptionId: redemptionId.trim(), note: note.trim() || undefined };
      case "spent.review.approve": {
        const parsed = Number(reviewAmount);
        if (!applicationId.trim() || !Number.isFinite(parsed) || parsed <= 0) return null;
        return {
          applicationId: applicationId.trim(),
          reviewAmount: Math.trunc(parsed),
          reviewNote: reviewNote.trim() || undefined,
        };
      }
      case "spent.review.undo":
        if (!applicationId.trim()) return null;
        return { applicationId: applicationId.trim() };
      case "admin.delete":
        if (!adminId.trim()) return null;
        return { adminId: adminId.trim() };
      case "user.status":
        if (!userId.trim()) return null;
        return { userId: userId.trim(), status };
      case "user.delete":
        if (!userId.trim()) return null;
        return { userId: userId.trim() };
      case "totp.recovery.issue":
        if (!adminId.trim() || reason.trim().length < 5) return null;
        return { adminId: adminId.trim(), reason: reason.trim() };
      default:
        return null;
    }
  };

  const submit = async () => {
    const payload = buildPayload();
    if (!payload) {
      toast.error("请填写必填字段");
      return;
    }
    if (reason.trim().length < 5) {
      toast.error("请填写至少 5 个字符的申请原因");
      return;
    }

    setSubmitting(true);
    try {
      await apiPost("/api/admin/approvals", {
        policyKey,
        payload,
        reason: reason.trim(),
      });
      window.dispatchEvent(new Event("admin:nav-counts-refresh"));
      toast.success("审批申请已提交");
      setUserId("");
      setAmount("");
      setNote("");
      setRedemptionId("");
      setApplicationId("");
      setReviewAmount("");
      setReviewNote("");
      setAdminId("");
      setReason("");
      onCreated?.();
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "提交审批申请失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!submitting) onClose();
      }}
      title="发起 Owner 审批"
      size="md"
      closeOnBackdrop={false}
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-brand-charcoal/[0.03] px-3 py-2 text-xs text-brand-charcoal/70">
          提交后由 owner 审批。达到阈值的资金操作、账号安全操作会在这里生成申请。
        </div>
        {lockPolicy ? (
          <div className="rounded-lg bg-brand-charcoal/[0.03] px-3 py-2 text-sm font-medium text-brand-charcoal">
            {policy.label}
          </div>
        ) : (
          <Select
            label="操作类型"
            options={policyOptions}
            value={policyKey}
            onChange={(event) => setPolicyKey(event.target.value as ApprovalPolicyKey)}
          />
        )}
        <p className="text-xs text-brand-charcoal/65">{policy.summary}</p>

        {(policyKey === "points.adjust" ||
          policyKey === "user.status" ||
          policyKey === "user.delete") && (
          <Input
            label="用户 ID"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            placeholder="用户 ID"
          />
        )}

        {policyKey === "points.adjust" && (
          <>
            <Input
              label="调整分值"
              type="number"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="正数加分，负数扣分"
            />
            <Input
              label="调整备注"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="写入积分流水"
            />
          </>
        )}

        {policyKey === "redemption.cancel" && (
          <>
            <Input
              label="兑换记录 ID"
              value={redemptionId}
              onChange={(event) => setRedemptionId(event.target.value)}
              placeholder="PointRedemption ID"
            />
            <Input
              label="取消备注"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="选填"
            />
          </>
        )}

        {(policyKey === "spent.review.approve" || policyKey === "spent.review.undo") && (
          <Input
            label="消费补录 ID"
            value={applicationId}
            onChange={(event) => setApplicationId(event.target.value)}
            placeholder="SpentAdjustmentApplication ID"
          />
        )}

        {policyKey === "spent.review.approve" && (
          <>
            <Input
              label="核实金额（元）"
              type="number"
              value={reviewAmount}
              onChange={(event) => setReviewAmount(event.target.value)}
              placeholder="整数，元"
            />
            <Input
              label="审核备注"
              value={reviewNote}
              onChange={(event) => setReviewNote(event.target.value)}
              placeholder="选填"
            />
          </>
        )}

        {(policyKey === "admin.delete" || policyKey === "totp.recovery.issue") && (
          <Input
            label="管理员 ID"
            value={adminId}
            onChange={(event) => setAdminId(event.target.value)}
            placeholder="Admin ID"
          />
        )}

        {policyKey === "user.status" && (
          <Select
            label="目标状态"
            options={[
              { value: "ACTIVE", label: "恢复" },
              { value: "SUSPENDED", label: "冻结" },
              { value: "BANNED", label: "封禁" },
            ]}
            value={status}
            onChange={(event) => setStatus(event.target.value as "ACTIVE" | "SUSPENDED" | "BANNED")}
          />
        )}

        <Textarea
          label="申请原因"
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={
            policyKey === "totp.recovery.issue"
              ? "填写至少 5 个字符的原因（会同步写入恢复码记录）"
              : "填写至少 5 个字符的申请原因"
          }
        />

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button size="sm" loading={submitting} onClick={() => void submit()}>
            提交审批
          </Button>
        </div>
      </div>
    </Modal>
  );
}
