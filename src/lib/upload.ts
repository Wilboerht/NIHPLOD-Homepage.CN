import sharp from "sharp";
import { existsSync, mkdirSync, unlinkSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

// 上传配置
export const uploadConfig = {
  maxFileSize: 5 * 1024 * 1024, // 5MB
  allowedTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  uploadDir: "public/uploads",
  quality: 80, // WebP 质量
  maxWidth: 2000, // 最大宽度
  maxHeight: 2000, // 最大高度
};

// 上传结果类型
export interface UploadResult {
  url: string;
  filename: string;
  originalName: string;
  size: number;
  width: number;
  height: number;
  format: string;
}

// 验证文件类型
export function validateFileType(mimeType: string): boolean {
  return uploadConfig.allowedTypes.includes(mimeType);
}

// 验证文件大小
export function validateFileSize(size: number): boolean {
  return size <= uploadConfig.maxFileSize;
}

// 确保上传目录存在
function ensureUploadDir(folder: string = ""): string {
  const baseDir = join(process.cwd(), uploadConfig.uploadDir);
  const targetDir = folder ? join(baseDir, folder) : baseDir;

  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  return targetDir;
}

// 生成唯一文件名
function generateFilename(): string {
  const uuid = randomUUID();
  const timestamp = Date.now();
  return `${timestamp}-${uuid}.webp`;
}

// 处理并保存图片
export async function processAndSaveImage(
  buffer: Buffer,
  originalName: string,
  folder: string = "images"
): Promise<UploadResult> {
  const uploadDir = ensureUploadDir(folder);
  const filename = generateFilename();
  const filepath = join(uploadDir, filename);

  // 使用 sharp 处理图片
  const image = sharp(buffer);
  const metadata = await image.metadata();

  // 计算缩放尺寸
  let width = metadata.width || 0;
  let height = metadata.height || 0;

  if (width > uploadConfig.maxWidth) {
    height = Math.round((uploadConfig.maxWidth / width) * height);
    width = uploadConfig.maxWidth;
  }

  if (height > uploadConfig.maxHeight) {
    width = Math.round((uploadConfig.maxHeight / height) * width);
    height = uploadConfig.maxHeight;
  }

  // 处理图片：调整大小、转换格式、压缩
  const processedImage = await image
    .resize(width, height, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: uploadConfig.quality })
    .toBuffer();

  // 保存文件
  await sharp(processedImage).toFile(filepath);

  // 返回结果
  const url = `/uploads/${folder}/${filename}`;

  return {
    url,
    filename,
    originalName,
    size: processedImage.length,
    width,
    height,
    format: "webp",
  };
}

// 删除上传的文件
export function deleteUploadedFile(url: string): boolean {
  try {
    // 从 URL 提取路径
    const relativePath = url.replace(/^\//, "");
    const filepath = join(process.cwd(), "public", relativePath);

    if (existsSync(filepath)) {
      unlinkSync(filepath);
      return true;
    }

    return false;
  } catch (error) {
    console.error("删除文件失败:", error);
    return false;
  }
}

// 获取文件的 MIME 类型
export function getMimeType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop();
  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
  };
  return mimeTypes[ext || ""] || "application/octet-stream";
}

// 验证上传文件（服务端）
export function validateUploadServer(
  mimeType: string,
  size: number
): { valid: boolean; error?: string } {
  if (!validateFileType(mimeType)) {
    return {
      valid: false,
      error: `不支持的文件类型: ${mimeType}。支持的类型: ${uploadConfig.allowedTypes.join(", ")}`,
    };
  }

  if (!validateFileSize(size)) {
    const maxMB = uploadConfig.maxFileSize / (1024 * 1024);
    return {
      valid: false,
      error: `文件大小超过限制。最大允许: ${maxMB}MB`,
    };
  }

  return { valid: true };
}
