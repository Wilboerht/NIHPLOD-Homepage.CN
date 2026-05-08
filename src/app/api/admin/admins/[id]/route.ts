/**
 * 管理员删除 API
 * DELETE /api/admin/admins/:id
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withRole } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export const DELETE = withRole(["owner"], async (request, admin, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: { code: "BAD_REQUEST", message: "缺少管理员ID" } },
        { status: 400 }
      );
    }

    // 不能删除自己
    if (id === admin.id) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "不能删除当前登录账号" } },
        { status: 403 }
      );
    }

    // 不能删除最后一个 owner
    const target = await prisma.admin.findUnique({ where: { id } });
    if (target?.role === "owner") {
      const ownerCount = await prisma.admin.count({ where: { role: "owner" } });
      if (ownerCount <= 1) {
        return NextResponse.json(
          { success: false, error: { code: "LAST_OWNER", message: "不能删除最后一个 owner 账号" } },
          { status: 403 }
        );
      }
    }

    await prisma.admin.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[AdminAdmins] DELETE 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});
