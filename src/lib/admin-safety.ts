/**
 * 管理员账号删除安全策略（共享）
 *
 * 收紧两类风险：
 * 1. 二级提权：持 `admins:write` 的委派管理员删除更高权限账号 → 要求目标有效权限
 *    必须是操作者有效权限的子集（owner 不受限，但仍受"仅 owner 可删 owner"约束）。
 * 2. 最后 owner 保护 TOCTOU：并发删除多个 owner 可能各自通过 count 检查 → 用
 *    PostgreSQL advisory lock 串行化整个判定 + 删除流程。
 */
import prisma from "@/lib/prisma";
import {
  resolveAdminPermissions,
  type AdminRoleValue,
} from "@/lib/admin-permissions";

export interface DeletedAdminSummary {
  id: string;
  email: string;
  name: string;
  role: AdminRoleValue;
}

export type DeleteAdminsResult =
  | { ok: true; deleted: DeletedAdminSummary[]; selfSkipped: number }
  | { ok: false; code: string; message: string; status: number };

/**
 * 安全删除管理员（软删除）。调用方需已完成 `admins:write` 权限与 CSRF/限流校验。
 *
 * - 自动跳过操作者自身（返回 selfSkipped）
 * - 非 owner 操作者：目标有效权限必须 ⊆ 操作者有效权限
 * - owner 目标：仅 owner 可删，且不得删除全部 owner（advisory lock 串行化）
 * - 目标不存在/已删除：返回 NOT_FOUND
 */
export async function deleteAdminsSafely(params: {
  actorId: string;
  actorRole: AdminRoleValue;
  actorOverrides: string[];
  targetIds: string[];
}): Promise<DeleteAdminsResult> {
  const ids = params.targetIds.filter((id) => id !== params.actorId);
  const selfSkipped = params.targetIds.length - ids.length;

  if (ids.length === 0) {
    return { ok: false, code: "SELF_DELETE", message: "不能删除自己的账号", status: 400 };
  }

  const actorPerms = new Set<string>(
    resolveAdminPermissions(params.actorRole, params.actorOverrides)
  );
  const isOwnerActor = params.actorRole === "owner";

  return prisma.$transaction(async (tx) => {
    // 串行化 owner 保护判定与删除，避免并发删光所有 owner
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('nihplod_admin_owner_guard'))`;

    const targets = await tx.admin.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, email: true, name: true, role: true, permissions: true },
    });

    if (targets.length === 0) {
      return { ok: false, code: "NOT_FOUND", message: "管理员不存在", status: 404 };
    }

    const ownerTargets = targets.filter((t) => t.role === "owner");
    if (ownerTargets.length > 0 && !isOwnerActor) {
      return {
        ok: false,
        code: "FORBIDDEN",
        message: "仅超级管理员可删除 owner 账号",
        status: 403,
      };
    }

    if (!isOwnerActor) {
      // 委派边界：不能删除权限高于自身的账号（目标有效权限含操作者没有的权限即拒绝）
      for (const target of targets) {
        const targetPerms = resolveAdminPermissions(target.role, target.permissions ?? []);
        if (!targetPerms.every((p) => actorPerms.has(p))) {
          return {
            ok: false,
            code: "FORBIDDEN",
            message: "不能删除权限高于自身的管理员",
            status: 403,
          };
        }
      }
    }

    if (ownerTargets.length > 0) {
      const ownerCount = await tx.admin.count({ where: { role: "owner", deletedAt: null } });
      if (ownerTargets.length >= ownerCount) {
        return {
          ok: false,
          code: "LAST_OWNER",
          message: "不能删除全部 owner 账号",
          status: 409,
        };
      }
    }

    await tx.admin.updateMany({
      where: { id: { in: targets.map((t) => t.id) } },
      data: { deletedAt: new Date(), status: "DISABLED" },
    });

    return {
      ok: true,
      deleted: targets.map((t) => ({
        id: t.id,
        email: t.email,
        name: t.name,
        role: t.role as AdminRoleValue,
      })),
      selfSkipped,
    };
  });
}
