import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import {
  processAndSaveImage,
  validateUploadServer,
  uploadConfig,
} from "@/lib/upload";

// POST /api/upload - 上传图片
export async function POST(request: NextRequest) {
  console.log("[DEBUG API] 开始处理上传请求");

  try {
    // 验证认证
    console.log("[DEBUG API] 验证认证...");
    const admin = await verifyAuth(request);
    if (!admin) {
      console.log("[DEBUG API] 认证失败: 未授权");
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }
    console.log("[DEBUG API] 认证成功:", admin.email);

    // 获取表单数据
    console.log("[DEBUG API] 解析表单数据...");
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const folder = (formData.get("folder") as string) || "images";
    console.log("[DEBUG API] 表单数据:", { hasFile: !!file, folder });

    if (!file) {
      console.log("[DEBUG API] 错误: 没有文件");
      return NextResponse.json(
        { success: false, error: { code: "NO_FILE", message: "请选择要上传的文件" } },
        { status: 400 }
      );
    }

    console.log("[DEBUG API] 文件信息:", { name: file.name, size: file.size, type: file.type });

    // 验证文件
    console.log("[DEBUG API] 验证文件...");
    const validation = validateUploadServer(file.type, file.size);
    if (!validation.valid) {
      console.log("[DEBUG API] 文件验证失败:", validation.error);
      return NextResponse.json(
        { success: false, error: { code: "INVALID_FILE", message: validation.error } },
        { status: 400 }
      );
    }
    console.log("[DEBUG API] 文件验证通过");

    // 读取文件内容
    console.log("[DEBUG API] 读取文件内容...");
    const buffer = Buffer.from(await file.arrayBuffer());
    console.log("[DEBUG API] 文件内容读取完成, buffer大小:", buffer.length);

    // 处理并保存图片
    console.log("[DEBUG API] 处理并保存图片...");
    const result = await processAndSaveImage(buffer, file.name, folder);
    console.log("[DEBUG API] 图片处理完成:", result);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("[DEBUG API] 上传失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "UPLOAD_ERROR", message: "上传失败: " + (error instanceof Error ? error.message : String(error)) } },
      { status: 500 }
    );
  }
}

// GET /api/upload - 获取上传配置
export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      maxFileSize: uploadConfig.maxFileSize,
      allowedTypes: uploadConfig.allowedTypes,
      maxWidth: uploadConfig.maxWidth,
      maxHeight: uploadConfig.maxHeight,
    },
  });
}

