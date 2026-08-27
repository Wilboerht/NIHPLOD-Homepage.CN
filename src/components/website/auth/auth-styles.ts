/** PC 端输入框通用样式 */
export const pcInputClass =
  "w-full bg-transparent border-0 border-b border-brand-charcoal/20 rounded-none py-4 px-0 text-base tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/50 placeholder:text-sm placeholder:tracking-wider placeholder:uppercase focus:outline-none focus:border-brand-charcoal/40 transition-colors";

export const pcBtnClass =
  "w-full py-4 text-sm font-light tracking-[0.15em] text-brand-charcoal border border-brand-charcoal/25 hover:bg-brand-charcoal/[0.03] active:scale-[0.98] transition-all disabled:opacity-40 flex items-center justify-center gap-2";

/** 移动端输入框通用样式 */
export const mobileInputBase =
  "bg-transparent border-0 border-b border-brand-charcoal/25 rounded-none py-3 px-0 text-base tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/50 placeholder:text-sm placeholder:tracking-wider focus:outline-none focus:border-brand-primary/60 transition-colors";

export const mobileInputClass = `w-full ${mobileInputBase}`;
export const mobileInputFlexClass = `flex-1 ${mobileInputBase}`;

export const mobileBtnClass =
  "w-full py-3.5 text-sm font-light tracking-[0.15em] text-brand-charcoal border border-brand-charcoal/25 hover:bg-brand-charcoal/[0.03] active:scale-[0.98] transition-all disabled:opacity-40";
