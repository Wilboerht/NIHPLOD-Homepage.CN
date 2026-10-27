/**
 * 审计事件元数据（唯一事实源）。
 *
 * 标签仍在 audit-labels.ts（客户端/服务端共用）；这里补充分类、风险、
 * 审计写入模式和是否必须填写原因。新增 action 时必须同时在 AUDIT_ACTIONS
 * 和 AUDIT_ACTION_LABELS 中登记，测试会保证不漂移。
 */
import { AUDIT_ACTION_LABELS, AUDIT_TARGET_TYPE_LABELS } from "./audit-labels";

export type AuditCategory = "auth" | "user" | "finance" | "security" | "content" | "system";
export type AuditRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AuditWriteMode = "strict" | "transactional" | "best-effort";

export interface AuditActionMeta {
  category: AuditCategory;
  riskLevel: AuditRiskLevel;
  writeMode: AuditWriteMode;
  requiresReason: boolean;
  label: string;
}

const AUTH_ACTIONS = new Set([
  "login",
  "logout",
  "user_login",
  "user_logout",
  "user_register",
  "user_reset_password",
  "user_set_password",
  "user_phone_changed",
  "user_wechat_bind",
  "user_oauth_revoke",
  "admin_login",
  "admin_logout",
  "admin_login_failed",
  "admin_totp_failed",
  "admin_totp_recovery_issued",
  "admin_totp_recovery_used",
  "admin_totp_backup_regenerate",
  "admin_sso_authorize",
  "admin_sso_token",
  "admin_sso_status_sync",
  "admin_sso_denied",
  "step_up_granted",
  "step_up_failed",
  "refresh_token_reuse_detected",
  "device_force_logout",
]);

const FINANCE_ACTIONS = new Set([
  "ship_order",
  "update_order",
  "refund_approve",
  "refund_reject",
  "user_points_adjust",
  "points_internal_sync",
  "points_internal_grant",
  "points_internal_redeem",
  "points_internal_refund",
  "point_redemption_auto_cancel",
  "point_invariant_check",
  "update_vip_benefit",
  "reset_vip_benefit",
  "submit_spent_adjustment",
  "approve_spent_adjustment",
  "reject_spent_adjustment",
  "undo_spent_adjustment",
  "import_spent_records",
  "undo_spent_import",
  "point_gift_create",
  "point_gift_update",
  "point_redemption_fulfill",
  "point_redemption_waybill_update",
  "point_redemption_cancel",
  "create_point_campaign",
  "update_point_campaign",
  "delete_point_campaign",
]);

const SECURITY_ACTIONS = new Set([
  "create_admin",
  "update_admin",
  "delete_admin",
  "break_glass_view",
  "oauth_client_create",
  "oauth_client_update",
  "oauth_client_delete",
  "oauth_client_rotate_secret",
  "oauth_client_test",
  "oauth_consent_revoke",
  "oauth_session_terminate",
  "webhook_failure_retry",
  "webhook_failure_delete",
  "sso_audit_export",
  "sso_audit_view",
  "user_export",
  "audit_log_export",
  "audit_log_view",
  "audit_log_detail_view",
  "audit_integrity_verify",
  "audit_retention_request",
  "audit_retention_execute",
  "audit_legal_hold_create",
  "audit_legal_hold_release",
  "message_sensitive_view",
  "user_detail_sensitive_view",
  "advisor_report_view",
  "application_detail_view",
  "application_list_view",
  "resume_download",
  "spent_receipt_view",
  "spent_proof_public_purge",
  "point_redemption_pii_view",
  "amap_config_view",
  "user_deleted",
  "user_password_reset",
  "user_identity_unbind",
  "user_status_change",
  "account_deletion_request",
  "account_deletion_cancel",
  "account_deletion_execute",
  "account_deletion_retry",
  "admin_approval_requested",
  "admin_approval_approved",
  "admin_approval_rejected",
  "admin_approval_cancelled",
  "admin_approval_expired",
  "admin_approval_retried",
  "admin_approval_executed",
  "admin_approval_execution_failed",
  "admin_approval_stale",
]);

const CONTENT_ACTIONS = new Set([
  "create_product",
  "update_product",
  "delete_product",
  "batch_product",
  "create_category",
  "update_category",
  "delete_category",
  "create_job",
  "update_job",
  "delete_job",
  "batch_job",
  "update_application",
  "delete_application",
  "create_application_folder",
  "update_application_folder",
  "delete_application_folder",
  "reorder_categories",
  "update_message",
  "delete_message",
  "batch_message",
  "create_coupon",
  "update_coupon",
  "delete_coupon",
  "batch_coupon",
]);

