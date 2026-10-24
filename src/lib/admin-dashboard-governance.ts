import type { AdminUser } from "@/types/auth";
import { prisma } from "./prisma";
import {
  ADMIN_PERMISSIONS,
  ROLE_LABELS,
  ROLE_TEMPLATES,
  resolveAdminPermissions,
  hasAdminPermission,
  type AdminPermission,
} from "./admin-permissions";
import { AUDIT_ACTION_LABELS } from "./audit-labels";
import { getOwnerApprovalOverview } from "./admin-approval";

const SENSITIVE_ACTIONS = [
  "create_admin",
  "update_admin",
  "delete_admin",
  "admin_totp_recovery_issued",
  "admin_totp_recovery_used",
  "admin_totp_backup_regenerate",
  "admin_login_failed",
  "admin_totp_failed",
  "step_up_failed",
  "user_password_reset",
  "user_status_change",
  "user_identity_unbind",
  "user_deleted",
  "break_glass_view",
  "oauth_client_create",
  "oauth_client_update",
  "oauth_client_delete",
  "oauth_client_rotate_secret",
  "oauth_consent_revoke",
  "oauth_session_terminate",
  "user_export",
  "audit_log_export",
  "sso_audit_export",
  "audit_retention_execute",
  "audit_legal_hold_create",
  "audit_legal_hold_release",
  "admin_approval_requested",
  "admin_approval_approved",
  "admin_approval_rejected",
  "admin_approval_retried",
  "admin_approval_executed",
  "admin_approval_execution_failed",
  "admin_approval_stale",
];

const AUTH_FAILURE_ACTIONS = ["admin_login_failed", "admin_totp_failed", "step_up_failed"];

const MANUAL_FUND_ACTIONS = [
  "user_points_adjust",
  "approve_spent_adjustment",
  "reject_spent_adjustment",
  "undo_spent_adjustment",
  "import_spent_records",
  "undo_spent_import",
  "point_redemption_cancel",
  "point_gift_create",
  "point_gift_update",
  "update_vip_benefit",
  "reset_vip_benefit",
];

const SYSTEM_FUND_ACTIONS = [
  "points_internal_sync",
  "points_internal_grant",
  "points_internal_redeem",
  "points_internal_refund",
  "point_redemption_auto_cancel",
];

const OWNER_ONLY_ACTIONS = [
  "create_admin",
  "delete_admin",
  "admin_totp_recovery_issued",
  "user_password_reset",
  "user_status_change",
  "user_identity_unbind",
  "user_deleted",
  "user_points_adjust",
  "point_redemption_cancel",
  "oauth_client_create",
  "oauth_client_update",
  "oauth_client_delete",
  "oauth_client_rotate_secret",
  "oauth_consent_revoke",
  "oauth_session_terminate",
  "audit_retention_execute",
  "audit_legal_hold_create",
  "audit_legal_hold_release",
  "run_cron_task",
  "webhook_failure_retry",
  "webhook_failure_delete",
  "amap_config_view",
  "sso_audit_export",
];

const nonOwnerPermissions = new Set<string>(
  Object.values(ROLE_TEMPLATES).flatMap((permissions) => [...permissions])
);
export const OWNER_ONLY_PERMISSIONS: AdminPermission[] = ADMIN_PERMISSIONS.filter(
  (permission) => !nonOwnerPermissions.has(permission)
);

export interface MonitorEventView {
  id: string;
  label: string;
  actor: string;
  actorRole: string | null;
  target: string | null;
  amount: string | null;
  riskLevel: string | null;
  outcome: string;
  createdAt: string;
  href: string;
  kind: "admin" | "auth" | "user" | "funds" | "spent" | "config";
}

