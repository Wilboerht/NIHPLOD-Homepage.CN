/**
 * 管理员管理 API
 * GET /api/admin/admins - 列表
 * POST /api/admin/admins - 创建
 * PUT /api/admin/admins - 更新
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withRole } from "@/lib/auth";
import { hashPassword, passwordSchema } from "@/lib/password";
import { z } from "zod";

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: passwordSchema,
  role: z.enum(["owner", "admin"]),
});

const updateSchema = z.object({
  id: z.string(),
  email: z.string().email().optional(),
  name: z.string().min(1).optional(),
  role: z.enum(["owner", "admin"]).optional(),
  password: z.string().min(6).optional(),
});

const querySchema = z.object({
  page: z.preprocess((val) => (val ? Number(val) : 1), z.number().min(1)),
  pageSize: z.preprocess((val) => (val ? Number(val) : 20), z.number().min(1).max(100)),
  search: z.string().nullish(),
});

export const dynamic = 'force-dynamic';

// GET - 列表
export const GET = withRole(["owner"], async (request) => {
  try {
    const { searchParams } = new URL(request.url);
    const params = querySchema.parse({
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
      search: searchParams.get("search"),
    });

    const where: Record<string, unknown> = {};
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
        select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true },
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
    console.error("[AdminAdmins] GET 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

// POST - 创建
export const POST = withRole(["owner"], async (request) => {
  try {
    const body = await request.json();
    const data = createSchema.parse(body);

    const existing = await prisma.admin.findUnique({ where: { email: data.email } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: "DUPLICATE_EMAIL", message: "该邮箱已被使用" } },
        { status: 409 }
      );
    }

    const hashedPassword = await hashPassword(data.password);
    const admin = await prisma.admin.create({
      data: {
        email: data.email,
        name: data.name,
        password: hashedPassword,
        role: data.role,
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    return NextResponse.json({ success: true, data: admin });
  } catch (error) {
    console.error("[AdminAdmins] POST 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

// PUT - 更新
export const PUT = withRole(["owner"], async (request) => {
  try {
    const body = await request.json();
    const data = updateSchema.parse(body);

    // 检查邮箱唯一性（排除自身）
    if (data.email) {
      const existing = await prisma.admin.findFirst({
        where: { email: data.email, id: { not: data.id } },
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

    const admin = await prisma.admin.update({
      where: { id: data.id },
      data: updateData,
      select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json({ success: true, data: admin });
  } catch (error) {
    console.error("[AdminAdmins] PUT 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});
