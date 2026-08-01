import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import {
  processAndSaveImage,
  uploadFile,
  validateUploadServer,
  validateFileBuffer,
  validateFolder,
} from "@/lib/upload";

// POST /api/upload - 上传图片
// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

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

    // folder 白名单校验
    const folderCheck = validateFolder(folder);
    if (!folderCheck.valid) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_FOLDER", message: folderCheck.error } },
        { status: 400 }
      );
    }

    if (!file) {
      return NextResponse.json(
        { success: false, error: { code: "NO_FILE", message: "请选择要上传的文件" } },
        { status: 400 }
      );
    }

    // 验证扩展名白名单
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const allowedExts = ["jpg", "jpeg", "png", "webp", "gif", "pdf"];
    if (!allowedExts.includes(ext)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_FILE_EXT", message: "不支持的文件扩展名" } },
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

    // 安全清理文件名：移除路径遍历字符，仅保留安全字符
    const safeName = file.name
      .replace(/\\/g, "/") // 统一分隔符
      .replace(/^.*[\\/]/, "") // 移除目录路径
      .replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, "_") // 仅保留安全字符
      .replace(/_{2,}/g, "_") // 压缩连续下划线
      .substring(0, 200); // 限制长度

    // PDF 无法通过 sharp 处理，走原样保存管线；图片走压缩处理管线
    const mimeType = file.type;
    const result =
      mimeType === "application/pdf"
        ? await uploadFile(buffer, safeName || "upload", mimeType, "files", ["application/pdf"])
        : await processAndSaveImage(buffer, safeName || "upload", folder);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    apiConsole.error("[Upload] 上传失败:", error);
    const isDev = process.env.NODE_ENV === "development";
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "UPLOAD_ERROR",
          message: isDev
            ? error instanceof Error
              ? error.message
              : "上传失败"
            : "上传失败，请稍后重试",
        },
      },
      { status: 500 }
    );
  }
}