type AuditRow = {
  id: string;
  action: string;
  detail: unknown;
  outcome: string;
  riskLevel: string | null;
  actorType: string;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  targetType: string;
  targetId: string | null;
  targetLabel: string | null;
  requestId: string | null;
  createdAt: Date;
};

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function actionLabel(row: AuditRow): string {
  const detail = toRecord(row.detail);
  if (row.action === "update_admin") {
    const sub = typeof detail.action === "string" ? detail.action : null;
    if (sub === "totp_setup_initiated") return "开始绑定 TOTP";
    if (sub === "totp_enabled") return "启用 TOTP";
    if (sub === "totp_disabled") return "关闭 TOTP";
    if (sub === "totp_backup_regenerated") return "重新生成 TOTP 备用码";
    if (sub === "totp_recovery_setup_started") return "开始配置 TOTP 恢复码";
    if (sub === "totp_recovery_enabled") return "启用 TOTP 恢复码";
    if (detail.passwordChanged) return "修改管理员密码";
    if (detail.permissionsChanged) return "调整管理员权限";
    if (Array.isArray(detail.updatedFields)) {
      if (detail.updatedFields.includes("role")) return "调整管理员角色";
      if (detail.updatedFields.includes("email")) return "修改管理员邮箱";
      if (detail.updatedFields.every((field) => field === "name")) return "修改管理员姓名";
    }
    return "更新管理员";
  }
  if (row.action === "create_admin") return "创建管理员";
  if (row.action === "delete_admin") return "删除管理员";
  if (row.action === "admin_totp_recovery_issued") return "签发 TOTP 恢复码";
  if (row.action === "admin_totp_recovery_used") return "使用 TOTP 恢复码登录";
  if (row.action === "admin_totp_backup_regenerate") return "重新生成 TOTP 备用码";
  if (row.action === "admin_login_failed") return "管理员登录失败";
  if (row.action === "admin_totp_failed") return "管理员二次验证失败";
  if (row.action === "step_up_failed") return "敏感操作二次验证失败";
  if (row.action === "user_password_reset") return "重置用户密码";
  if (row.action === "user_status_change") return "变更用户状态";
  if (row.action === "user_identity_unbind") return "解绑用户外部身份";
  if (row.action === "user_deleted") return "删除用户";
  if (row.action === "break_glass_view") return "查看子站应急账号";
  if (row.action === "oauth_client_rotate_secret") return "轮换 SSO 客户端密钥";
  if (row.action === "oauth_client_delete") return "删除 SSO 客户端";
  if (row.action === "oauth_client_update") return "更新 SSO 客户端";
  if (row.action === "oauth_client_create") return "创建 SSO 客户端";
  if (row.action === "oauth_consent_revoke") return "撤销 SSO 授权";
  if (row.action === "oauth_session_terminate") return "终止 SSO 会话";
  if (row.action === "user_points_adjust") return "人工调整积分";
  if (row.action === "point_redemption_cancel") return "取消兑换并退分";
  if (row.action === "approve_spent_adjustment") return "通过消费补录";
  if (row.action === "reject_spent_adjustment") return "驳回消费补录";
  if (row.action === "undo_spent_adjustment") return "撤销消费补录";
  if (row.action === "import_spent_records") return "导入消费记录";
  if (row.action === "undo_spent_import") return "撤销消费导入";
  if (row.action === "points_internal_sync") return "消费同步";
  if (row.action === "points_internal_grant") return "内部发放积分";
  if (row.action === "points_internal_redeem") return "内部扣减积分";
  if (row.action === "points_internal_refund") return "内部退回积分";
  if (row.action === "point_redemption_auto_cancel") return "超时兑换自动取消";
  if (row.action === "user_export") return "导出用户数据";
  if (row.action === "audit_log_export") return "导出审计日志";
  if (row.action === "sso_audit_export") return "导出 SSO 审计日志";
  if (row.action === "audit_retention_execute") return "执行审计到期清理";
  if (row.action === "audit_legal_hold_create") return "设置审计法律保留";
  if (row.action === "audit_legal_hold_release") return "解除审计法律保留";
  if (row.action === "run_cron_task") return "手动执行定时任务";
  if (row.action === "webhook_failure_retry") return "重投失败 Webhook";
  if (row.action === "webhook_failure_delete") return "删除失败 Webhook";
  if (row.action === "amap_config_view") return "查看高德地图密钥";
  return AUDIT_ACTION_LABELS[row.action] ?? row.action;
}

function amountText(row: AuditRow): string | null {
  const detail = toRecord(row.detail);
  const signedPoints = (value: unknown, sign: 1 | -1 = 1): string | null => {
    const number = Number(value);
    if (!Number.isFinite(number) || number === 0) return null;
    return `${number > 0 ? "+" : ""}${sign * number} 分`;
  };
  const yuan = (value: unknown): string | null => {
    const number = Number(value);
    if (!Number.isFinite(number) || number === 0) return null;
    return `${number > 0 ? "+" : ""}¥${number.toLocaleString("zh-CN")}`;
  };

  switch (row.action) {
    case "user_points_adjust":
      return signedPoints(detail.amount);
    case "points_internal_grant":
      return signedPoints(detail.granted ?? detail.points);
    case "points_internal_redeem": {
      const value = Number(detail.points);
      return Number.isFinite(value) && value !== 0 ? `-${value} 分` : null;
    }
    case "points_internal_refund":
      return signedPoints(detail.refunded);
    case "points_internal_sync":
      return yuan(detail.spentDelta ?? detail.appliedDelta);
    case "point_redemption_cancel":
    case "point_redemption_auto_cancel":
      return signedPoints(detail.refundedPoints);
    case "approve_spent_adjustment":
      return yuan(detail.reviewAmount);
    case "import_spent_records":
      return yuan(detail.totalAmount);
    case "undo_spent_import":
      return yuan(detail.totalAmount);
    default:
      return null;
  }
}

