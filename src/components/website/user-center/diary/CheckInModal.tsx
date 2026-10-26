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
      setSkinState(
        existing?.skinState && STATE_META[existing.skinState] ? existing.skinState : "good"
      );
      setTags(existing?.tags?.slice(0, 5) ?? []);
      setNote(existing?.note ?? "");
    });
  }, [isOpen, existing]);

  const toggleTag = (tag: string) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag].slice(0, 5)
    );
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
        const errData = (await res.json().catch(() => null)) as {
          error?: string | { message?: string };
        } | null;
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
          ? submitIsToday
            ? "今日记录已更新"
            : "记录已更新"
          : submitIsToday
            ? `打卡成功${pointsSuffix}`
            : `已补打卡 ${submitLabel}${pointsSuffix}`
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
            className="fixed inset-0 z-[10000] flex items-end justify-center p-0 sm:items-center sm:p-4"
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
              className="relative z-10 flex max-h-[86dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-[#F7F4EE] shadow-[0_45px_80px_-16px_rgba(61,47,37,0.18)] sm:max-h-[85vh] sm:max-w-sm sm:rounded-[2.5rem]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 关闭按钮 */}
              <button
                onClick={onClose}
                aria-label="关闭"
                className="absolute right-3 top-[calc(0.75rem+env(safe-area-inset-top,0px))] z-20 flex h-11 w-11 items-center justify-center rounded-full text-brand-charcoal/60 transition-colors hover:bg-brand-charcoal/[0.04] hover:text-brand-charcoal sm:right-5 sm:top-5 sm:h-8 sm:w-8"
              >
                <X size={17} strokeWidth={1.5} />
              </button>

              {/* 内容区：移动端小屏/键盘弹起时限高内滚，保存按钮始终可达 */}
              <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] pt-[calc(3rem+env(safe-area-inset-top,0px))] sm:pb-8 sm:pt-10 md:px-8">
                <h2
                  id="checkin-modal-title"
                  className="mb-6 text-center font-serif text-xl font-light tracking-[0.08em] text-brand-charcoal"
                >
                  {existing
                    ? isToday
                      ? "编辑今日记录"
                      : `编辑记录 · ${targetLabel}`
                    : isToday
                      ? "今日打卡"
                      : `补打卡 · ${targetLabel}`}
                </h2>

                {/* 肌肤状态（单选）：选中态描边 + 底色，未选中保留透明边保持尺寸稳定 */}
                <div className="mb-5 flex justify-between gap-1">
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
                        className={`flex flex-1 cursor-pointer flex-col items-center gap-1.5 rounded-2xl border py-2.5 transition-colors ${
                          selected ? "" : "border-transparent hover:bg-brand-charcoal/[0.03]"
                        }`}
                      >
                        <span style={{ color: selected ? meta.color : "#6B5E50" }}>
                          <Icon className="h-6 w-6" strokeWidth={1.5} />
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
                      <p className="mb-1.5 text-[11px] font-light tracking-[0.08em] text-brand-charcoal/60">
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
                              className={`cursor-pointer rounded-full border px-3 py-1.5 text-[12px] font-light transition-colors ${
                                selected
                                  ? "border-brand-cocoa/50 bg-brand-cocoa/[0.06] text-brand-cocoa"
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
                  className="mb-5 w-full resize-none rounded-2xl border border-stone-200/60 bg-white/70 px-4 py-3 text-[13px] font-light text-brand-charcoal placeholder:text-brand-charcoal/50 focus:border-brand-cocoa/50 focus:outline-none focus:ring-1 focus:ring-brand-cocoa/15"
                />

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-brand-cocoa text-[13px] font-medium tracking-[0.12em] text-white transition-colors duration-300 hover:bg-brand-cocoa-dark disabled:opacity-50"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
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
