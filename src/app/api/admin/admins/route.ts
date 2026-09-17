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
  ADMIN_ROLES,
  hasAdminPermission,
  sanitizePermissionOverrides,
} from "@/lib/admin-permissions";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { hashPassword, passwordSchema } from "@/lib/password";
import { createAuditLog } from "@/lib/audit";
import { blacklistAdminTokens } from "@/lib/token-blacklist";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";

const roleSchema = z.enum(ADMIN_ROLES);

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: passwordSchema,
  role: roleSchema,
  // 个人权限覆盖（追加授权 / "!权限点" 撤销），服务端会过滤未知权限点
  permissions: z.array(z.string().max(60)).max(100).optional(),
});

const batchSchema = z.object({
  ids: z.array(z.string().cuid()),
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
  page: z.preprocess((val) => (val ? Number(val) : 1), z.number().min(1)),
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
        // 不允许删除自己
        const idsToDelete = batch.ids.filter((id) => id !== admin.id);
        if (idsToDelete.length === 0) {
          return NextResponse.json(
            { success: false, error: { code: "SELF_DELETE", message: "不能删除自己的账号" } },
            { status: 400 }
          );
        }

        // owner 账号保护（纵深防御）：仅 owner 可删除 owner，且不得删除全部 owner
        const targets = await prisma.admin.findMany({
          where: { id: { in: idsToDelete }, deletedAt: null },
          select: { id: true, role: true },
        });
        const ownerTargets = targets.filter((t) => t.role === "owner");
        if (ownerTargets.length > 0) {
          if (admin.role !== "owner") {
            return NextResponse.json(
              {
                success: false,
                error: { code: "FORBIDDEN", message: "仅超级管理员可删除 owner 账号" },
              },
              { status: 403 }
            );
          }
          const ownerCount = await prisma.admin.count({
            where: { role: "owner", deletedAt: null },
          });
          if (ownerTargets.length >= ownerCount) {
            return NextResponse.json(
              { success: false, error: { code: "LAST_OWNER", message: "不能删除全部 owner 账号" } },
              { status: 409 }
            );
          }
        }

        await prisma.admin.updateMany({
          where: { id: { in: idsToDelete } },
          data: { deletedAt: new Date(), status: "DISABLED" },
        });

        // 吊销所有被删除管理员的 token
        for (const id of idsToDelete) {
          blacklistAdminTokens(id, "admin_deleted");
        }

        await createAuditLog({
          action: "delete_admin",
          targetType: "admin",
          detail: { ids: idsToDelete, count: idsToDelete.length },
          adminId: admin.id,
          request,
        });

        const skipped = batch.ids.length - idsToDelete.length;
        return NextResponse.json({
          success: true,
          data: {
            message: `已删除 ${idsToDelete.length} 名管理员${skipped > 0 ? `，${skipped} 名跳过（含自身）` : ""}`,
          },
        });
      }
    }

    // 创建单个管理员
    const data = createSchema.parse(body);

    // 仅 owner 可创建 owner 账号（防委派管理员提权）
    if (data.role === "owner" && admin.role !== "owner") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可创建 owner 账号" } },
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
    const permissionOverrides = sanitizePermissionOverrides(data.permissions);
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

    // 目标管理员必须存在且未删除（避免 update 抛 P2025 变成 500）
    const targetAdmin = await prisma.admin.findUnique({
      where: { id: data.id, deletedAt: null },
      select: { id: true, role: true },
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

    // 最后一名 owner 保护：将 owner 降级为 admin 前必须确认还有其他 owner
    if (data.role === "admin" && targetAdmin.role === "owner") {
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
    const permissionOverrides =
      data.permissions !== undefined ? sanitizePermissionOverrides(data.permissions) : undefined;
    if (permissionOverrides !== undefined) updateData.permissions = permissionOverrides;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "NO_CHANGES", message: "没有需要更新的字段" } },
        { status: 400 }
      );
    }

    const updatedAdmin = await prisma.admin.update({
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
    apiConsole.error("[AdminAdmins] PUT 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});
