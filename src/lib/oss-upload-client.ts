/**
 * 上传文件到阿里云 OSS (直传)
 * @param file 文件对象或 Blob
 * @param filename 文件名
 */
export async function uploadImageToOSS(file: Blob, filename: string = "image.jpg"): Promise<string> {
    // 1. 获取上传签名
    const signRes = await fetch("/api/oss/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            filename: filename,
            type: file.type || "image/jpeg"
        }),
    });

    const signData = await signRes.json();
    if (!signRes.ok || !signData.success) {
        throw new Error(signData.error || "获取上传签名失败");
    }

    const { uploadUrl, publicUrl } = signData.data;

    // 2. 直传 OSS
    const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
            "Content-Type": file.type || "image/jpeg"
        },
        body: file
    });

    if (!uploadRes.ok) {
        throw new Error("上传图片到 OSS 失败");
    }

    return publicUrl;
}
