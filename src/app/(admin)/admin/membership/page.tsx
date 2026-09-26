"use client";

/**
 * 会员权益配置页面（仅超级管理员）
 * - 四档会员（普通/银卡/金卡/钻石）的展示文案与权益项
 * - 实际等级判定以代码硬编码阈值为准（0/1000/5000/10000），此处 minSpent 仅影响前台展示
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crown, Plus, Trash2, Info } from "lucide-react";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPut } from "@/lib/api-client";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { cn } from "@/lib/utils";

type LevelKey = "REGULAR" | "SILVER" | "GOLD" | "DIAMOND";

interface BenefitItem {
  icon: string;
  title: string;
  desc: string;
}

interface LevelBenefit {
  level: LevelKey;
  name: string;
  nameEn: string;
  icon: string;
  minSpent: number;
  maxSpent: number | null;
  benefits: BenefitItem[];
  colorClass: string;
  source: "db" | "default";
}

const LEVEL_TABS: { key: LevelKey; label: string }[] = [
  { key: "REGULAR", label: "普通会员" },
  { key: "SILVER", label: "银卡会员" },
  { key: "GOLD", label: "金卡会员" },
  { key: "DIAMOND", label: "钻石卡会员" },
];

/** 代码硬编码判级阈值（唯一权威），仅供页面提示 */
const GRADING_THRESHOLDS: Record<LevelKey, number> = {
  REGULAR: 0,
  SILVER: 1000,
  GOLD: 5000,
  DIAMOND: 10000,
};

export default function AdminMembershipPage() {
  return (
    <RequirePermission permission="membership:read">
      <AdminMembershipContent />
    </RequirePermission>
  );
}

