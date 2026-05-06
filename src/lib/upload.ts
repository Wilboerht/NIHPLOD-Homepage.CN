import sharp from "sharp";
import { existsSync, mkdirSync, unlinkSync } from "fs";
import { join, resolve } from "path";
import { randomUUID } from "crypto";
import { uploadToStorage, deleteFromStorage, extractStoragePath } from "./supabase";
import { 
  isOSSConfigured, 
  uploadToOSS, 
  deleteOSSFiles,
  getOSSPublicDomain 
} from "./ali-oss";

/**
 * 智能存储模式检测 (优先级: OSS > Local > Supabase)
 * 允许通过环境变量强制指定，否则采用自动降级策略
 */
function getAutoStorageMode(): "oss" | "local" | "supabase" {
  // 如果手动指定了模式，优先遵循
  if (process.env.STORAGE_MODE) {
    return process.env.STORAGE_MODE as "oss" | "local" | "supabase";
  }

  // 1. 优先检查 OSS
  if (isOSSConfigured()) {
    return "oss";
  }

  // 2. 云服务器环境下，通常优先本地存储 (如果为了脱离 Supabase)
  // 这里设为默认 fallback 到 local，除非明确需要 supabase
  return "local";
}

export const storageMode = getAutoStorageMode();

// 上传配置
export const uploadConfig = {
  maxFileSize: 10 * 1024 * 1024, // 10MB (支持 PDF)
  allowedTypes: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf", // 支持 PDF
  ],
  uploadDir: "public/uploads",
  quality: 80, // WebP 质量
  maxWidth: 2000, // 最大宽度
  maxHeight: 2000, // 最大高度
};

// 图片尺寸配置
export const imageSizes = {
  thumbnail: { width: 400, height: 400, quality: 80 },   // 缩略图
  small: { width: 640, height: 640, quality: 80 },       // 小图
  medium: { width: 1024, height: 1024, quality: 80 },    // 中图
  large: { width: 1920, height: 1920, quality: 85 },     // 大图
  og: { width: 1200, height: 630, quality: 85 },         // OG 分享图
} as const;

export type ImageSizeKey = keyof typeof imageSizes;

// 上传结果类型
export interface UploadResult {
  url: string;
  filename: string;
  originalName: string;
  size: number;
  width: number;
  height: number;
  format: string;
  blurDataURL?: string; // Base64 模糊占位符
  thumbnailUrl?: string; // 缩略图 URL
}

// 验证文件类型
export function validateFileType(mimeType: string): boolean {
  return uploadConfig.allowedTypes.includes(mimeType);
}

// 验证文件大小
export function validateFileSize(size: number): boolean {
  return size <= uploadConfig.maxFileSize;
}

// 路径净化：只允许字母、数字、下划线、连字符和单层路径
function sanitizeFolder(folder: string): string {
  return folder.replace(/[^a-zA-Z0-9_\-/]/g, "").replace(/\.\./g, "");
}

// 确保上传目录存在
function ensureUploadDir(folder: string = ""): string {
  const baseDir = join(process.cwd(), uploadConfig.uploadDir);
  const sanitized = sanitizeFolder(folder);
  const targetDir = sanitized ? join(baseDir, sanitized) : baseDir;

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

// ============================================
// 图片处理核心函数
// ============================================

/**
 * 生成模糊占位符 (Base64 Data URL)
 * 用于 Next.js Image 组件的 blurDataURL
 */
export async function generateBlurDataURL(buffer: Buffer): Promise<string> {
  const blurBuffer = await sharp(buffer)
    .resize(10, 10, { fit: "inside" })
    .blur(2)
    .webp({ quality: 20 })
    .toBuffer();

  return `data:image/webp;base64,${blurBuffer.toString("base64")}`;
}

/**
 * 生成指定尺寸的图片
 */
export async function generateSizedImage(
  buffer: Buffer,
  size: ImageSizeKey,
  folder: string = "images"
): Promise<{ url: string; width: number; height: number }> {
  const config = imageSizes[size];
  const filename = generateFilename();

  const image = sharp(buffer);
  const metadata = await image.metadata();

  // 计算缩放尺寸，保持宽高比
  let width = metadata.width || config.width;
  let height = metadata.height || config.height;
  const aspectRatio = width / height;

  if (width > config.width) {
    width = config.width;
    height = Math.round(width / aspectRatio);
  }

  if (height > config.height) {
    height = config.height;
    width = Math.round(height * aspectRatio);
  }

  const processedBuffer = await image
    .resize(width, height, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: config.quality })
    .toBuffer();

  let url: string;

  if (storageMode === "oss") {
    // 优先级 1: 阿里云 OSS
    const objectName = `${folder}/${size}/${filename}`;
    const result = await uploadToOSS(processedBuffer, objectName, "image/webp");
    url = result.url;
  } else if (storageMode === "local") {
    // 优先级 2: 本地存储
    const uploadDir = ensureUploadDir(`${folder}/${size}`);
    const filepath = join(uploadDir, filename);
    await sharp(processedBuffer).toFile(filepath);
    url = `/uploads/${folder}/${size}/${filename}`;
  } else {
    // 优先级 3: Supabase (降级或旧有配置)
    const storagePath = `${folder}/${size}/${filename}`;
    const result = await uploadToStorage(processedBuffer, storagePath, "image/webp");
    if (result.error) {
      throw result.error;
    }
    url = result.url;
  }

  return { url, width, height };
}