function eventKind(action: string): MonitorEventView["kind"] {
  if (AUTH_FAILURE_ACTIONS.includes(action)) return "auth";
  if (action.startsWith("user_")) return "user";
  if (action.startsWith("points_") || action === "point_redemption_cancel") return "funds";
  if (action.includes("spent")) return "spent";
  if (action.includes("gift") || action.includes("vip")) return "config";
  return "admin";
}

function eventHref(row: AuditRow): string {
  const params = new URLSearchParams();
  if (row.requestId) {
    params.set("requestId", row.requestId);
  } else {
    params.set("action", row.action);
    if (row.targetId) params.set("targetId", row.targetId);
  }
  if (row.actorType !== "ADMIN") params.set("actorType", row.actorType);
  return `/admin/audit-logs?${params.toString()}`;
}

function describeEvent(row: AuditRow): MonitorEventView {
  return {
    id: row.id,
    label: actionLabel(row),
    actor: row.actorName || row.actorEmail || (row.actorType === "ADMIN" ? "管理员" : "系统"),
    actorRole: row.actorRole,
    target: row.targetLabel || row.targetId || null,
    amount: row.outcome === "SUCCESS" || row.outcome === "PARTIAL" ? amountText(row) : null,
    riskLevel: row.riskLevel,
    outcome: row.outcome,
    createdAt: row.createdAt.toISOString(),
    href: eventHref(row),
    kind: eventKind(row.action),
  };
}

export interface SecurityMonitorGroup {
  total: number;
  highRisk: number;
  authFailures: number;
  actors: number;
  manual: number;
  system: number;
  failures: number;
  events: MonitorEventView[];
}

export interface SecurityMonitorData {
  windowHours: 24;
  sensitive: SecurityMonitorGroup;
  funds: SecurityMonitorGroup;
}

