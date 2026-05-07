import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import {
  processAndSaveImage,
  validateUploadServer,
  validateFileBuffer,
} from "@/lib/upload";

// POST /api/upload - 上传图片
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // 验证认证
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    // 获取表单数据
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const folder = (formData.get("folder") as string) || "images";

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

    // 读取文件内容
    const buffer = Buffer.from(await file.arrayBuffer());

    // 检测真实文件类型（防止 MIME 伪造）
    const typeCheck = await validateFileBuffer(buffer);
    if (!typeCheck.valid) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_FILE_TYPE", message: typeCheck.error } },
        { status: 400 }
      );
    }

    // 处理并保存图片
    const result = await processAndSaveImage(buffer, file.name, folder);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("[Upload] 上传失败:", error);
    const isDev = process.env.NODE_ENV === "development";
    return NextResponse.json(
      { success: false, error: { code: "UPLOAD_ERROR", message: isDev ? (error instanceof Error ? error.message : "上传失败") : "上传失败，请稍后重试" } },
      { status: 500 }
    );
  }
}
