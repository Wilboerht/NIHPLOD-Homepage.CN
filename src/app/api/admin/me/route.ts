import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { hashPassword, passwordSchema } from "@/lib/password";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { z } from "zod";

// GET /api/admin/me - 获取当前登录的管理员信息
// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export const GET = withAuth(async (request: NextRequest, admin) => {
  try {
    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
        },
      },
    });
  } catch (error) {
    apiConsole.error("获取用户信息失败:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "获取用户信息失败",
        },
      },
      { status: 500 }
    );
  }
});

const updateMeSchema = z
  .object({
    name: z.string().min(1).max(50).optional(),
    currentPassword: z.string().optional(),
    newPassword: passwordSchema.optional(),
  })
  .refine((data) => !data.newPassword || data.currentPassword, {
    message: "修改密码需要提供当前密码",
    path: ["currentPassword"],
  });

// PUT /api/admin/me - 更新当前管理员个人资料
export const PUT = withAuth(async (request: NextRequest, admin) => {
  try {
    if (!validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const data = updateMeSchema.parse(body);

    const updateData: Record<string, unknown> = {};

    if (data.name) {
      updateData.name = data.name;
    }

    if (data.newPassword && data.currentPassword) {
      const adminRecord = await prisma.admin.findUnique({
        where: { id: admin.id },
        select: { password: true },
      });
      if (!adminRecord) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "账号不存在" } },
          { status: 404 }
        );
      }
      const bcrypt = await import("bcryptjs");
      const valid = await bcrypt.compare(data.currentPassword, adminRecord.password);
      if (!valid) {
        return NextResponse.json(
          { success: false, error: { code: "INVALID_PASSWORD", message: "当前密码错误" } },
          { status: 400 }
        );
      }
      updateData.password = await hashPassword(data.newPassword);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "NO_CHANGES", message: "没有需要更新的字段" } },
        { status: 400 }
      );
    }

    const updatedAdmin = await prisma.admin.update({
      where: { id: admin.id },
      data: updateData,
      select: { id: true, email: true, name: true, role: true },
    });

    createAuditLog({
      action: "update_admin",
      targetType: "admin",
      targetId: admin.id,
      detail: { updatedFields: Object.keys(updateData).filter((k) => k !== "password") },
      adminId: admin.id,
      request,
    }).catch(() => {});

    return NextResponse.json({ success: true, data: updatedAdmin });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }
    apiConsole.error("更新管理员信息失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "更新失败" } },
      { status: 500 }
    );
  }
});