export async function getSecurityMonitorData(
  admin: AdminUser
): Promise<SecurityMonitorData | null> {
  if (
    !hasAdminPermission(admin, "audit:read") ||
    !hasAdminPermission(admin, "audit:sensitive:read")
  ) {
    return null;
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sensitiveWhere = {
    action: { in: SENSITIVE_ACTIONS },
    actorType: "ADMIN" as const,
    createdAt: { gte: since },
  };
  const fundWhere = {
    action: { in: [...MANUAL_FUND_ACTIONS, ...SYSTEM_FUND_ACTIONS] },
    createdAt: { gte: since },
  };

  const [
    sensitiveTotal,
    sensitiveHighRisk,
    authFailures,
    sensitiveActors,
    sensitiveEvents,
    manualFunds,
    systemFunds,
    fundFailures,
    fundEvents,
  ] = await Promise.all([
    prisma.auditLog.count({ where: sensitiveWhere }),
    prisma.auditLog.count({
      where: { ...sensitiveWhere, riskLevel: { in: ["HIGH", "CRITICAL"] } },
    }),
    prisma.auditLog.count({
      where: {
        action: { in: AUTH_FAILURE_ACTIONS },
        actorType: "ADMIN",
        createdAt: { gte: since },
      },
    }),
    prisma.auditLog.groupBy({
      by: ["actorEmail"],
      where: sensitiveWhere,
      _count: { _all: true },
    }),
    prisma.auditLog.findMany({
      where: sensitiveWhere,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 5,
      select: {
        id: true,
        action: true,
        detail: true,
        outcome: true,
        riskLevel: true,
        actorType: true,
        actorName: true,
        actorEmail: true,
        actorRole: true,
        targetType: true,
        targetId: true,
        targetLabel: true,
        requestId: true,
        createdAt: true,
      },
    }),
    prisma.auditLog.count({
      where: { action: { in: MANUAL_FUND_ACTIONS }, createdAt: { gte: since } },
    }),
    prisma.auditLog.count({
      where: { action: { in: SYSTEM_FUND_ACTIONS }, createdAt: { gte: since } },
    }),
    prisma.auditLog.count({ where: { ...fundWhere, outcome: "FAILURE" } }),
    prisma.auditLog.findMany({
      where: { action: { in: MANUAL_FUND_ACTIONS }, createdAt: { gte: since } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 5,
      select: {
        id: true,
        action: true,
        detail: true,
        outcome: true,
        riskLevel: true,
        actorType: true,
        actorName: true,
        actorEmail: true,
        actorRole: true,
        targetType: true,
        targetId: true,
        targetLabel: true,
        requestId: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    windowHours: 24,
    sensitive: {
      total: sensitiveTotal,
      highRisk: sensitiveHighRisk,
      authFailures,
      actors: sensitiveActors.filter((row) => Boolean(row.actorEmail)).length,
      manual: 0,
      system: 0,
      failures: 0,
      events: sensitiveEvents.map(describeEvent),
    },
    funds: {
      total: manualFunds + systemFunds,
      highRisk: 0,
      authFailures: 0,
      actors: 0,
      manual: manualFunds,
      system: systemFunds,
      failures: fundFailures,
      events: fundEvents.map(describeEvent),
    },
  };
}

export interface OwnerPermissionHolder {
  id: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  permissions: AdminPermission[];
  totpEnabled: boolean;
}

export interface OwnerGovernanceData {
  approvals: Awaited<ReturnType<typeof getOwnerApprovalOverview>>;
  holders: OwnerPermissionHolder[];
  ownerOnly: {
    total: number;
    nonOwner: number;
    events: MonitorEventView[];
  };
  protectionRules: string[];
  unenforcedActions: string[];
}

const UNENFORCED_OWNER_ACTIONS: string[] = [];

export async function getOwnerGovernanceData(
  admin: AdminUser
): Promise<OwnerGovernanceData | null> {
  if (admin.role !== "owner") return null;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [approvals, admins, ownerOnlyTotal, ownerOnlyNonOwner, ownerOnlyEvents] = await Promise.all(
    [
      getOwnerApprovalOverview(),
      prisma.admin.findMany({
        where: { status: "ACTIVE", deletedAt: null },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          permissions: true,
          totpEnabled: true,
        },
      }),
      prisma.auditLog.count({
        where: {
          action: { in: OWNER_ONLY_ACTIONS },
          actorType: "ADMIN",
          createdAt: { gte: since },
        },
      }),
      prisma.auditLog.count({
        where: {
          action: { in: OWNER_ONLY_ACTIONS },
          actorType: "ADMIN",
          actorRole: { not: "owner" },
          createdAt: { gte: since },
        },
      }),
      prisma.auditLog.findMany({
        where: {
          action: { in: OWNER_ONLY_ACTIONS },
          actorType: "ADMIN",
          createdAt: { gte: since },
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: 5,
        select: {
          id: true,
          action: true,
          detail: true,
          outcome: true,
          riskLevel: true,
          actorType: true,
          actorName: true,
          actorEmail: true,
          actorRole: true,
          targetType: true,
          targetId: true,
          targetLabel: true,
          requestId: true,
          createdAt: true,
        },
      }),
    ]
  );

  const holders: OwnerPermissionHolder[] = admins
    .filter((item) => item.role !== "owner")
    .map((item) => {
      const effective = resolveAdminPermissions(item.role, item.permissions ?? []);
      return {
        id: item.id,
        name: item.name,
        email: item.email,
        role: item.role,
        roleLabel: ROLE_LABELS[item.role] ?? item.role,
        permissions: effective.filter((permission) => OWNER_ONLY_PERMISSIONS.includes(permission)),
        totpEnabled: item.totpEnabled,
      };
    })
    .filter((item) => item.permissions.length > 0);

  return {
    approvals,
    holders,
    ownerOnly: {
      total: ownerOnlyTotal,
      nonOwner: ownerOnlyNonOwner,
      events: ownerOnlyEvents.map(describeEvent),
    },
    protectionRules: [
      "仅 owner 可创建、提升、降级或删除 owner 账号",
      "不能删除或降级最后一任 owner",
      "非 owner 不能修改其他管理员的密码/邮箱",
      "非 owner 不能授予超出自身权限的权限",
    ],
    unenforcedActions: UNENFORCED_OWNER_ACTIONS,
  };
}
