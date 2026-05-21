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
export const isOSSConfigured = () => {
    return (
        !!ossConfig.region &&
        !!ossConfig.accessKeyId &&
        !!ossConfig.accessKeySecret &&
        !!ossConfig.bucket
    );
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
    return process.env.ALI_OSS_PUBLIC_DOMAIN ||
        `https://${ossConfig.bucket}.${ossConfig.region}.aliyuncs.com`;
}

/**
 * 生成直传签名 URL
 * @param filename 文件名
 * @param type 文件类型 (MIME type)
 * @returns { uploadUrl, publicUrl } 用于前端上传和访问
 */
export async function generateUploadSignature(filename: string, type: string) {
    if (!ossClient) {
        throw new Error("阿里云 OSS 未配置");
    }

    // 校验并提取文件扩展名
    const ALLOWED_EXTS = ["jpg", "jpeg", "png", "webp", "gif", "pdf", "mp4", "mov"];
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    if (!ALLOWED_EXTS.includes(ext)) {
        throw new Error(`不支持的文件扩展名: ${ext}`);
    }

    // 生成随机文件路径: uploads/日期/随机ID.ext
    const date = new Date().toISOString().split("T")[0];
    const randomId = Math.random().toString(36).substring(2, 10);
    const objectName = `uploads/${date}/${randomId}.${ext}`;

    // 生成签名 URL，有效期 15 分钟 (900秒)
    // 允许 PUT 方法上传
    const url = ossClient.signatureUrl(objectName, {
        method: "PUT",
        expires: 900,
        "Content-Type": type,
    });

    const publicUrl = `${getOSSPublicDomain()}/${objectName}`;

    return {
        uploadUrl: url,
        publicUrl: publicUrl,
        objectName: objectName
    };
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
        const names = urls.map(url => {
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
        console.log("Deleted OSS files:", names);
    } catch (e) {
        apiConsole.error("Failed to delete OSS files:", e);
    }
}

