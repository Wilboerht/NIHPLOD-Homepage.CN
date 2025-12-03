import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { processAndSaveImage, validateUploadServer } from "@/lib/upload";

// GET /api/admin/media - 获取媒体列表
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "24");
    const type = searchParams.get("type"); // image, video, etc.
    const search = searchParams.get("search");

    // 构建查询条件
    const where: Record<string, unknown> = {};

    if (type && type !== "all") {
      where.type = { startsWith: type };
    }

    if (search) {
      where.OR = [
        { filename: { contains: search, mode: "insensitive" } },
        { alt: { contains: search, mode: "insensitive" } },
      ];
    }

    // 查询总数
    const total = await prisma.media.count({ where });

    // 查询列表
    const items = await prisma.media.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return NextResponse.json({
      success: true,
      data: {
        items: items.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
        })),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    console.error("获取媒体列表失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取媒体列表失败" } },
      { status: 500 }
    );
  }
}

// POST /api/admin/media - 上传媒体文件
export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const folder = (formData.get("folder") as string) || "media";
    const alt = (formData.get("alt") as string) || "";

    if (!file) {
      return NextResponse.json(
        { success: false, error: { code: "NO_FILE", message: "请选择要上传的文件" } },
        { status: 400 }
      );
    }

    // 验证文件
    const validation = validateUploadServer(file.type, file.size);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_FILE", message: validation.error } },
        { status: 400 }
      );
    }

    // 处理并保存图片
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await processAndSaveImage(buffer, file.name, folder);

    // 保存到数据库
    const media = await prisma.media.create({
      data: {
        filename: result.originalName,
        url: result.url,
        type: file.type,
        size: result.size,
        width: result.width,
        height: result.height,
        alt: alt || null,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...media,
        createdAt: media.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("上传媒体失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "上传媒体失败" } },
      { status: 500 }
    );
  }
}

