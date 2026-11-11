"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";
import { apiDelete, apiGet, apiPost, ApiError, getApiErrorMessage } from "@/lib/api-client";

interface DiaryEntry {
  id: string;
  date: string;
  skinState: string;
  tags?: string[] | null;
  note?: string | null;
}

const stateLabels: Record<string, string> = {
  great: "很好",
  good: "良好",
  normal: "一般",
  bad: "较差",
  terrible: "很差",
};
const stateOptions = Object.entries(stateLabels).map(([value, label]) => ({ value, label }));

export function UserDiaryAdminPanel({
  userId,
  canWrite,
  onChanged,
}: {
  userId: string;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const { requireTotp, totpModal } = useTotpConfirm();
  const [entries, setEntries] = useState<DiaryEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<DiaryEntry | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<DiaryEntry | null>(null);
  const [reason, setReason] = useState("");
  const run = async <T,>(operation: () => Promise<T>): Promise<T | null> => {
    try {
      return await operation();
    } catch (error) {
      if (!isTotpRequired(error)) throw error;
      const verified = await requireTotp(error instanceof ApiError ? error.code : undefined);
      return verified ? operation() : null;
    }
  };
  const load = async () => {
    setLoading(true);
    try {
      const result = await run(() =>
        apiGet<DiaryEntry[]>(`/api/admin/users/${userId}/skincare-archive`, { limit: 50 })
      );
      if (result !== null) setEntries(result);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "日记加载失败"));
    } finally {
      setLoading(false);
    }
  };
  const remove = async () => {
    if (!deleting || reason.trim().length < 2) return;
    setLoading(true);
    try {
      const result = await run(() =>
        apiDelete(
          `/api/admin/users/${userId}/skincare-archive?date=${deleting.date.slice(0, 10)}`,
          { reason: reason.trim() }
        )
      );
      if (result === null) return;
      toast.success("日记已删除");
      setDeleting(null);
      setReason("");
      await load();
      onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "日记删除失败"));
    } finally {
      setLoading(false);
    }
  };
  return (
    <section className="rounded-xl border border-brand-charcoal/10 bg-white">
      <div className="flex items-center justify-between border-b border-brand-charcoal/10 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">测肤日记代办</h3>
          <p className="mt-0.5 text-xs text-brand-charcoal/65">
            按日期补录、纠错或删除；当日首次手动打卡仍按原规则发分。
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" loading={loading} onClick={() => void load()}>
            {entries ? "刷新" : "查看日记"}
          </Button>
          {canWrite && (
            <Button size="sm" onClick={() => setEditing(null)}>
              补录日记
            </Button>
          )}
        </div>
      </div>
      {entries && (
        <div className="divide-y divide-brand-charcoal/10">
          {entries.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-brand-charcoal/65">暂无日记</p>
          )}
          {entries.map((entry) => (
            <div key={entry.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-sm">
              <span className="shrink-0 font-mono text-xs">{entry.date.slice(0, 10)}</span>
              <span className="shrink-0">
                {stateOptions.find((item) => item.value === entry.skinState)?.label ||
                  entry.skinState}
              </span>
              <div className="min-w-0 flex-1 text-xs text-brand-charcoal/65">
                {entry.tags?.join("、") || "无标签"}
                {entry.note && (
                  <p className="mt-1 whitespace-pre-wrap text-brand-charcoal">{entry.note}</p>
                )}
              </div>
              {canWrite && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(entry)}>
                    编辑
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    onClick={() => setDeleting(entry)}
                  >
                    删除
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {editing !== undefined && (
        <DiaryEditModal
          userId={userId}
          entry={editing}
          onClose={() => setEditing(undefined)}
          run={run}
          onSaved={async () => {
            await load();
            onChanged();
          }}
        />
      )}
      {deleting && (
        <Modal
          open
          onClose={() => setDeleting(null)}
          title="删除测肤日记"
          size="sm"
          closeOnBackdrop={false}
        >
          <p className="mb-4 text-sm">
            将删除 {deleting.date.slice(0, 10)} 的日记；已发放的历史积分不会自动扣回。
          </p>
          <Textarea
            label="操作原因/工单号"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              loading={loading}
              disabled={reason.trim().length < 2}
              onClick={() => void remove()}
            >
              确认删除
            </Button>
          </div>
        </Modal>
      )}
      {totpModal}
    </section>
  );
}

function DiaryEditModal({
  userId,
  entry,
  onClose,
  run,
  onSaved,
}: {
  userId: string;
  entry: DiaryEntry | null;
  onClose: () => void;
  run: <T>(operation: () => Promise<T>) => Promise<T | null>;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [date, setDate] = useState(
    entry?.date.slice(0, 10) ?? new Date().toLocaleDateString("en-CA")
  );
  const [skinState, setSkinState] = useState(entry?.skinState ?? "good");
  const [tags, setTags] = useState(entry?.tags?.join("，") ?? "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const tagList = tags
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || reason.trim().length < 2 || tagList.length > 5)
      return toast.error("请填写有效日期、操作原因，标签最多 5 个");
    setSaving(true);
    try {
      const result = await run(() =>
        apiPost(`/api/admin/users/${userId}/skincare-archive`, {
          date,
          skinState,
          tags: tagList,
          note: note.trim() || null,
          reason: reason.trim(),
        })
      );
      if (result === null) return;
      toast.success("日记已保存");
      await onSaved();
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "日记保存失败"));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={entry ? "编辑测肤日记" : "补录测肤日记"}
      size="md"
      closeOnBackdrop={false}
    >
      <div className="space-y-4">
        <Input label="日期" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Select
          label="肌肤状态"
          value={skinState}
          onChange={(e) => setSkinState(e.target.value)}
          options={stateOptions}
        />
        <Input
          label="标签（逗号分隔，最多 5 个）"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
        <Textarea
          label="备注"
          value={note}
          maxLength={1000}
          onChange={(e) => setNote(e.target.value)}
        />
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
