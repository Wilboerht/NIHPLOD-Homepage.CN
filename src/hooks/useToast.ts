/**
 * useToast Hook - 重新导出自 Toast 组件
 * 
 * 使用示例:
 * 
 * ```tsx
 * const { success, error, loading, dismiss, update } = useToast();
 * 
 * // 简单提示
 * success("操作成功");
 * error("操作失败");
 * 
 * // 加载状态
 * const toastId = loading("保存中...");
 * // 完成后更新
 * update(toastId, { type: "success", message: "保存成功" });
 * // 或直接关闭
 * dismiss(toastId);
 * 
 * // 关闭所有
 * dismiss();
 * ```
 */
export { useToast } from "@/components/ui/Toast";

