import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { getAdminRoleDisplay } from "@/lib/admin-display";

interface AdminRoleBadgeProps {
  role: string;
  /** 个人权限覆盖数组；非空时显示“自定义管理” */
  overrides?: readonly string[] | null;
  className?: string;
}

/**
 * 管理员角色列：永远只渲染一个徽标。
 * - owner → 主管理员
 * - 有个人权限覆盖 → 自定义管理
 * - 其他 → 基础角色标签
 */
export function AdminRoleBadge({ role, overrides, className }: AdminRoleBadgeProps) {
  const display = getAdminRoleDisplay(role, overrides);

  return (
    <span title={display.title} className="inline-flex">
      <Badge variant={display.variant} className={cn("whitespace-nowrap", className)}>
        {display.label}
        {display.srSuffix && <span className="sr-only">{display.srSuffix}</span>}
      </Badge>
    </span>
  );
}
