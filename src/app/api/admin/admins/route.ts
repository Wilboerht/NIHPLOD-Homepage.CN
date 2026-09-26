/**
 * 管理员管理 API
 * GET /api/admin/admins - 列表
 * POST /api/admin/admins - 创建
 * PUT /api/admin/admins - 更新
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, checkAdminRateLimit } from "@/lib/auth";
import {
  ADMIN_PERMISSIONS,
  ADMIN_ROLES,
  ROLE_TEMPLATES,
  canDelegateRoleAndOverrides,
  hasAdminPermission,
  resolveAdminPermissions,
  sanitizePermissionOverrides,
  type AdminRoleValue,
} from "@/lib/admin-permissions";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { hashPassword, passwordSchema } from "@/lib/password";
import { createAuditLog } from "@/lib/audit";
import { blacklistAdminTokens } from "@/lib/token-blacklist";
import { deleteAdminsSafely } from "@/lib/admin-safety";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";

const roleSchema = z.enum(ADMIN_ROLES);

/** PUT 事务内的守卫错误（映射为对应 HTTP 状态，而非 500） */
class AdminUpdateError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "AdminUpdateError";
  }
}

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: passwordSchema,
  role: roleSchema,
  // 个人权限覆盖（追加授权 / "!权限点" 撤销），服务端会过滤未知权限点
  permissions: z.array(z.string().max(60)).max(100).optional(),
});

const batchSchema = z.object({
  ids: z.array(z.string().cuid()).min(1).max(100),
  action: z.enum(["delete"]),
});

const updateSchema = z.object({
  id: z.string().cuid(),
  email: z.string().email().optional(),
  name: z.string().min(1).optional(),
  role: roleSchema.optional(),
  password: passwordSchema.optional(),
  permissions: z.array(z.string().max(60)).max(100).optional(),
});

const querySchema = z.object({
  page: z.preprocess((val) => (val ? Number(val) : 1), z.number().min(1).max(1000)),
  pageSize: z.preprocess((val) => (val ? Number(val) : 20), z.number().min(1).max(100)),
  search: z.string().max(100).nullish(),
});

export const dynamic = "force-dynamic";

