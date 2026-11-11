"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { apiDelete, apiGet, apiPost, getApiErrorMessage } from "@/lib/api-client";
import { createClientRequestId } from "@/lib/request-id";
import type { SupportStepUpRunner } from "./UserCorrectionControls";

interface AccountUser {
  id: string;
  phone: string | null;
  status: string;
}

export function UserAccountSecurityTools({
  user,
  isOwner,
  canPhoneWrite,
  canMerge,
  canSecurityWrite,
  runWithStepUp,
  onChanged,
}: {
  user: AccountUser;
  isOwner: boolean;
  canPhoneWrite: boolean;
  canMerge: boolean;
  canSecurityWrite: boolean;
  runWithStepUp: SupportStepUpRunner;
  onChanged: () => void | Promise<void>;
}) {
  const [dialog, setDialog] = useState<"phone" | "identity" | "merge" | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {canPhoneWrite && (
          <Button size="sm" variant="outline" onClick={() => setDialog("phone")}>
            换绑手机号
          </Button>
        )}
        {canSecurityWrite && (
          <Button size="sm" variant="outline" onClick={() => setDialog("identity")}>
            绑定外部身份
          </Button>
        )}
        {canMerge && (
          <Button size="sm" variant="danger" onClick={() => setDialog("merge")}>
            合并重复账户
          </Button>
        )}
      </div>
      <p className="text-xs text-brand-charcoal/65">
        手机号换绑和账户合并会先预检；非 owner 提交后必须由另一位 owner
        审批。合并会停用源账户，目标账户密码不变。
      </p>
      {canSecurityWrite && <DeviceAdminList userId={user.id} runWithStepUp={runWithStepUp} />}
      {dialog === "phone" && (
        <PhoneChangeModal
          user={user}
          isOwner={isOwner}
          onClose={() => setDialog(null)}
          runWithStepUp={runWithStepUp}
          onChanged={onChanged}
        />
      )}
      {dialog === "identity" && (
        <IdentityBindModal
          userId={user.id}
          onClose={() => setDialog(null)}
          runWithStepUp={runWithStepUp}
          onChanged={onChanged}
        />
      )}
      {dialog === "merge" && (
        <AccountMergeModal
          target={user}
          isOwner={isOwner}
          onClose={() => setDialog(null)}
          runWithStepUp={runWithStepUp}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}

interface PhonePreflight {
  currentPhone: string;
  currentPhoneHash: string;
  newPhone: string;
  available: boolean;
  occupant: { id: string; status: string; nickname: string | null } | null;
}

function PhoneChangeModal({
  user,
  isOwner,
  onClose,
  runWithStepUp,
  onChanged,
}: {
  user: AccountUser;
  isOwner: boolean;
  onClose: () => void;
  runWithStepUp: SupportStepUpRunner;
  onChanged: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [newPhone, setNewPhone] = useState("");
  const [reason, setReason] = useState("");
  const [preflight, setPreflight] = useState<PhonePreflight | null>(null);
  const [loading, setLoading] = useState(false);
  const check = async () => {
    if (!/^1[3-9]\d{9}$/.test(newPhone)) return toast.error("请输入正确的新手机号");
    setLoading(true);
    try {
      const result = await runWithStepUp(() =>
        apiGet<PhonePreflight>(`/api/admin/users/${user.id}/phone`, { newPhone })
      );
      if (result !== null) setPreflight(result);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "预检失败"));
    } finally {
      setLoading(false);
    }
  };
  const submit = async () => {
    if (!preflight?.available || reason.trim().length < 2) return;
    setLoading(true);
    try {
      const payload = {
        userId: user.id,
        newPhone: preflight.newPhone,
        expectedPhoneHash: preflight.currentPhoneHash,
      };
      const result = await runWithStepUp(() =>
        isOwner
          ? apiPost(`/api/admin/users/${user.id}/phone`, { ...payload, reason: reason.trim() })
          : apiPost("/api/admin/approvals", {
              policyKey: "user.phone.change",
              payload,
              reason: reason.trim(),
            })
      );
      if (result === null) return;
      window.dispatchEvent(new Event("admin:nav-counts-refresh"));
      toast.success(isOwner ? "手机号已换绑，全部会话已撤销" : "换绑审批已提交");
      await onChanged();
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "换绑失败"));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="换绑用户手机号" size="md" closeOnBackdrop={false}>
      <div className="space-y-4">
        <p className="text-sm text-brand-charcoal/70">
          当前号码：{user.phone || "未绑定"}。执行后旧会话全部失效，新旧手机号都会收到安全通知。
        </p>
        <Input
          label="新手机号"
          value={newPhone}
          onChange={(e) => {
            setNewPhone(e.target.value.trim());
            setPreflight(null);
          }}
        />
        <Button size="sm" variant="outline" loading={loading} onClick={() => void check()}>
          预检号码占用
        </Button>
        {preflight && (
          <div
            className={`rounded-lg p-3 text-sm ${preflight.available ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
          >
            {preflight.available
              ? "号码可用，已锁定当前账户快照。"
              : `号码已被账户 ${preflight.occupant?.id} 使用，请改用账户合并流程。`}
          </div>
        )}
        <Textarea
          label="核验材料/工单号"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            loading={loading}
            disabled={!preflight?.available || reason.trim().length < 2}
            onClick={() => void submit()}
          >
            {isOwner ? "确认换绑" : "提交 owner 审批"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function IdentityBindModal({
  userId,
  onClose,
  runWithStepUp,
  onChanged,
}: {
  userId: string;
  onClose: () => void;
  runWithStepUp: SupportStepUpRunner;
  onChanged: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [provider, setProvider] = useState("wechat_miniprogram");
  const [subjectId, setSubjectId] = useState("");
  const [unionId, setUnionId] = useState("");
  const [mpClientId, setMpClientId] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!subjectId.trim() || reason.trim().length < 2)
      return toast.error("请填写平台身份标识和操作原因");
    setSaving(true);
    try {
      const result = await runWithStepUp(() =>
        apiPost(`/api/admin/users/${userId}/identities`, {
          provider,
          subjectId: subjectId.trim(),
          unionId: unionId.trim() || null,
          mpClientId: mpClientId.trim() || undefined,
          reason: reason.trim(),
        })
      );
      if (result === null) return;
      toast.success("外部身份已绑定");
      await onChanged();
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "绑定失败"));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="绑定外部身份" size="md" closeOnBackdrop={false}>
      <div className="space-y-4">
        <p className="text-xs text-amber-700">
          仅用于核验过身份归属的客服纠错。若标识已经属于另一账户，系统会拒绝，不能覆盖。
        </p>
        <Select
          label="平台"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          options={[
            { value: "wechat_miniprogram", label: "微信小程序" },
            { value: "wechat_open", label: "微信开放平台" },
            { value: "wechat_mp", label: "微信服务号" },
            { value: "douyin", label: "抖音" },
          ]}
        />
        <Input
          label="OpenID / 平台主体 ID"
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value.trim())}
        />
        {provider.startsWith("wechat") && (
          <>
            <Input
              label="UnionID（选填）"
              value={unionId}
              onChange={(e) => setUnionId(e.target.value.trim())}
            />
            <Input
              label="来源小程序 client_id（选填）"
              value={mpClientId}
              onChange={(e) => setMpClientId(e.target.value.trim())}
            />
          </>
        )}
        <Textarea
          label="核验材料/工单号"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button loading={saving} onClick={() => void save()}>
            确认绑定
          </Button>
        </div>
      </div>
    </Modal>
  );
}

interface MergePreflight {
  canMerge: boolean;
  conflicts: { code: string; message: string }[];
  source: { id: string; phone: string; nickname: string | null; updatedAt: string };
  target: { id: string; updatedAt: string };
  preview: {
    pointsAfter: number;
    spentAfter: number;
    levelAfter: string;
    addressesAfter: number;
  };
}

function AccountMergeModal({
  target,
  isOwner,
  onClose,
  runWithStepUp,
  onChanged,
}: {
  target: AccountUser;
  isOwner: boolean;
  onClose: () => void;
  runWithStepUp: SupportStepUpRunner;
  onChanged: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [sourceUserId, setSourceUserId] = useState("");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [preflight, setPreflight] = useState<MergePreflight | null>(null);
  const [requestId] = useState(createClientRequestId);
  const [loading, setLoading] = useState(false);
  const check = async () => {
    if (!sourceUserId.trim()) return toast.error("请输入源账户 ID");
    setLoading(true);
    try {
      const result = await runWithStepUp(() =>
        apiGet<MergePreflight>(`/api/admin/users/${target.id}/merge`, {
          sourceUserId: sourceUserId.trim(),
        })
      );
      if (result !== null) setPreflight(result);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "合并预检失败"));
      setPreflight(null);
    } finally {
      setLoading(false);
    }
  };
  const submit = async () => {
    if (!preflight?.canMerge || confirmation !== "MERGE" || reason.trim().length < 2) return;
    setLoading(true);
    try {
      const payload = {
        sourceUserId: preflight.source.id,
        targetUserId: target.id,
        expectedSourceUpdatedAt: preflight.source.updatedAt,
        expectedTargetUpdatedAt: preflight.target.updatedAt,
        confirmation: "MERGE",
      };
      const result = await runWithStepUp(() =>
        isOwner
          ? apiPost(`/api/admin/users/${target.id}/merge`, {
              ...payload,
              requestId,
              reason: reason.trim(),
            })
          : apiPost("/api/admin/approvals", {
              policyKey: "user.accounts.merge",
              payload,
              reason: reason.trim(),
            })
      );
      if (result === null) return;
      window.dispatchEvent(new Event("admin:nav-counts-refresh"));
      toast.success(isOwner ? "账户合并完成，源账户已停用" : "合并审批已提交");
      await onChanged();
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "账户合并失败"));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="合并重复账户" size="lg" closeOnBackdrop={false}>
      <div className="space-y-4">
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          当前账户是保留的目标账户；源账户将被停用。积分与消费额相加，目标密码不变，源会话及 OAuth
          授权全部撤销。
        </div>
        <Input
          label="源账户 ID（被合并并停用）"
          value={sourceUserId}
          onChange={(e) => {
            setSourceUserId(e.target.value.trim());
            setPreflight(null);
          }}
        />
        <Button size="sm" variant="outline" loading={loading} onClick={() => void check()}>
          执行全站预检
        </Button>
        {preflight && (
          <div className="space-y-2 rounded-lg border border-brand-charcoal/10 p-3 text-sm">
            <p>源账户：{preflight.source.nickname || preflight.source.phone}</p>
            <p>
              合并后：{preflight.preview.pointsAfter} 积分，累计消费 ¥{preflight.preview.spentAfter}
              ，{preflight.preview.levelAfter}，地址 {preflight.preview.addressesAfter} 条
            </p>
            {preflight.conflicts.length > 0 && (
              <ul className="list-disc pl-5 text-red-600">
                {preflight.conflicts.map((conflict) => (
                  <li key={conflict.code}>{conflict.message}</li>
                ))}
              </ul>
            )}
            {preflight.canMerge && (
              <p className="text-emerald-700">主站与全部已配置子站均通过预检。</p>
            )}
          </div>
        )}
        <Textarea
          label="合并依据/工单号"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Input
          label="输入 MERGE 确认"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="danger"
            loading={loading}
            disabled={!preflight?.canMerge || confirmation !== "MERGE" || reason.trim().length < 2}
            onClick={() => void submit()}
          >
            {isOwner ? "确认合并" : "提交 owner 审批"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

interface DeviceItem {
  id: string;
  deviceName: string;
  ipAddress: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
}

function DeviceAdminList({
  userId,
  runWithStepUp,
}: {
  userId: string;
  runWithStepUp: SupportStepUpRunner;
}) {
  const toast = useToast();
  const [devices, setDevices] = useState<DeviceItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState<DeviceItem | null>(null);
  const [reason, setReason] = useState("");
  const load = async () => {
    setLoading(true);
    try {
      const result = await runWithStepUp(() =>
        apiGet<{ devices: DeviceItem[] }>(`/api/admin/users/${userId}/devices`)
      );
      if (result !== null) setDevices(result.devices);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "设备查询失败"));
    } finally {
      setLoading(false);
    }
  };
  const revoke = async () => {
    if (!target || reason.trim().length < 2) return;
    setLoading(true);
    try {
      const result = await runWithStepUp(() =>
        apiDelete(`/api/admin/users/${userId}/devices/${target.id}`, { reason: reason.trim() })
      );
      if (result === null) return;
      toast.success("设备会话已撤销");
      setTarget(null);
      setReason("");
      setDevices((current) => current?.filter((device) => device.id !== target.id) ?? null);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "撤销失败"));
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="rounded-lg border border-brand-charcoal/10">
      <div className="flex items-center justify-between px-3 py-2">
        <p className="text-sm font-medium">活跃设备</p>
        <Button size="sm" variant="ghost" loading={loading} onClick={() => void load()}>
          {devices ? "刷新设备" : "查看设备"}
        </Button>
      </div>
      {devices && (
        <div className="divide-y divide-brand-charcoal/10 border-t border-brand-charcoal/10">
          {devices.length === 0 && (
            <p className="px-3 py-4 text-xs text-brand-charcoal/65">暂无活跃设备</p>
          )}
          {devices.map((device) => (
            <div key={device.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
              <span className="font-medium text-brand-charcoal">{device.deviceName}</span>
              <span className="text-brand-charcoal/65">{device.ipAddress}</span>
              <span className="text-brand-charcoal/65">
                最近活跃 {new Date(device.lastActiveAt).toLocaleString("zh-CN")}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto text-red-600"
                onClick={() => setTarget(device)}
              >
                强制下线
              </Button>
            </div>
          ))}
        </div>
      )}
      {target && (
        <Modal
          open
          onClose={() => setTarget(null)}
          title="撤销用户设备会话"
          size="sm"
          closeOnBackdrop={false}
        >
          <p className="mb-4 text-sm">将撤销「{target.deviceName}」的刷新令牌及关联 OAuth 会话。</p>
          <Textarea
            label="操作原因/工单号"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTarget(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              loading={loading}
              disabled={reason.trim().length < 2}
              onClick={() => void revoke()}
            >
              确认下线
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
