"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Modal } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { apiDelete, apiPatch, apiPost, getApiErrorMessage } from "@/lib/api-client";
import { createClientRequestId } from "@/lib/request-id";

export type SupportStepUpRunner = <T>(run: () => Promise<T>) => Promise<T | null>;

interface UserProfile {
  id: string;
  nickname: string | null;
  avatar: string | null;
  birthday: string | null;
  gender: string | null;
}

export function ProfileCorrectionControl({
  user,
  runWithStepUp,
  onChanged,
}: {
  user: UserProfile;
  runWithStepUp: SupportStepUpRunner;
  onChanged: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        修改资料
      </Button>
      {open && (
        <ProfileCorrectionModal
          user={user}
          onClose={() => setOpen(false)}
          runWithStepUp={runWithStepUp}
          onChanged={onChanged}
        />
      )}
    </>
  );
}

function ProfileCorrectionModal({
  user,
  onClose,
  runWithStepUp,
  onChanged,
}: {
  user: UserProfile;
  onClose: () => void;
  runWithStepUp: SupportStepUpRunner;
  onChanged: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [nickname, setNickname] = useState(user.nickname ?? "");
  const [avatar, setAvatar] = useState(user.avatar ?? "");
  const [birthday, setBirthday] = useState(user.birthday?.slice(0, 10) ?? "");
  const [gender, setGender] = useState(user.gender ?? "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (reason.trim().length < 2) return toast.error("请填写操作原因或工单号");
    setSaving(true);
    try {
      const result = await runWithStepUp(() =>
        apiPatch(`/api/admin/users/${user.id}/profile`, {
          nickname: nickname.trim(),
          avatar: avatar.trim(),
          birthday: birthday || null,
          gender: gender || null,
          reason: reason.trim(),
        })
      );
      if (result === null) return;
      toast.success("用户资料已更新");
      await onChanged();
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "资料修改失败"));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="修改用户资料" size="lg" closeOnBackdrop={false}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="昵称"
          value={nickname}
          maxLength={20}
          onChange={(e) => setNickname(e.target.value)}
        />
        <Select
          label="性别"
          value={gender}
          onChange={(e) => setGender(e.target.value)}
          options={[
            { value: "", label: "未设置/保密" },
            { value: "male", label: "男" },
            { value: "female", label: "女" },
          ]}
        />
        <Input
          label="生日"
          type="date"
          value={birthday}
          onChange={(e) => setBirthday(e.target.value)}
        />
        <Input
          label="头像 URL"
          value={avatar}
          onChange={(e) => setAvatar(e.target.value)}
          placeholder="仅允许官网或自有 OSS 地址"
        />
        <div className="sm:col-span-2">
          <Textarea
            label="操作原因/工单号"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          取消
        </Button>
        <Button loading={saving} onClick={() => void save()}>
          保存
        </Button>
      </div>
    </Modal>
  );
}

export interface AdminAddressItem {
  id: string;
  recipient: string;
  phone: string;
  region: string;
  detail: string;
  isDefault: boolean;
}

