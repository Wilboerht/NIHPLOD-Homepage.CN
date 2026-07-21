/**
 * 用户资料 API
 * GET /api/user/profile - 获取用户资料
 * PUT /api/user/profile - 更新用户资料
 */
import { NextRequest, NextResponse } from "next/server";
import { unstable_cache, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth, withUserAuth } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { z } from "zod";
import { processAndSaveImage, validateUploadServer, validateFileBuffer } from "@/lib/upload";
import { apiConsole } from "@/lib/logger";

// 更新参数验证
const updateSchema = z.object({
  nickname: z.string().max(20).optional(),
  avatar: z
    .union([
      z
        .string()
        .url()
        .regex(/^https?:\/\//),
      z.literal(""),
    ])
    .optional(),
});

// 用户资料缓存标签（静态标签，资料更新时统一失效）
const USER_PROFILE_TAG = "user-profile";

/**
 * 获取用户资料（带 Next.js 服务端缓存）
 * 缓存 30 秒，用户资料更新时通过 revalidateTag 失效
 */
const getCachedUserProfile = unstable_cache(
  async (userId: string) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        nickname: true,
        avatar: true,
        createdAt: true,
        _count: { select: { orders: true, addresses: true } },
      },
    });

    if (!user) return null;

    return {
      id: user.id,
      phone: user.phone,
      nickname: user.nickname,
      avatar: user.avatar,
      createdAt: user.createdAt,
      stats: {
        orderCount: user._count.orders,
        addressCount: user._count.addresses,
      },
    };
  },
  ["user-profile"],
  { revalidate: 30, tags: [USER_PROFILE_TAG] }
);

// GET - 获取用户资料（含统计）
export const dynamic = "force-dynamic";

export const GET = withUserAuth(async (request: NextRequest, payload) => {
  try {
    const user = await getCachedUserProfile(payload.id);

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "USER_NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    apiConsole.error("[GetProfile] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

// PUT - 更新用户资料
export const PUT = withUserAuth(async (request: NextRequest, payload) => {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const body = await request.json();
    const result = updateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: result.error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }

    const { nickname, avatar } = result.data;
    const user = await prisma.user.update({
      where: { id: payload.id },
      data: {
        ...(nickname !== undefined && { nickname: nickname || null }),
        ...(avatar !== undefined && { avatar: avatar || null }),
      },
      select: { id: true, phone: true, nickname: true, avatar: true },
    });

    // 资料变更后失效缓存
    revalidateTag(USER_PROFILE_TAG, "max");

    return NextResponse.json({ success: true, data: { user } });
  } catch (error) {
    apiConsole.error("[UpdateProfile] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

// POST - 上传头像 (直接存为本地文件或 OSS)
export async function POST(request: NextRequest) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    // 1. 验证身份
    const payload = await verifyUserAuth(request);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    // 2. 获取上传文件
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: { code: "NO_FILE", message: "请选择要上传的头像" } },
        { status: 400 }
      );
    }

    // 3. 验证文件
    const validation = validateUploadServer(file.type, file.size);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_FILE", message: validation.error } },
        { status: 400 }
      );
    }

    // 4. 读取内容并处理
    const buffer = Buffer.from(await file.arrayBuffer());

    // 4.1 通过 magic bytes 检测真实文件类型
    const fileTypeResult = await validateFileBuffer(buffer);
    if (!fileTypeResult.valid) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_FILE", message: fileTypeResult.error || "不支持的文件类型" },
        },
        { status: 400 }
      );
    }

    // 安全清理文件名
    const safeName = file.name
      .replace(/\\/g, "/")
      .replace(/^.*[\\/]/, "")
      .replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, "_")
      .replace(/_{2,}/g, "_")
      .substring(0, 200);

    // 使用统一上传逻辑 (自动根据策略选择 OSS 或本地)
    const result = await processAndSaveImage(buffer, safeName || "avatar", "avatars");

    // 5. 更新数据库中的头像链接
    await prisma.user.update({
      where: { id: payload.id },
      data: { avatar: result.url },
    });

    // 头像变更后失效缓存
    revalidateTag("admin-stats", "max");

    return NextResponse.json({
      success: true,
      data: {
        url: result.url,
      },
    });
  } catch (error) {
    apiConsole.error("[UploadAvatar] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "头像上传失败" } },
      { status: 500 }
    );
  }
}
