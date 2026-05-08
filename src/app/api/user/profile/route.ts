/**
 * 用户资料 API
 * GET /api/user/profile - 获取用户资料
 * PUT /api/user/profile - 更新用户资料
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";
import { z } from "zod";
import { processAndSaveImage, validateUploadServer, validateFileBuffer } from "@/lib/upload";

// 更新参数验证
const updateSchema = z.object({
  nickname: z.string().max(20).optional(),
  avatar: z.string().optional().or(z.literal("")), // 允许 URL、相对路径或 Base64
});

// GET - 获取用户资料
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // 验证用户身份
    const payload = await verifyUserAuth(request);

    if (!payload) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "请先登录",
          },
        },
        { status: 401 }
      );
    }

    // 获取用户资料
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        phone: true,
        nickname: true,
        avatar: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "USER_NOT_FOUND",
            message: "用户不存在",
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    console.error("[GetProfile] 异常:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "服务器错误",
        },
      },
      { status: 500 }
    );
  }
}

// PUT - 更新用户资料
export async function PUT(request: NextRequest) {
  try {
    // 验证用户身份
    const payload = await verifyUserAuth(request);

    if (!payload) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "请先登录",
          },
        },
        { status: 401 }
      );
    }

    const body = await request.json();

    // 参数验证
    const result = updateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_PARAMS",
            message: result.error.issues[0]?.message || "参数错误",
          },
        },
        { status: 400 }
      );
    }

    const { nickname, avatar } = result.data;

    // 更新用户资料
    const user = await prisma.user.update({
      where: { id: payload.id },
      data: {
        ...(nickname !== undefined && { nickname: nickname || null }),
        ...(avatar !== undefined && { avatar: avatar || null }),
      },
      select: {
        id: true,
        phone: true,
        nickname: true,
        avatar: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    console.error("[UpdateProfile] 异常:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "服务器错误",
        },
      },
      { status: 500 }
    );
  }
}

// POST - 上传头像 (直接存为本地文件或 OSS)
export async function POST(request: NextRequest) {
  try {
    // 1. 验证身份
    const payload = await verifyUserAuth(request);
    if (!payload) {
      return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } }, { status: 401 });
    }

    // 2. 获取上传文件
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: { code: "NO_FILE", message: "请选择要上传的头像" } }, { status: 400 });
    }

    // 3. 验证文件
    const validation = validateUploadServer(file.type, file.size);
    if (!validation.valid) {
      return NextResponse.json({ success: false, error: { code: "INVALID_FILE", message: validation.error } }, { status: 400 });
    }

    // 4. 读取内容并处理
    const buffer = Buffer.from(await file.arrayBuffer());

    // 4.1 通过 magic bytes 检测真实文件类型
    const fileTypeResult = await validateFileBuffer(buffer);
    if (!fileTypeResult.valid) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_FILE", message: fileTypeResult.error || "不支持的文件类型" } },
        { status: 400 }
      );
    }

    // 使用统一上传逻辑 (自动根据策略选择 OSS 或本地)
    const result = await processAndSaveImage(buffer, file.name, "avatars");

    // 5. 更新数据库中的头像链接
    await prisma.user.update({
      where: { id: payload.id },
      data: { avatar: result.url },
    });

    return NextResponse.json({
      success: true,
      data: {
        url: result.url,
      },
    });
  } catch (error) {
    console.error("[UploadAvatar] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "头像上传失败" } },
      { status: 500 }
    );
  }
}

