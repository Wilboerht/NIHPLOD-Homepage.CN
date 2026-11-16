import {
  ROLE_LABELS,
  resolveAdminPermissions,
  type AdminRoleValue,
} from "@/lib/admin-permissions";

export const CUSTOM_ADMIN_LABEL = "自定义管理";

export type AdminRoleBadgeVariant = "primary" | "secondary" | "default";

export interface AdminRoleDisplay {
  label: string;
  variant: AdminRoleBadgeVariant;
  /** 原生 title 提示：基础角色与权限差异 */
  title?: string;
  /** 读屏补充信息，视觉隐藏 */
  srSuffix?: string;
}

export interface PermissionDiff {
  added: string[];
  removed: string[];
  addedCount: number;
  removedCount: number;
}

/** owner 不参与“自定义管理”判定；其余角色以覆盖数组非空为准 */
export function isCustomizedAdmin(
  role: string,
  overrides?: readonly string[] | null
): boolean {
  return role !== "owner" && (overrides?.length ?? 0) > 0;
}

/** 对比角色模板与有效权限，返回新增/撤销的权限点 */
export function getPermissionDiff(
  role: string,
  effectivePermissions: Iterable<string>
): PermissionDiff {
  const template = new Set<string>(resolveAdminPermissions(role));
  const effective = new Set<string>(effectivePermissions);
  const added = [...effective].filter((permission) => !template.has(permission));
  const removed = [...template].filter((permission) => !effective.has(permission));
  return {
    added,
    removed,
    addedCount: added.length,
    removedCount: removed.length,
  };
}

/**
 * 角色列显示规则：
 * - owner → 主管理员
 * - 非 owner 且有个人权限覆盖 → 自定义管理
 * - 其他 → 基础角色标签
 */
export function getAdminRoleDisplay(
  role: string,
  overrides?: readonly string[] | null
): AdminRoleDisplay {
  if (role === "owner") {
    return {
      label: ROLE_LABELS.owner,
      variant: "primary",
      title: "超级管理员",
    };
  }

  if (isCustomizedAdmin(role, overrides)) {
    const baseLabel = ROLE_LABELS[role as AdminRoleValue] ?? role;
    const diff = getPermissionDiff(role, resolveAdminPermissions(role, overrides as string[]));
    const diffText =
      diff.addedCount || diff.removedCount
        ? `权限 +${diff.addedCount} / -${diff.removedCount}`
        : "与角色模板一致";
    return {
      label: CUSTOM_ADMIN_LABEL,
      variant: "secondary",
      title: `基于「${baseLabel}」角色，${diffText}`,
      srSuffix: `（基于${baseLabel}角色，${diffText}）`,
    };
  }

  return {
    label: ROLE_LABELS[role as AdminRoleValue] ?? role,
    variant: "default",
  };
}

/** 侧边栏等只有“是否自定义”布尔值的场景 */
export function getAdminRoleLabel(role: string, customized: boolean): string {
  if (role === "owner") return ROLE_LABELS.owner;
  if (customized) return CUSTOM_ADMIN_LABEL;
  return ROLE_LABELS[role as AdminRoleValue] ?? role;
}