/**
 * 处理并保存图片 (主函数)
 * 自动生成缩略图和模糊占位符
 */
export async function processAndSaveImage(
  buffer: Buffer,
  originalName: string,
  folder: string = "images",
  options: {
    generateThumbnail?: boolean;
    generateBlur?: boolean;
  } = {}
): Promise<UploadResult> {
  const { generateThumbnail = true, generateBlur = true } = options;

  const filename = generateFilename();

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

  let url: string;

  if (storageMode === "oss") {
    // 优先级 1: 阿里云 OSS
    const objectName = `${folder}/${filename}`;
    const result = await uploadToOSS(processedImage, objectName, "image/webp");
    url = result.url;
  } else if (storageMode === "local") {
    // 优先级 2: 本地存储
    const uploadDir = ensureUploadDir(folder);
    const filepath = join(uploadDir, filename);
    await sharp(processedImage).toFile(filepath);
    url = `/uploads/${folder}/${filename}`;
  } else {
    // 优先级 3: Supabase
    const storagePath = `${folder}/${filename}`;
    const result = await uploadToStorage(processedImage, storagePath, "image/webp");
    if (result.error) {
      throw result.error;
    }
    url = result.url;
  }

  // 生成模糊占位符
  let blurDataURL: string | undefined;
  if (generateBlur) {
    blurDataURL = await generateBlurDataURL(buffer);
  }

  // 生成缩略图
  let thumbnailUrl: string | undefined;
  if (generateThumbnail) {
    const thumbnail = await generateSizedImage(buffer, "thumbnail", folder);
    thumbnailUrl = thumbnail.url;
  }

  return {
    url,
    filename,
    originalName,
    size: processedImage.length,
    width,
    height,
    format: "webp",
    blurDataURL,
    thumbnailUrl,
  };
}

/**
 * 上传文件（不做处理，适用于 PDF 等非图片文件）
 */
export async function uploadFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  folder: string = "files"
): Promise<{ url: string; filename: string; size: number }> {
  const ext = originalName.split(".").pop()?.toLowerCase() || "bin";
  const timestamp = Date.now();
  const uuid = randomUUID();
  const filename = `${timestamp}-${uuid}.${ext}`;

  let url: string;

  if (storageMode === "oss") {
    // 优先级 1: 阿里云 OSS
    const objectName = `${folder}/${filename}`;
    const result = await uploadToOSS(buffer, objectName, mimeType);
    url = result.url;
  } else if (storageMode === "local") {
    // 优先级 2: 本地存储
    const uploadDir = ensureUploadDir(folder);
    const filepath = join(uploadDir, filename);
    const fs = await import("fs/promises");
    await fs.writeFile(filepath, buffer);
    url = `/uploads/${folder}/${filename}`;
  } else {
    // 优先级 3: Supabase
    const storagePath = `${folder}/${filename}`;
    const result = await uploadToStorage(buffer, storagePath, mimeType);
    if (result.error) {
      throw result.error;
    }
    url = result.url;
  }

  return {
    url,
    filename,
    size: buffer.length,
  };
}

// 删除上传的文件
export async function deleteUploadedFile(url: string): Promise<boolean> {
  try {
    // 自动识别存储类型 (根据 URL 特征)
    const ossDomain = getOSSPublicDomain();
    
    if (url.includes("supabase.co") || url.includes("/storage/v1/object/public/")) {
      // 识别为 Supabase
      const storagePath = extractStoragePath(url);
      if (storagePath) {
        const { error } = await deleteFromStorage([storagePath]);
        return !error;
      }
    } else if (url.includes("aliyuncs.com") || url.includes(ossDomain)) {
      // 识别为 OSS
      await deleteOSSFiles([url]);
      return true;
    } else if (url.startsWith("/uploads/")) {
      // 识别为本地存储
      const relativePath = url.replace(/^\//, "").replace(/\.\./g, "");
      const filepath = resolve(join(process.cwd(), "public", relativePath));
      const publicDir = resolve(join(process.cwd(), "public"));

      // 路径越界检查
      if (!filepath.startsWith(publicDir)) {
        console.error("[DeleteFile] 路径越界:", filepath);
        return false;
      }

      if (existsSync(filepath)) {
        unlinkSync(filepath);
        return true;
      }
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
    pdf: "application/pdf",
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

