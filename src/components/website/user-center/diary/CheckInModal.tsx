"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, LazyMotion, domAnimation, m } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { useToast } from "@/components/ui/Toast";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useScrollLock } from "@/hooks/useScrollLock";
import { deferInEffect } from "@/hooks/deferInEffect";
import { localDateStr } from "@/lib/local-date";
import { STATE_META, type DiaryEntry } from "@/components/website/user-center/diary/DiaryTimeline";

/** 积分变动广播事件：打卡到账后通知用户中心刷新积分余额 */
const POINTS_CHANGED_EVENT = "nihplod:points-changed";

/** 预置标签（多选，与服务端 tags 上限一致）：肌肤表现 + 其他因素 两类 */
const SKIN_TAGS = ["出油", "干燥", "暗沉", "泛红", "痘痘", "闭口", "局部受损"];
const SITUATION_TAGS = ["熬夜", "换季", "姨妈期", "压力", "医美", "醉酒", "暴晒"];
const STATE_KEYS = ["great", "good", "normal", "bad", "terrible"] as const;

interface CheckInModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 编辑当日已有记录时传入；新建为 null */
  existing: DiaryEntry | null;
  /** 打卡目标日期（YYYY-MM-DD，默认今天）；补打卡时传过去日期 */
  dateStr?: string;
  /** 保存成功后回调（父级刷新日记列表） */
  onSaved: () => void;
}

/**
 * CheckInModal — 护肤打卡弹层（userId+date 唯一，upsert）
 * 选择肌肤状态 + 情境标签 + 可选备注；支持补打卡（指定过去日期）；
 * 容器/动效与 AccountModal 等全站模态框对齐。
 */
