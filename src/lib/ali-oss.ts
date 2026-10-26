/**
 * 阿里云 OSS 工具类
 * 用于生成直传签名和处理 OSS 相关操作
 */
import OSS from "ali-oss";
import { apiConsole } from "@/lib/logger";

// OSS 配置检查
const ossConfig = {
  region: process.env.ALI_OSS_REGION,
  accessKeyId: process.env.ALI_OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALI_OSS_ACCESS_KEY_SECRET,
  bucket: process.env.ALI_OSS_BUCKET,
  secure: true, // 使用 HTTPS
};

// 检查配置是否完整
const isOSSCredentialsConfigured = () => {
  return !!ossConfig.region && !!ossConfig.accessKeyId && !!ossConfig.accessKeySecret;
};

export const isOSSConfigured = () => {
  return isOSSCredentialsConfigured() && !!ossConfig.bucket;
};

// 创建 OSS 客户端实例
// 注意：这个实例只在服务端使用，不要在客户端代码中导入
let ossClient: OSS | null = null;

if (isOSSConfigured()) {
  ossClient = new OSS({
    region: ossConfig.region!,
    accessKeyId: ossConfig.accessKeyId!,
    accessKeySecret: ossConfig.accessKeySecret!,
    bucket: ossConfig.bucket!,
    secure: ossConfig.secure,
  });
}

/**
 * 获取 OSS 公开访问域名
 */
export function getOSSPublicDomain() {
  return (
    process.env.ALI_OSS_PUBLIC_DOMAIN ||
    `https://${ossConfig.bucket}.${ossConfig.region}.aliyuncs.com`
  );
}

/**
 * 服务端直接上传到 OSS
 */
export async function uploadToOSS(buffer: Buffer, objectName: string, type: string) {
  if (!ossClient) {
    throw new Error("阿里云 OSS 未配置");
  }

  try {
    const result = await ossClient.put(objectName, buffer, {
      mime: type,
    });

    return {
      url: `${getOSSPublicDomain()}/${objectName}`,
      name: result.name,
    };
  } catch (error) {
    apiConsole.error("OSS Upload Error:", error);
    throw error;
  }
}

/**
 * 批量删除 OSS 文件
 * @param urls 文件的完整 URL 或 objectName 列表
 */
export async function deleteOSSFiles(urls: string[]) {
  if (!ossClient) return;

  try {
    // 提取 objectName
    const names = urls.map((url) => {
      try {
        // 如果是完整 URL，尝试解析
        if (url.startsWith("http")) {
          const urlObj = new URL(url);
          // 移除开头的 /
          return urlObj.pathname.substring(1);
        }
        return url;
      } catch {
        return url;
      }
    });

    if (names.length === 0) return;

    // 批量删除
    await ossClient.deleteMulti(names);
    apiConsole.info(`Deleted OSS files: ${names.join(", ")}`);
  } catch (e) {
    apiConsole.error("Failed to delete OSS files:", e);
    throw e;
  }
}

// ============================================
// 私有 Bucket（敏感文件，如消费凭证截图）
// 凭证含收货地址等个人信息，不应走公开读 bucket。
// 通过 ALI_OSS_PRIVATE_BUCKET 配置专用 bucket（与公开 bucket 同区域同密钥），
// 未配置时回退公开管线（保持向后兼容）。
// ============================================

export function isPrivateBucketConfigured(): boolean {
  // 私有 bucket 只依赖 region/密钥/privateBucket，不要求同时配置公开 bucket
  return !!process.env.ALI_OSS_PRIVATE_BUCKET && isOSSCredentialsConfigured();
}

let privateOssClient: OSS | null = null;

function getPrivateOssClient(): OSS | null {
  if (!isPrivateBucketConfigured()) return null;
  if (!privateOssClient) {
    privateOssClient = new OSS({
      region: ossConfig.region!,
      accessKeyId: ossConfig.accessKeyId!,
      accessKeySecret: ossConfig.accessKeySecret!,
      bucket: process.env.ALI_OSS_PRIVATE_BUCKET!,
      secure: ossConfig.secure,
    });
  }
  return privateOssClient;
}

/**
 * 上传到私有 bucket，返回 objectName（不返回公开 URL）
 */
export async function uploadToPrivateOSS(
  buffer: Buffer,
  objectName: string,
  type: string
): Promise<{ objectName: string }> {
  const client = getPrivateOssClient();
  if (!client) {
    throw new Error("私有 OSS bucket 未配置");
  }
  await client.put(objectName, buffer, { mime: type });
  return { objectName };
}

/**
 * 生成私有对象的签名访问 URL（GET，默认 24 小时有效）
 *
 * contentDisposition 会作为 OSS 的 response-content-disposition 参与签名，
 * 这样浏览器下载时能保留候选人原始文件名，并且强制 attachment。
 */
export function signPrivateObjectUrl(
  objectName: string,
  expiresSec = 24 * 3600,
  contentDisposition?: string
): string | null {
  const client = getPrivateOssClient();
  if (!client) return null;
  return client.signatureUrl(objectName, {
    method: "GET",
    expires: expiresSec,
    ...(contentDisposition ? { response: { "content-disposition": contentDisposition } } : {}),
  });
}

/** 删除私有 bucket 对象；未配置时返回 false。 */
export async function deletePrivateOSSObject(objectName: string): Promise<boolean> {
  const client = getPrivateOssClient();
  if (!client) return false;
  await client.delete(objectName);
  return true;
}

export async function listPrivateOSSObjects(
  prefix: string
): Promise<{ name: string; lastModified: string | null }[]> {
  const client = getPrivateOssClient();
  if (!client) return [];

  const objects: { name: string; lastModified: string | null }[] = [];
  let marker: string | undefined;
  do {
    const result = await client.list(
      {
        prefix,
        "max-keys": 1000,
        ...(marker ? { marker } : {}),
      },
      {}
    );
    for (const object of result.objects ?? []) {
      objects.push({ name: object.name, lastModified: object.lastModified ?? null });
    }
    marker = result.nextMarker;
  } while (marker);

  return objects;
}

export async function listPrivateOSSObjectNames(prefix: string): Promise<string[]> {
  return (await listPrivateOSSObjects(prefix)).map((object) => object.name);
}