export function AddressCorrectionPanel({
  userId,
  addresses,
  canReadSensitive,
  runWithStepUp,
  onChanged,
}: {
  userId: string;
  addresses: AdminAddressItem[];
  canReadSensitive: boolean;
  runWithStepUp: SupportStepUpRunner;
  onChanged: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState<AdminAddressItem | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<AdminAddressItem | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteSaving, setDeleteSaving] = useState(false);
  const remove = async () => {
    if (!deleting || deleteReason.trim().length < 2) return;
    setDeleteSaving(true);
    try {
      const result = await runWithStepUp(() =>
        apiDelete(`/api/admin/users/${userId}/addresses/${deleting.id}`, {
          reason: deleteReason.trim(),
        })
      );
      if (result === null) return;
      toast.success("地址已删除");
      setDeleting(null);
      setDeleteReason("");
      await onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "地址删除失败"));
    } finally {
      setDeleteSaving(false);
    }
  };
  return (
    <>
      <div className="flex justify-end border-b border-brand-charcoal/10 px-4 py-3">
        <Button size="sm" disabled={!canReadSensitive} onClick={() => setEditing(null)}>
          新增地址
        </Button>
      </div>
      {!canReadSensitive && (
        <p className="px-4 py-3 text-xs text-amber-700">
          地址纠错需要完整手机号与地址查看权限，请先完成敏感信息访问验证。
        </p>
      )}
      <div className="divide-y divide-brand-charcoal/10">
        {addresses.map((address) => (
          <div key={address.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-brand-charcoal">{address.recipient}</p>
              <span className="text-xs text-brand-charcoal/65">{address.phone}</span>
              {address.isDefault && <span className="text-xs text-brand-primary">默认地址</span>}
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!canReadSensitive}
                  onClick={() => setEditing(address)}
                >
                  编辑
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600"
                  disabled={!canReadSensitive}
                  onClick={() => setDeleting(address)}
                >
                  删除
                </Button>
              </div>
            </div>
            <p className="mt-1 text-xs text-brand-charcoal/70">
              {address.region} {address.detail}
            </p>
          </div>
        ))}
      </div>
      {editing !== undefined && (
        <AddressFormModal
          userId={userId}
          address={editing}
          onClose={() => setEditing(undefined)}
          runWithStepUp={runWithStepUp}
          onChanged={onChanged}
        />
      )}
      {deleting && (
        <Modal
          open
          onClose={() => setDeleting(null)}
          title="删除收货地址"
          size="sm"
          closeOnBackdrop={false}
        >
          <p className="mb-4 text-sm text-brand-charcoal/70">
            删除后不可恢复；若删除默认地址，系统会自动顺延下一条。
          </p>
          <Textarea
            label="操作原因/工单号"
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              loading={deleteSaving}
              disabled={deleteReason.trim().length < 2}
              onClick={() => void remove()}
            >
              确认删除
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

function AddressFormModal({
  userId,
  address,
  onClose,
  runWithStepUp,
  onChanged,
}: {
  userId: string;
  address: AdminAddressItem | null;
  onClose: () => void;
  runWithStepUp: SupportStepUpRunner;
  onChanged: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [recipient, setRecipient] = useState(address?.recipient ?? "");
  const [phone, setPhone] = useState(address?.phone ?? "");
  const [region, setRegion] = useState(address?.region ?? "");
  const [detail, setDetail] = useState(address?.detail ?? "");
  const [isDefault, setIsDefault] = useState(address?.isDefault ?? false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (
      !recipient.trim() ||
      !/^1[3-9]\d{9}$/.test(phone) ||
      !region.trim() ||
      !detail.trim() ||
      reason.trim().length < 2
    ) {
      return toast.error("请完整填写地址、有效手机号和操作原因");
    }
    setSaving(true);
    try {
      const body = {
        recipient: recipient.trim(),
        phone,
        region: region.trim(),
        detail: detail.trim(),
        isDefault,
        reason: reason.trim(),
      };
      const result = await runWithStepUp(() =>
        address
          ? apiPatch(`/api/admin/users/${userId}/addresses/${address.id}`, body)
          : apiPost(`/api/admin/users/${userId}/addresses`, body)
      );
      if (result === null) return;
      toast.success(address ? "地址已更新" : "地址已新增");
      await onChanged();
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "地址保存失败"));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={address ? "编辑收货地址" : "新增收货地址"}
      size="lg"
      closeOnBackdrop={false}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="收货人" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
        <Input label="手机号" value={phone} onChange={(e) => setPhone(e.target.value.trim())} />
        <div className="sm:col-span-2">
          <Input label="省市区" value={region} onChange={(e) => setRegion(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Textarea label="详细地址" value={detail} onChange={(e) => setDetail(e.target.value)} />
        </div>
        <Switch checked={isDefault} onChange={setIsDefault} label="设为默认地址" />
        <div className="sm:col-span-2">
          <Textarea
            label="操作原因/工单号"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          取消
        </Button>
        <Button loading={saving} onClick={() => void save()}>
          保存
        </Button>
      </div>
    </Modal>
  );
}

export interface AdminRedemptionItem {
  id: string;
  status: string;
  recipient: string | null;
  phone: string | null;
  address: string | null;
}

export function RedemptionCorrectionActions({
  redemption,
  canReadSensitive,
  canFulfill,
  canAfterSales,
  runWithStepUp,
  onChanged,
}: {
  redemption: AdminRedemptionItem;
  canReadSensitive: boolean;
  canFulfill: boolean;
  canAfterSales: boolean;
  runWithStepUp: SupportStepUpRunner;
  onChanged: () => void | Promise<void>;
}) {
  const [mode, setMode] = useState<"recipient" | "after-sales" | "return" | null>(null);
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {canFulfill && redemption.status === "PENDING" && (
        <Button
          size="sm"
          variant="outline"
          disabled={!canReadSensitive}
          onClick={() => setMode("recipient")}
        >
          修改收货信息
        </Button>
      )}
      {canAfterSales &&
        ["FULFILLED", "COMPLETED", "AFTER_SALES_REJECTED"].includes(redemption.status) && (
          <Button size="sm" variant="outline" onClick={() => setMode("after-sales")}>
            代客申请售后
          </Button>
        )}
      {canAfterSales && redemption.status === "AFTER_SALES_APPROVED" && (
        <Button size="sm" variant="outline" onClick={() => setMode("return")}>
          代填退运单
        </Button>
      )}
      {mode === "recipient" && (
        <RecipientModal
          redemption={redemption}
          onClose={() => setMode(null)}
          runWithStepUp={runWithStepUp}
          onChanged={onChanged}
        />
      )}
      {mode === "after-sales" && (
        <AfterSalesRequestModal
          redemption={redemption}
          onClose={() => setMode(null)}
          runWithStepUp={runWithStepUp}
          onChanged={onChanged}
        />
      )}
      {mode === "return" && (
        <ReturnShipmentModal
          redemption={redemption}
          onClose={() => setMode(null)}
          runWithStepUp={runWithStepUp}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}

function RecipientModal({
  redemption,
  onClose,
  runWithStepUp,
  onChanged,
}: {
  redemption: AdminRedemptionItem;
  onClose: () => void;
  runWithStepUp: SupportStepUpRunner;
  onChanged: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [recipient, setRecipient] = useState(redemption.recipient ?? "");
  const [phone, setPhone] = useState(redemption.phone ?? "");
  const [region, setRegion] = useState("");
  const [detail, setDetail] = useState(redemption.address ?? "");
  const [reason, setReason] = useState("");
  const [requestId] = useState(createClientRequestId);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (
      !recipient.trim() ||
      !/^1[3-9]\d{9}$/.test(phone) ||
      !region.trim() ||
      !detail.trim() ||
      reason.trim().length < 2
    )
      return toast.error("请完整填写收货信息、省市区和操作原因");
    setSaving(true);
    try {
      const result = await runWithStepUp(() =>
        apiPatch(`/api/admin/point-redemptions/${redemption.id}/recipient`, {
          recipient: recipient.trim(),
          phone,
          region: region.trim(),
          detail: detail.trim(),
          reason: reason.trim(),
          requestId,
        })
      );
      if (result === null) return;
      toast.success("兑换收货信息已更新");
      await onChanged();
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "修改失败"));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="修改兑换收货快照" size="lg" closeOnBackdrop={false}>
      <p className="mb-4 text-xs text-brand-charcoal/65">
        仅待履约订单可修改；不会改动地址簿，也不会影响已发货运单。
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="收货人" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
        <Input label="手机号" value={phone} onChange={(e) => setPhone(e.target.value.trim())} />
        <Input
          label="省市区"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          placeholder="请重新填写完整省市区"
        />
        <Input label="详细地址" value={detail} onChange={(e) => setDetail(e.target.value)} />
        <div className="sm:col-span-2">
          <Textarea
            label="操作原因/工单号"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          取消
        </Button>
        <Button loading={saving} onClick={() => void save()}>
          保存
        </Button>
      </div>
    </Modal>
  );
}

function AfterSalesRequestModal({
  redemption,
  onClose,
  runWithStepUp,
  onChanged,
}: {
  redemption: AdminRedemptionItem;
  onClose: () => void;
  runWithStepUp: SupportStepUpRunner;
  onChanged: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [ticketReason, setTicketReason] = useState("");
  const [images, setImages] = useState("");
  const [requestId] = useState(createClientRequestId);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const imageList = images
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (reason.trim().length < 2 || ticketReason.trim().length < 2 || imageList.length > 3)
      return toast.error("请填写售后原因、工单号，凭证最多 3 张");
    setSaving(true);
    try {
      const result = await runWithStepUp(() =>
        apiPost(`/api/admin/point-redemptions/${redemption.id}/after-sales/request`, {
          reason: reason.trim(),
          ticketReason: ticketReason.trim(),
          images: imageList,
          requestId,
        })
      );
      if (result === null) return;
      toast.success("售后申请已提交，等待审核");
      await onChanged();
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "售后申请失败"));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="代客申请售后" size="md" closeOnBackdrop={false}>
      <div className="space-y-4">
        <Textarea label="用户售后原因" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Textarea
          label="凭证地址（每行一个，选填）"
          value={images}
          onChange={(e) => setImages(e.target.value)}
          hint="仅接受该用户已上传的私有凭证引用"
        />
        <Input
          label="客服工单号/操作原因"
          value={ticketReason}
          onChange={(e) => setTicketReason(e.target.value)}
        />
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          取消
        </Button>
        <Button loading={saving} onClick={() => void save()}>
          提交申请
        </Button>
      </div>
    </Modal>
  );
}

function ReturnShipmentModal({
  redemption,
  onClose,
  runWithStepUp,
  onChanged,
}: {
  redemption: AdminRedemptionItem;
  onClose: () => void;
  runWithStepUp: SupportStepUpRunner;
  onChanged: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [waybillNo, setWaybillNo] = useState("");
  const [carrier, setCarrier] = useState("SF");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!/^[A-Za-z0-9-]{8,32}$/.test(waybillNo) || reason.trim().length < 2)
      return toast.error("请填写有效运单号和操作原因");
    setSaving(true);
    try {
      const result = await runWithStepUp(() =>
        apiPost(`/api/admin/point-redemptions/${redemption.id}/after-sales/return-shipment`, {
          waybillNo,
          carrier: carrier.trim() || "SF",
          reason: reason.trim(),
        })
      );
      if (result === null) return;
      toast.success("退回运单已填写");
      await onChanged();
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "运单填写失败"));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="代填售后退运单" size="sm" closeOnBackdrop={false}>
      <div className="space-y-4">
        <Input
          label="退回运单号"
          value={waybillNo}
          onChange={(e) => setWaybillNo(e.target.value.trim())}
        />
        <Input label="承运商" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
        <Textarea
          label="操作原因/工单号"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          取消
        </Button>
        <Button loading={saving} onClick={() => void save()}>
          保存
        </Button>
      </div>
    </Modal>
  );
}
