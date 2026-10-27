import { ShieldAlert } from "lucide-react";
import { PERMISSION_LABELS, type AdminPermission } from "@/lib/admin-permissions";

interface AdminAccessDeniedProps {
  /** 缺失的权限点（为空时显示通用提示） */
  permissions?: AdminPermission[];
  /** all = 全部需要，any = 任一即可 */
  mode?: "all" | "any";
  /** 覆盖默认描述 */
  description?: string;
}

/**
 * 管理端无权访问提示。
 * 客户端 RequirePermission 与服务端页面门禁共用，保证两处展示一致。
 */
export function AdminAccessDenied({
  permissions = [],
  mode = "any",
  description,
}: AdminAccessDeniedProps) {
  const labels = permissions
    .map((permission) => PERMISSION_LABELS[permission])
    .join(mode === "all" ? "」和「" : "」或「");
  const text =
    description ??
    (labels ? `该页面需要「${labels}」权限，请联系超级管理员开通` : "请联系超级管理员开通相应权限");

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <ShieldAlert className="h-12 w-12 text-brand-charcoal/65" />
      <p className="text-lg font-medium text-brand-charcoal/70">无权访问</p>
      <p className="text-sm text-brand-charcoal/65">{text}</p>
    </div>
  );
}