export function CheckInModal({ isOpen, onClose, existing, dateStr, onSaved }: CheckInModalProps) {
  const toast = useToast();
  const [skinState, setSkinState] = useState<string>("good");
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  // ref 双保险：state 更新有异步窗口，同步锁保证写入请求绝对只发一次
  const savingRef = useRef(false);

  // "今天"快照：打开弹层时刷新，避免渲染期直接调用 new Date() 且跨午夜常驻后口径过期
  const [todayOnOpen, setTodayOnOpen] = useState(() => localDateStr(new Date()));
  useEffect(() => {
    if (isOpen) deferInEffect(() => setTodayOnOpen(localDateStr(new Date())));
  }, [isOpen]);

  const targetDate = dateStr ?? todayOnOpen;
  const isToday = targetDate === todayOnOpen;
  // date 语义是 UTC 零点表示的本地日历日：格式化必须锁 UTC，否则 UTC 以西时区会显示前一天
  const targetLabel = new Date(`${targetDate}T00:00:00.000Z`).toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  });

  const modalRef = useFocusTrap(isOpen);
  useScrollLock(isOpen);

  // 打开时初始化表单（编辑带入旧值；新建重置）
  useEffect(() => {
    if (!isOpen) return;
    deferInEffect(() => {
      setSkinState(existing?.skinState && STATE_META[existing.skinState] ? existing.skinState : "good");
      setTags(existing?.tags?.slice(0, 5) ?? []);
      setNote(existing?.note ?? "");
    });
  }, [isOpen, existing]);

  const toggleTag = (tag: string) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag].slice(0, 5)));
  };

  const handleSave = async () => {
    if (saving || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      // 提交时重取实时"今天"：弹层跨午夜常驻时，"今日打卡"应落到提交当天
      const submitDate = dateStr ?? localDateStr(new Date());
      const submitIsToday = submitDate === localDateStr(new Date());
      const res = await fetchWithAuth("/api/user/skincare-archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: submitDate,
          skinState,
          tags,
          note: note.trim() || undefined,
        }),
      });
      if (!res.ok) {
        // 错误透出服务端文案（官网 BFF 契约：{ success:false, error:{ code, message } }；
        // 兼容旧的 { error: "文案" } 形态），避免一律吞成"保存未成功"
        const errData = (await res.json().catch(() => null)) as
          | { error?: string | { message?: string } }
          | null;
        const message =
          typeof errData?.error === "string" ? errData.error : errData?.error?.message;
        throw new Error(message || "保存未成功");
      }
      // 打卡积分（仅首次手动打卡返回）：连续第 1/2/3+ 天 +1/+2/+3 分
      const resData = (await res.json().catch(() => null)) as {
        points?: { granted?: number };
      } | null;
      const granted = resData?.points?.granted ?? 0;
      const pointsSuffix = granted > 0 ? `，+${granted} 积分` : "";
      // 余额联动：打卡实际到账时广播，账户面板「我的」收到后静默刷新积分余额
      if (granted > 0 && typeof window !== "undefined") {
        window.dispatchEvent(new Event(POINTS_CHANGED_EVENT));
      }
      const submitLabel = new Date(`${submitDate}T00:00:00.000Z`).toLocaleDateString("zh-CN", {
        month: "numeric",
        day: "numeric",
        timeZone: "UTC",
      });
      toast.success(
        existing
          ? submitIsToday ? "今日记录已更新" : "记录已更新"
          : submitIsToday ? `打卡成功${pointsSuffix}` : `已补打卡 ${submitLabel}${pointsSuffix}`
      );
      onSaved();
      onClose();
    } catch (err) {
      console.error("Diary check-in error:", err);
      const msg =
        err instanceof Error && err.message && err.message !== "保存未成功"
          ? err.message
          : "保存未成功，请稍后再试";
      toast.error(msg);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <LazyMotion features={domAnimation}>
    <AnimatePresence>
      {isOpen && (
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkin-modal-title"
          tabIndex={-1}
          className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          {/* 背景遮罩 */}
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/25 backdrop-blur-sm"
          />

          <m.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative z-10 flex w-full max-h-[86dvh] flex-col overflow-hidden bg-[#F7F4EE] rounded-t-[28px] sm:rounded-[2.5rem] sm:max-w-sm sm:max-h-[85vh] shadow-[0_45px_80px_-16px_rgba(61,47,37,0.18)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 关闭按钮 */}
            <button
              onClick={onClose}
              aria-label="关闭"
              className="absolute top-[calc(0.75rem+env(safe-area-inset-top,0px))] right-3 sm:top-5 sm:right-5 z-20 w-11 h-11 sm:w-8 sm:h-8 flex items-center justify-center rounded-full text-brand-charcoal/60 hover:text-brand-charcoal hover:bg-brand-charcoal/[0.04] transition-colors"
            >
              <X size={17} strokeWidth={1.5} />
            </button>

            {/* 内容区：移动端小屏/键盘弹起时限高内滚，保存按钮始终可达 */}
            <div className="no-scrollbar flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 md:px-8 pt-[calc(3rem+env(safe-area-inset-top,0px))] sm:pt-10 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] sm:pb-8">
              <h2
                id="checkin-modal-title"
                className="text-xl font-serif font-light text-brand-charcoal tracking-[0.08em] text-center mb-6"
              >
                {existing
                  ? isToday ? "编辑今日记录" : `编辑记录 · ${targetLabel}`
                  : isToday ? "今日打卡" : `补打卡 · ${targetLabel}`}
              </h2>

              {/* 肌肤状态（单选）：选中态描边 + 底色，未选中保留透明边保持尺寸稳定 */}
              <div className="flex justify-between gap-1 mb-5">
                {STATE_KEYS.map((key) => {
                  const meta = STATE_META[key];
                  const Icon = meta.icon;
                  const selected = skinState === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSkinState(key)}
                      aria-pressed={selected}
                      style={
                        selected
                          ? { backgroundColor: `${meta.color}14`, borderColor: `${meta.color}59` }
                          : undefined
                      }
                      className={`flex flex-col items-center gap-1.5 flex-1 py-2.5 rounded-2xl border transition-colors cursor-pointer ${
                        selected ? "" : "border-transparent hover:bg-brand-charcoal/[0.03]"
                      }`}
                    >
                      <span style={{ color: selected ? meta.color : "#6B5E50" }}>
                        <Icon className="w-6 h-6" strokeWidth={1.5} />
                      </span>
                      <span
                        className="text-[11px] font-light"
                        style={{ color: selected ? meta.color : "#6B5E50" }}
                      >
                        {meta.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* 标签（多选，两类：肌肤表现 / 其他因素） */}
              <div className="mb-5 space-y-3">
                {[
                  { caption: "肌肤表现", list: SKIN_TAGS },
                  { caption: "其他因素", list: SITUATION_TAGS },
                ].map((group) => (
                  <div key={group.caption}>
                    <p className="text-[11px] text-brand-charcoal/60 font-light mb-1.5 tracking-[0.08em]">
                      {group.caption}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {group.list.map((tag) => {
                        const selected = tags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleTag(tag)}
                            aria-pressed={selected}
                            className={`px-3 py-1.5 rounded-full text-[12px] font-light border transition-colors cursor-pointer ${
                              selected
                                ? "border-brand-primary/50 text-brand-primary bg-brand-primary/[0.06]"
                                : "border-stone-200/60 text-brand-charcoal/70 hover:border-brand-charcoal/30"
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* 备注（可选） */}
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 200))}
                rows={3}
                placeholder="今天用了什么、肌肤有什么变化…（选填）"
                className="w-full mb-5 px-4 py-3 text-[13px] font-light text-brand-charcoal bg-white/70 border border-stone-200/60 rounded-2xl resize-none focus:outline-none focus:border-brand-primary/50 focus:ring-1 focus:ring-brand-primary/15 placeholder:text-brand-charcoal/50"
              />

              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-full bg-brand-primary text-white text-[13px] tracking-[0.12em] font-medium cursor-pointer transition-colors duration-300 hover:bg-brand-primary-dark disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {existing ? "保存修改" : "完成打卡"}
              </button>

              {/* 编辑态说明不重复发放，避免用户困惑 */}
              {existing && (
                <p className="mt-3 text-center text-[11px] font-light tracking-[0.04em] text-brand-charcoal/55">
                  编辑已有记录不重复发放积分
                </p>
              )}
            </div>
          </m.div>
        </div>
      )}
    </AnimatePresence>
    </LazyMotion>
  );
}