// GET - 列表
export const GET = withAuth(async (request, admin) => {
  try {
    if (!hasAdminPermission(admin, "admins:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：管理员查看" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "admin-read");
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(request.url);
    const params = querySchema.parse({
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
      search: searchParams.get("search"),
    });

    const where: Record<string, unknown> = { deletedAt: null };
    if (params.search) {
      where.OR = [
        { email: { contains: params.search, mode: "insensitive" } },
        { name: { contains: params.search, mode: "insensitive" } },
      ];
    }

    const [admins, total] = await Promise.all([
      prisma.admin.findMany({
        where,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          permissions: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.admin.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        admins: admins.map((a) => ({
          ...a,
          createdAt: a.createdAt.toISOString(),
          updatedAt: a.updatedAt.toISOString(),
        })),
        pagination: {
          page: params.page,
          pageSize: params.pageSize,
          total,
          totalPages: Math.ceil(total / params.pageSize),
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "参数错误", details: error.issues } },
        { status: 400 }
      );
    }
    apiConsole.error("[AdminAdmins] GET 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

// POST - 创建 / 批量操作
export const POST = withAuth(async (request, admin) => {
  try {
    if (!hasAdminPermission(admin, "admins:write")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：管理员管理" } },
        { status: 403 }
      );
    }

    if (!validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();

    // 批量操作
    if (body.ids && body.action) {
      const batch = batchSchema.parse(body);
      if (batch.action === "delete") {
        // 委派边界 + owner 保护 + 最后 owner 原子保护统一在 deleteAdminsSafely 内完成
        const result = await deleteAdminsSafely({
          actorId: admin.id,
          actorRole: admin.role,
          actorOverrides: admin.permissionOverrides ?? [],
          targetIds: batch.ids,
        });
        if (!result.ok) {
          return NextResponse.json(
            { success: false, error: { code: result.code, message: result.message } },
            { status: result.status }
          );
        }

        // 吊销所有被删除管理员的 token（await + 捕获，避免未处理 rejection）
        for (const target of result.deleted) {
          await blacklistAdminTokens(target.id, "admin_deleted").catch((err) =>
            apiConsole.warn(`[AdminAdmins] 吊销管理员 ${target.id} token 失败:`, err)
          );
        }

        await createAuditLog({
          action: "delete_admin",
          targetType: "admin",
          detail: { ids: result.deleted.map((t) => t.id), count: result.deleted.length },
          adminId: admin.id,
          request,
        });

        return NextResponse.json({
          success: true,
          data: {
            message: `已删除 ${result.deleted.length} 名管理员${
              result.selfSkipped > 0 ? `，${result.selfSkipped} 名跳过（含自身）` : ""
            }`,
          },
        });
      }
    }

    // 创建单个管理员
    const data = createSchema.parse(body);

    const permissionOverrides = sanitizePermissionOverrides(data.permissions);

    // 仅 owner 可创建 owner 账号（防委派管理员提权）
    if (data.role === "owner" && admin.role !== "owner") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可创建 owner 账号" } },
        { status: 403 }
      );
    }

    // 委派边界：不能授予超出自身权限范围的角色或追加授权（防二级提权）
    if (!canDelegateRoleAndOverrides(admin, data.role, permissionOverrides)) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "FORBIDDEN", message: "不能授予超出自身权限范围的角色或权限" },
        },
        { status: 403 }
      );
    }

    const existing = await prisma.admin.findFirst({
      where: { email: data.email, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: "DUPLICATE_EMAIL", message: "该邮箱已被使用" } },
        { status: 409 }
      );
    }

    const hashedPassword = await hashPassword(data.password);
    const newAdmin = await prisma.admin.create({
      data: {
        email: data.email,
        name: data.name,
        password: hashedPassword,
        role: data.role,
        permissions: permissionOverrides,
      },
      select: { id: true, email: true, name: true, role: true, permissions: true, createdAt: true },
    });

    // 记录审计日志
    await createAuditLog({
      action: "create_admin",
      targetType: "admin",
      targetId: newAdmin.id,
      detail: {
        email: newAdmin.email,
        name: newAdmin.name,
        role: newAdmin.role,
        permissionOverrides,
      },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({ success: true, data: newAdmin });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "参数错误", details: error.issues } },
        { status: 400 }
      );
    }
    // 并发创建同邮箱：唯一约束冲突映射为 409，而非 500
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { success: false, error: { code: "DUPLICATE_EMAIL", message: "该邮箱已被使用" } },
        { status: 409 }
      );
    }
    apiConsole.error("[AdminAdmins] POST 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

// PUT - 更新
export const PUT = withAuth(async (request, admin) => {
  try {
    if (!hasAdminPermission(admin, "admins:write")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：管理员管理" } },
        { status: 403 }
      );
    }

    if (!validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const data = updateSchema.parse(body);

    // 自锁保护：不允许通过本接口修改自己的角色/密码/权限（防最后 owner 自降级或误删权限导致锁死）
    if (
      data.id === admin.id &&
      (data.role !== undefined || data.password !== undefined || data.permissions !== undefined)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "SELF_ROLE_PASSWORD_FORBIDDEN",
            message: "不能在本页修改自己的角色/权限或密码，请前往「安全设置」修改密码",
          },
        },
        { status: 400 }
      );
    }

    // 凭证类变更收归 owner：非 owner 不得修改他人密码/邮箱（防委派管理员接管高权限账号）
    if (admin.role !== "owner" && (data.password !== undefined || data.email !== undefined)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "仅超级管理员可修改其他管理员的密码或邮箱",
          },
        },
        { status: 403 }
      );
    }

    // 目标管理员必须存在且未删除（避免 update 抛 P2025 变成 500）
    const targetAdmin = await prisma.admin.findUnique({
      where: { id: data.id, deletedAt: null },
      select: { id: true, role: true, permissions: true },
    });
    if (!targetAdmin) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "管理员不存在" } },
        { status: 404 }
      );
    }

    // owner 账号保护：仅 owner 可修改 owner 账号，或将成员提升为 owner
    if ((targetAdmin.role === "owner" || data.role === "owner") && admin.role !== "owner") {
      return NextResponse.json(
        {
          success: false,
          error: { code: "FORBIDDEN", message: "仅超级管理员可修改 owner 账号或提升为 owner" },
        },
        { status: 403 }
      );
    }

    // 最后一名 owner 保护：将 owner 降级为任意非 owner 角色前必须确认还有其他 owner
    if (targetAdmin.role === "owner" && data.role !== undefined && data.role !== "owner") {
      const ownerCount = await prisma.admin.count({
        where: { role: "owner", deletedAt: null },
      });
      if (ownerCount <= 1) {
        return NextResponse.json(
          { success: false, error: { code: "LAST_OWNER", message: "不能降级最后一个 owner 账号" } },
          { status: 409 }
        );
      }
    }

    const permissionOverrides =
      data.permissions !== undefined ? sanitizePermissionOverrides(data.permissions) : undefined;

    // 委派边界（精确）：角色变更时校验目标模板；追加授权只校验"新增"部分，
    // 既有授权（可能由 owner 授予）允许保留，避免委派管理员连改名都被拒。
    if (
      admin.role !== "owner" &&
      (data.role !== undefined || permissionOverrides !== undefined)
    ) {
      const actorPerms = new Set<string>(
        resolveAdminPermissions(admin.role, admin.permissionOverrides)
      );
      if (data.role !== undefined && data.role !== targetAdmin.role) {
        const template =
          data.role === "owner"
            ? ADMIN_PERMISSIONS
            : (ROLE_TEMPLATES[data.role as Exclude<AdminRoleValue, "owner">] ?? []);
        if (![...template].every((p) => actorPerms.has(p))) {
          return NextResponse.json(
            {
              success: false,
              error: { code: "FORBIDDEN", message: "不能授予超出自身权限范围的角色" },
            },
            { status: 403 }
          );
        }
      }
      if (permissionOverrides !== undefined) {
        const currentOverrides = new Set(targetAdmin.permissions ?? []);
        const hasOutOfScopeGrant = permissionOverrides.some(
          (entry) =>
            !entry.startsWith("!") && !currentOverrides.has(entry) && !actorPerms.has(entry)
        );
        if (hasOutOfScopeGrant) {
          return NextResponse.json(
            {
              success: false,
              error: { code: "FORBIDDEN", message: "不能授予超出自身权限范围的权限" },
            },
            { status: 403 }
          );
        }
      }
    }

    // 检查邮箱唯一性（排除自身和已删除）
    if (data.email) {
      const existing = await prisma.admin.findFirst({
        where: { email: data.email, id: { not: data.id }, deletedAt: null },
        select: { id: true },
      });
      if (existing) {
        return NextResponse.json(
          { success: false, error: { code: "DUPLICATE_EMAIL", message: "该邮箱已被使用" } },
          { status: 409 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.email) updateData.email = data.email;
    if (data.name) updateData.name = data.name;
    if (data.role) updateData.role = data.role;
    if (data.password) updateData.password = await hashPassword(data.password);
    if (permissionOverrides !== undefined) updateData.permissions = permissionOverrides;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "NO_CHANGES", message: "没有需要更新的字段" } },
        { status: 400 }
      );
    }

    // owner 降级在事务内加 advisory lock 二次校验，避免并发降级不同 owner 导致零 owner
    // （与 admin-safety.ts 的删除路径使用同一锁名）
    const demotingOwner = targetAdmin.role === "owner" && data.role !== undefined && data.role !== "owner";
    const updatedAdmin = await prisma.$transaction(async (tx) => {
      if (demotingOwner) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('nihplod_admin_owner_guard'))`;
        const [current, ownerCount] = await Promise.all([
          tx.admin.findUnique({ where: { id: data.id, deletedAt: null }, select: { role: true } }),
          tx.admin.count({ where: { role: "owner", deletedAt: null } }),
        ]);
        if (!current) {
          throw new AdminUpdateError("NOT_FOUND", "管理员不存在", 404);
        }
        if (current.role === "owner" && ownerCount <= 1) {
          throw new AdminUpdateError("LAST_OWNER", "不能降级最后一个 owner 账号", 409);
        }
      }
      return tx.admin.update({
        where: { id: data.id, deletedAt: null },
        data: updateData,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          permissions: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });

    // 角色或密码变更：撤销该管理员全部会话，避免旧凭证继续有效
    const roleChanged = data.role !== undefined && data.role !== targetAdmin.role;
    if (roleChanged || data.password) {
      await blacklistAdminTokens(
        updatedAdmin.id,
        roleChanged ? "admin_role_changed" : "admin_password_changed"
      );
    }

    // 记录审计日志（含角色前后值，密码只记录是否变更）
    await createAuditLog({
      action: "update_admin",
      targetType: "admin",
      targetId: updatedAdmin.id,
      detail: {
        updatedFields: Object.keys(updateData).filter((k) => k !== "password"),
        roleBefore: targetAdmin.role,
        roleAfter: updatedAdmin.role,
        permissionsChanged: permissionOverrides !== undefined,
        permissionOverrides: permissionOverrides ?? null,
        passwordChanged: Boolean(data.password),
        tokensRevoked: roleChanged || Boolean(data.password),
      },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({ success: true, data: updatedAdmin });
  } catch (error) {
    if (error instanceof AdminUpdateError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.status }
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "参数错误", details: error.issues } },
        { status: 400 }
      );
    }
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { success: false, error: { code: "DUPLICATE_EMAIL", message: "该邮箱已被使用" } },
        { status: 409 }
      );
    }
    if ((error as { code?: string }).code === "P2025") {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "管理员不存在" } },
        { status: 404 }
      );
    }
    apiConsole.error("[AdminAdmins] PUT 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});