const CRITICAL_ACTIONS = new Set([
  "create_admin",
  "delete_admin",
  "update_admin",
  "break_glass_view",
  "oauth_client_delete",
  "oauth_client_rotate_secret",
  "import_spent_records",
  "undo_spent_import",
  "account_deletion_execute",
  "user_deleted",
  "audit_log_export",
  "user_export",
  "sso_audit_export",
  "audit_retention_execute",
  "admin_totp_recovery_issued",
  "admin_totp_recovery_used",
  "spent_proof_public_purge",
]);

const HIGH_ACTIONS = new Set([
  "delete_product",
  "batch_product",
  "delete_category",
  "delete_job",
  "batch_job",
  "delete_application",
  "delete_message",
  "batch_message",
  "delete_coupon",
  "batch_coupon",
  "refund_approve",
  "refund_reject",
  "user_points_adjust",
  "points_internal_redeem",
  "points_internal_refund",
  "submit_spent_adjustment",
  "approve_spent_adjustment",
  "reject_spent_adjustment",
  "undo_spent_adjustment",
  "point_redemption_cancel",
  "oauth_consent_revoke",
  "oauth_session_terminate",
  "device_force_logout",
  "user_password_reset",
  "user_identity_unbind",
  "user_status_change",
  "admin_totp_backup_regenerate",
  "webhook_failure_delete",
  "admin_approval_approved",
  "admin_approval_retried",
  "admin_approval_executed",
  "admin_approval_execution_failed",
  "admin_approval_stale",
]);

const MEDIUM_ACTIONS = new Set([
  "message_sensitive_view",
  "user_detail_sensitive_view",
  "advisor_report_view",
  "application_detail_view",
  "application_list_view",
  "resume_download",
  "spent_receipt_view",
  "point_redemption_pii_view",
  "amap_config_view",
  "audit_log_view",
  "audit_log_detail_view",
  "sso_audit_view",
  "audit_retention_request",
  "audit_legal_hold_create",
  "audit_legal_hold_release",
  "admin_login_failed",
  "admin_totp_failed",
  "step_up_failed",
  "refresh_token_reuse_detected",
  "webhook_failure_retry",
  "sso_audit_export",
  "admin_approval_requested",
  "admin_approval_rejected",
  "admin_approval_cancelled",
]);

const REASON_REQUIRED_ACTIONS = new Set([
  "delete_admin",
  "update_admin",
  "delete_product",
  "batch_product",
  "delete_category",
  "delete_job",
  "batch_job",
  "delete_application",
  "delete_message",
  "batch_message",
  "delete_coupon",
  "batch_coupon",
  "refund_approve",
  "refund_reject",
  "user_points_adjust",
  "points_internal_redeem",
  "points_internal_refund",
  "approve_spent_adjustment",
  "reject_spent_adjustment",
  "undo_spent_adjustment",
  "import_spent_records",
  "undo_spent_import",
  "point_redemption_cancel",
  "oauth_consent_revoke",
  "oauth_session_terminate",
  "device_force_logout",
  "user_password_reset",
  "user_identity_unbind",
  "user_status_change",
  "account_deletion_execute",
  "user_deleted",
  "break_glass_view",
  "audit_log_export",
  "sso_audit_export",
  "user_export",
  "audit_retention_execute",
  "audit_legal_hold_create",
  "audit_legal_hold_release",
  "webhook_failure_delete",
]);

export function getAuditActionMeta(action: string): AuditActionMeta {
  const label = AUDIT_ACTION_LABELS[action] ?? action;
  let category: AuditCategory = "system";
  if (AUTH_ACTIONS.has(action)) category = "auth";
  else if (FINANCE_ACTIONS.has(action)) category = "finance";
  else if (SECURITY_ACTIONS.has(action)) category = "security";
  else if (CONTENT_ACTIONS.has(action)) category = "content";
  else if (action.startsWith("user_") || action.startsWith("advisor_user")) category = "user";

  let riskLevel: AuditRiskLevel = "LOW";
  if (CRITICAL_ACTIONS.has(action)) riskLevel = "CRITICAL";
  else if (HIGH_ACTIONS.has(action)) riskLevel = "HIGH";
  else if (MEDIUM_ACTIONS.has(action)) riskLevel = "MEDIUM";

  let writeMode: AuditWriteMode = "best-effort";
  if (FINANCE_ACTIONS.has(action)) writeMode = "transactional";
  else if (riskLevel === "HIGH" || riskLevel === "CRITICAL") writeMode = "strict";

  return {
    category,
    riskLevel,
    writeMode,
    requiresReason: REASON_REQUIRED_ACTIONS.has(action),
    label,
  };
}

export function getAuditTargetLabel(targetType: string): string {
  return AUDIT_TARGET_TYPE_LABELS[targetType] ?? targetType;
}

export const AUDIT_RISK_LEVELS: AuditRiskLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
export const AUDIT_CATEGORIES: AuditCategory[] = [
  "auth",
  "user",
  "finance",
  "security",
  "content",
  "system",
];