function AdminMembershipContent() {
  const { success, error: showError } = useToast();
  const { can: canAdmin } = useAdminPermissions();
  const canWrite = canAdmin("membership:write");
  const [levels, setLevels] = useState<LevelBenefit[]>([]);
  const [active, setActive] = useState<LevelKey>("REGULAR");
  const [form, setForm] = useState<LevelBenefit | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  // 当前编辑档位的基线快照（未保存更改检测）
  const [baseline, setBaseline] = useState("");
  const activeRef = useRef<LevelKey>("REGULAR");
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const cloneLevel = (level: LevelBenefit): LevelBenefit => ({
    ...level,
    benefits: level.benefits.map((b) => ({ ...b })),
  });

  const fetchLevels = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ levels: LevelBenefit[] }>("/api/admin/membership-benefits");
      setLevels(data.levels);
      const target = data.levels.find((l) => l.level === activeRef.current) ?? null;
      const next = target ? cloneLevel(target) : null;
      setForm(next);
      setBaseline(next ? JSON.stringify(next) : "");
      setLoadError(false);
    } catch (e) {
      setLoadError(true);
      showError(e instanceof Error ? e.message : "加载会员权益配置失败");
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    deferInEffect(fetchLevels);
  }, [fetchLevels]);

  const isDirty = useMemo(
    () => !!form && baseline !== "" && JSON.stringify(form) !== baseline,
    [form, baseline]
  );
  const { guard: guardDiscard } = useUnsavedChanges(
    isDirty,
    "当前修改尚未保存，确定要放弃吗？"
  );

  /** 直接切换档位（内部使用，不做脏值确认） */
  const loadLevel = (level: LevelKey) => {
    setActive(level);
    activeRef.current = level;
    const target = levels.find((l) => l.level === level);
    if (target) {
      const next = cloneLevel(target);
      setForm(next);
      setBaseline(JSON.stringify(next));
    }
  };

  const switchLevel = (level: LevelKey) => {
    if (level === active) return;
    guardDiscard(() => loadLevel(level));
  };

  const updateBenefit = (index: number, patch: Partial<BenefitItem>) => {
    if (!form) return;
    setForm({
      ...form,
      benefits: form.benefits.map((b, i) => (i === index ? { ...b, ...patch } : b)),
    });
  };

  const addBenefit = () => {
    if (!form) return;
    setForm({ ...form, benefits: [...form.benefits, { icon: "", title: "", desc: "" }] });
  };

  const removeBenefit = (index: number) => {
    if (!form) return;
    setForm({ ...form, benefits: form.benefits.filter((_, i) => i !== index) });
  };

  const handleSave = async () => {
    if (!form) return;
    if (!form.name.trim()) {
      showError("等级名称不能为空");
      return;
    }
    if (form.benefits.length === 0) {
      showError("至少保留一条权益");
      return;
    }
    if (form.benefits.some((b) => !b.title.trim() || !b.desc.trim())) {
      showError("权益标题与描述不能为空");
      return;
    }
    if (!Number.isInteger(form.minSpent) || form.minSpent < 0) {
      showError("消费门槛必须为不小于 0 的整数");
      return;
    }
    if (form.maxSpent !== null && (!Number.isInteger(form.maxSpent) || form.maxSpent < 0)) {
      showError("消费上限必须为不小于 0 的整数或留空");
      return;
    }
    if (form.maxSpent !== null && form.maxSpent < form.minSpent) {
      showError("消费上限不能小于消费门槛");
      return;
    }

    setSaving(true);
    try {
      const data = await apiPut<LevelBenefit>("/api/admin/membership-benefits", {
        level: form.level,
        name: form.name.trim(),
        nameEn: form.nameEn.trim() || undefined,
        icon: form.icon.trim() || undefined,
        minSpent: form.minSpent,
        maxSpent: form.maxSpent,
        benefits: form.benefits.map((b) => ({
          icon: b.icon.trim(),
          title: b.title.trim(),
          desc: b.desc.trim(),
        })),
        colorClass: form.colorClass.trim() || undefined,
      });
      success(`${form.name} 权益配置已保存`);
      setLevels((prev) =>
        prev.map((l) => (l.level === data.level ? { ...data } : l))
      );
      const next = cloneLevel(data);
      setForm(next);
      setBaseline(JSON.stringify(next));
    } catch (e) {
      showError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24">
        <p className="text-sm text-red-500">加载会员权益配置失败</p>
        <Button variant="outline" size="sm" onClick={fetchLevels}>
          重试
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-medium text-brand-charcoal">
          <Crown className="h-6 w-6 text-brand-primary" />
          会员权益配置
        </h1>
        <p className="mt-1 text-sm text-brand-charcoal/50">
          配置会员等级在前台展示的名称、门槛文案与权益列表
        </p>
      </div>

      {/* 判级说明 */}
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <p>
          实际等级判定以系统硬编码阈值为准：普通 ¥0 / 银卡 ¥{GRADING_THRESHOLDS.SILVER.toLocaleString()} /
          金卡 ¥{GRADING_THRESHOLDS.GOLD.toLocaleString()} / 钻石 ¥
          {GRADING_THRESHOLDS.DIAMOND.toLocaleString()}。此处修改的消费门槛仅影响前台展示文案与进度展示，
          不会改变等级判定结果。
        </p>
      </div>

      {/* 档位切换 */}
      <div className="flex flex-wrap gap-2">
        {LEVEL_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => switchLevel(tab.key)}
            className={cn(
              "flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm transition-colors",
              active === tab.key
                ? "border-brand-primary bg-brand-primary text-white"
                : "border-brand-charcoal/15 bg-white text-brand-charcoal/70 hover:border-brand-charcoal/30"
            )}
          >
            {tab.label}
            {levels.find((l) => l.level === tab.key)?.source === "db" && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px]",
                  active === tab.key ? "bg-white/20" : "bg-brand-charcoal/8"
                )}
              >
                已自定义
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 编辑表单 */}
      {form && (
        <div className="space-y-6 rounded-xl bg-white p-6 shadow-sm">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="等级名称"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              maxLength={50}
              disabled={!canWrite}
            />
            <Input
              label="英文名称"
              value={form.nameEn}
              onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
              maxLength={50}
              disabled={!canWrite}
            />
            <Input
              label="图标（emoji 或字符，选填）"
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
              maxLength={200}
              disabled={!canWrite}
            />
            <Input
              label="颜色类名（Tailwind，选填）"
              value={form.colorClass}
              onChange={(e) => setForm({ ...form, colorClass: e.target.value })}
              maxLength={100}
              placeholder="如 text-amber-600"
              disabled={!canWrite}
            />
            <Input
              label="消费门槛 minSpent（元，仅展示）"
              type="number"
              min={0}
              value={String(form.minSpent)}
              onChange={(e) => setForm({ ...form, minSpent: Number(e.target.value || 0) })}
              disabled={!canWrite}
            />
            <Input
              label="消费上限 maxSpent（元，留空表示无上限）"
              type="number"
              min={0}
              value={form.maxSpent === null ? "" : String(form.maxSpent)}
              onChange={(e) =>
                setForm({ ...form, maxSpent: e.target.value === "" ? null : Number(e.target.value) })
              }
              disabled={!canWrite}
            />
          </div>

          {/* 权益列表 */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-brand-charcoal">
                权益列表（{form.benefits.length}）
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={addBenefit}
                leftIcon={<Plus className="h-4 w-4" />}
                disabled={!canWrite}
              >
                添加权益
              </Button>
            </div>

            {form.benefits.length === 0 ? (
              <p className="rounded-lg bg-brand-charcoal/[0.03] px-4 py-6 text-center text-sm text-brand-charcoal/40">
                暂无权益项，点击「添加权益」新增
              </p>
            ) : (
              <div className="space-y-3">
                {form.benefits.map((benefit, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-1 gap-3 rounded-lg border border-brand-charcoal/10 p-3 md:grid-cols-[100px_1fr_2fr_auto]"
                  >
                    <Input
                      value={benefit.icon}
                      onChange={(e) => updateBenefit(index, { icon: e.target.value })}
                      placeholder="图标"
                      maxLength={200}
                      disabled={!canWrite}
                    />
                    <Input
                      value={benefit.title}
                      onChange={(e) => updateBenefit(index, { title: e.target.value })}
                      placeholder="权益标题（必填）"
                      maxLength={50}
                      disabled={!canWrite}
                    />
                    <Input
                      value={benefit.desc}
                      onChange={(e) => updateBenefit(index, { desc: e.target.value })}
                      placeholder="权益描述（必填）"
                      maxLength={300}
                      disabled={!canWrite}
                    />
                    <button
                      type="button"
                      onClick={() => removeBenefit(index)}
                      disabled={!canWrite}
                      className="flex items-center justify-center rounded-lg p-2 text-brand-charcoal/40 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="删除权益"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-brand-charcoal/8 pt-4">
            {!canWrite && (
              <span className="mr-auto text-xs text-brand-charcoal/40">
                只读模式：修改会员权益需要 membership:write 权限
              </span>
            )}
            <Button
              variant="outline"
              onClick={() => guardDiscard(() => loadLevel(active))}
              disabled={saving || !isDirty}
            >
              重置
            </Button>
            <Button onClick={handleSave} loading={saving} disabled={!canWrite}>
              保存配置
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
