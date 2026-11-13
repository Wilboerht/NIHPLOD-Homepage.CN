export interface ConcurrentIndexDefinition {
  name: string;
  table: string;
  columns: string;
  unique?: boolean;
  method?: "btree" | "gin";
  where?: string;
}

/**
 * Large-table index manifest.
 * Production applies these with scripts/apply-concurrent-indexes.ts one by one.
 * Prisma schema cannot express GIN/trgm or partial indexes, so this manifest is authoritative.
 */
export const concurrentIndexes: ConcurrentIndexDefinition[] = [
  // AuditLog trigram indexes are created offline by the partition migration.
  { name: "User_nickname_trgm", table: "User", columns: '"nickname" gin_trgm_ops', method: "gin" },
  {
    name: "JobApplication_name_trgm",
    table: "JobApplication",
    columns: '"name" gin_trgm_ops',
    method: "gin",
  },
  {
    name: "ContactMessage_content_trgm",
    table: "ContactMessage",
    columns: '"content" gin_trgm_ops',
    method: "gin",
  },
  {
    name: "PointRedemption_productName_trgm",
    table: "PointRedemption",
    columns: '"productName" gin_trgm_ops',
    method: "gin",
  },
  {
    name: "SpentAdjustmentApplication_orderNo_trgm",
    table: "SpentAdjustmentApplication",
    columns: '"orderNo" gin_trgm_ops',
    method: "gin",
  },
  { name: "Product_name_trgm", table: "Product", columns: '"name" gin_trgm_ops', method: "gin" },
  {
    name: "Product_nameEn_trgm",
    table: "Product",
    columns: '"nameEn" gin_trgm_ops',
    method: "gin",
  },
  { name: "Product_slug_trgm", table: "Product", columns: '"slug" gin_trgm_ops', method: "gin" },

  // 管理端列表/清理组合索引
  {
    name: "Admin_deletedAt_createdAt_idx",
    table: "Admin",
    columns: '"deletedAt", "createdAt" DESC',
  },
  {
    name: "AccountDeletionRequest_status_requestedAt_idx",
    table: "AccountDeletionRequest",
    columns: '"status", "requestedAt" DESC',
  },
  {
    name: "NotificationOutbox_status_updatedAt_idx",
    table: "NotificationOutbox",
    columns: '"status", "updatedAt"',
  },
  {
    name: "NotificationOutbox_createdAt_idx",
    table: "NotificationOutbox",
    columns: '"createdAt" DESC',
  },
  {
    name: "NotificationOutbox_status_createdAt_idx",
    table: "NotificationOutbox",
    columns: '"status", "createdAt" DESC',
  },
  {
    name: "RefreshToken_revokedAt_expiresAt_clientId_idx",
    table: "RefreshToken",
    columns: '"revokedAt", "expiresAt", "clientId"',
  },
  {
    name: "PointLedger_expiresAt_remaining_idx",
    table: "PointLedger",
    columns: '"expiresAt"',
    where: '"remaining" > 0',
  },
  {
    name: "PointLedger_type_createdAt_idx",
    table: "PointLedger",
    columns: '"type", "createdAt" DESC',
  },
  {
    name: "SpentImportRow_batchId_createdAt_idx",
    table: "SpentImportRow",
    columns: '"batchId", "createdAt"',
  },
  {
    name: "SpentImportRow_status_revertedAt_orderNoKey_idx",
    table: "SpentImportRow",
    columns: '"status", "revertedAt", "orderNoKey"',
  },
  {
    name: "AdminApprovalRequest_status_expiresAt_pending_idx",
    table: "AdminApprovalRequest",
    columns: '"status", "expiresAt"',
    where: "\"status\" = 'PENDING'",
  },
  {
    name: "JobApplication_folderId_status_createdAt_idx",
    table: "JobApplication",
    columns: '"folderId", "status", "createdAt" DESC',
  },
  { name: "AuditExportJob_createdAt_idx", table: "AuditExportJob", columns: '"createdAt" DESC' },
  {
    name: "AuditRetentionJob_createdAt_idx",
    table: "AuditRetentionJob",
    columns: '"createdAt" DESC',
  },
  { name: "User_createdAt_id_idx", table: "User", columns: '"createdAt" DESC, "id" ASC' },
  {
    name: "User_status_createdAt_id_idx",
    table: "User",
    columns: '"status", "createdAt" DESC, "id" ASC',
  },
];
