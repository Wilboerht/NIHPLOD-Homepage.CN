/**
 * Supabase 客户端配置
 * 用于 Storage 文件存储
 */
import { createClient } from "@supabase/supabase-js";

// Supabase 配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// 验证配置
if (!supabaseUrl) {
  console.warn("⚠️ NEXT_PUBLIC_SUPABASE_URL 未配置");
}

/**
 * Supabase 公共客户端（用于前端）
 * 使用 anon key，受 RLS 策略限制
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Supabase 服务端客户端（用于后端 API）
 * 使用 service role key，绕过 RLS 策略
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Storage bucket 名称
export const STORAGE_BUCKET = "media";

/**
 * 获取文件的公开 URL
 */
export function getPublicUrl(path: string): string {
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * 上传文件到 Supabase Storage
 */
export async function uploadToStorage(
  buffer: Buffer,
  path: string,
  contentType: string
): Promise<{ url: string; error: Error | null }> {
  const { data, error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, {
      contentType,
      upsert: true, // 覆盖同名文件
    });

  if (error) {
    console.error("Supabase Storage 上传失败:", error);
    return { url: "", error: new Error(error.message) };
  }

  const url = getPublicUrl(data.path);
  return { url, error: null };
}

/**
 * 删除 Storage 中的文件
 */
export async function deleteFromStorage(
  paths: string[]
): Promise<{ error: Error | null }> {
  const { error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .remove(paths);

  if (error) {
    console.error("Supabase Storage 删除失败:", error);
    return { error: new Error(error.message) };
  }

  return { error: null };
}

/**
 * 从 URL 提取 Storage 路径
 * 例如: https://xxx.supabase.co/storage/v1/object/public/media/images/xxx.webp
 * 返回: images/xxx.webp
 */
export function extractStoragePath(url: string): string | null {
  try {
    const match = url.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

