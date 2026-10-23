"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  ADVISOR_EXPORT_GROUPS,
  DEFAULT_USER_EXPORT_GROUPS,
  USER_EXPORT_GROUP_LABELS,
  type UserExportGroup,
} from "@/lib/user-export";

interface UserExportDialogProps {
  open: boolean;
  total: number;
  canReadSensitive: boolean;
  canReadAdvisor: boolean;
  loading: boolean;
  onClose: () => void;
  onConfirm: (groups: UserExportGroup[]) => void;
}

const BUSINESS_GROUPS: UserExportGroup[] = [
  "profile",
  "identities",
  "points",
  "redemptions",
  "addresses",
  "spent",
  "growth",
  "logins",
  "deletions",
];

const ADVISOR_GROUPS: UserExportGroup[] = [
  "advisorAccount",
  "advisorSessions",
  "advisorDiary",
  "advisorFullAnalysis",
];

function defaultGroups(canReadAdvisor: boolean): UserExportGroup[] {
  return DEFAULT_USER_EXPORT_GROUPS.filter(
    (group) => canReadAdvisor || !ADVISOR_EXPORT_GROUPS.includes(group)
  );
}

function GroupCheckbox({
  group,
  checked,
  disabled,
  onChange,
}: {
  group: UserExportGroup;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm text-brand-charcoal transition-colors hover:bg-brand-charcoal/[0.04]">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-brand-charcoal/20 text-brand-primary focus:ring-brand-primary disabled:opacity-60"
      />
      <span>
        {USER_EXPORT_GROUP_LABELS[group]}
        {group === "advisorFullAnalysis" && (
          <span className="ml-1 text-xs text-brand-charcoal/55">默认关闭，体积较大</span>
        )}
      </span>
    </label>
  );
}

export function UserExportDialog({
  open,
  total,
  canReadSensitive,
  canReadAdvisor,
  loading,
  onClose,
  onConfirm,
}: UserExportDialogProps) {
  const defaults = useMemo(() => defaultGroups(canReadAdvisor), [canReadAdvisor]);
  const [selected, setSelected] = useState<Set<UserExportGroup>>(new Set(defaults));
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) setSelected(new Set(defaults));
  }

  const advisorSelected = ADVISOR_GROUPS.some((group) => selected.has(group));

  const toggle = (group: UserExportGroup, checked: boolean) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (checked) {
        next.add(group);
        if (group === "advisorFullAnalysis") next.add("advisorSessions");
      } else {
        next.delete(group);
        if (group === "advisorSessions") next.delete("advisorFullAnalysis");
      }
      next.add("profile");
      return next;
    });
  };

  const selectAll = () => {
    setSelected(
      new Set(
        [...BUSINESS_GROUPS, ...(canReadAdvisor ? ADVISOR_GROUPS : [])].filter(
          (group) => group !== "advisorFullAnalysis"
        )
      )
    );
  };

  return (
    <Modal
      open={open}
      onClose={loading ? () => undefined : onClose}
      closeOnBackdrop={!loading}
      closeOnEscape={!loading}
      showCloseButton={!loading}
      title="导出用户数据"
      description={`当前筛选匹配 ${total.toLocaleString()} 位用户`}
      size="lg"
      mobileFullScreen
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={selectAll} disabled={loading}>
              全选（不含完整分析）
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set(defaults))}
              disabled={loading}
            >
              恢复默认
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
              取消
            </Button>
            <Button
              size="sm"
              loading={loading}
              leftIcon={<Download className="h-4 w-4" />}
              onClick={() => onConfirm([...selected])}
            >
              开始导出 ZIP
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <div
          className={
            canReadSensitive
              ? "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
              : "rounded-lg bg-brand-charcoal/[0.03] px-3 py-2 text-xs text-brand-charcoal/70"
          }
        >
          {canReadSensitive
            ? "当前账号可导出完整手机号、微信标识、收货信息、订单号等敏感字段，导出会写入审计日志。"
            : "敏感字段将自动脱敏；如需导出明文，请申请 users:sensitive:read 权限。"}
        </div>

        <section>
          <h3 className="mb-1 text-sm font-medium text-brand-charcoal">账号与身份</h3>
          <div className="grid gap-0.5 sm:grid-cols-2">
            <GroupCheckbox group="profile" checked disabled onChange={() => undefined} />
            {(["identities", "logins", "deletions"] as UserExportGroup[]).map((group) => (
              <GroupCheckbox
                key={group}
                group={group}
                checked={selected.has(group)}
                onChange={(checked) => toggle(group, checked)}
              />
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-1 text-sm font-medium text-brand-charcoal">资产与交易</h3>
          <div className="grid gap-0.5 sm:grid-cols-2">
            {(["points", "redemptions", "spent", "growth"] as UserExportGroup[]).map((group) => (
              <GroupCheckbox
                key={group}
                group={group}
                checked={selected.has(group)}
                onChange={(checked) => toggle(group, checked)}
              />
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-1 text-sm font-medium text-brand-charcoal">联系方式</h3>
          <div className="grid gap-0.5 sm:grid-cols-2">
            <GroupCheckbox
              group="addresses"
              checked={selected.has("addresses")}
              onChange={(checked) => toggle("addresses", checked)}
            />
          </div>
        </section>

        {canReadAdvisor && (
          <section>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-medium text-brand-charcoal">测肤子站</h3>
              <span className="text-xs text-brand-charcoal/55">逐用户拉取；人数较多时耗时较长</span>
            </div>
            <div className="grid gap-0.5 sm:grid-cols-2">
              {ADVISOR_GROUPS.map((group) => (
                <GroupCheckbox
                  key={group}
                  group={group}
                  checked={selected.has(group)}
                  onChange={(checked) => toggle(group, checked)}
                />
              ))}
            </div>
            {advisorSelected && total > 200 && (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                当前匹配用户较多，测肤子站档案将逐用户调用，导出可能持续较长时间。可取消测肤子站分组以加快导出。
              </p>
            )}
          </section>
        )}

        <p className="text-xs text-brand-charcoal/55">
          ZIP 内每个数据范围对应独立 CSV（兼容 Excel）；测肤完整分析勾选后另存
          advisor-session-analysis.jsonl。
        </p>
      </div>
    </Modal>
  );
}
