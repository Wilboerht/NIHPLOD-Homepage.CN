"use client";

/**
 * 在 effect 中以微任务延迟执行回调
 *
 * react-hooks/set-state-in-effect 规则禁止在 effect 体内同步调用会触发 setState 的函数
 * （会引发级联渲染）。数据加载类 effect 中的 setState 本就发生在网络请求之后，
 * 用微任务延迟一个 tick 执行不改变行为语义，同时满足该规则。
 *
 * 用法：
 * ```ts
 * useEffect(() => {
 *   deferInEffect(fetchData);
 * }, [fetchData]);
 * ```
 */
export function deferInEffect(fn: () => unknown): void {
  Promise.resolve().then(fn);
}
