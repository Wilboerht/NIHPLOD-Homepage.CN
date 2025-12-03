/**
 * 面部图像预处理工具
 * 用于 AI 面部分析前的图像处理
 */

/** 预处理配置 */
export interface PreprocessOptions {
  /** 目标尺寸（正方形边长） */
  targetSize?: number;
  /** JPEG 质量 (0-1) */
  quality?: number;
  /** 最大文件大小（字节） */
  maxFileSize?: number;
}

/** 预处理结果 */
export interface PreprocessResult {
  /** 处理后的 Base64 图像数据 */
  imageData: string;
  /** 原始图像尺寸 */
  originalSize: { width: number; height: number };
  /** 处理后图像尺寸 */
  processedSize: { width: number; height: number };
  /** 处理后文件大小（字节） */
  fileSize: number;
}

/**
 * 默认预处理配置
 */
const DEFAULT_OPTIONS: Required<PreprocessOptions> = {
  targetSize: 512,
  quality: 0.8,
  maxFileSize: 500 * 1024, // 500KB
};

/**
 * 预处理面部图像用于 AI 分析
 * 
 * 功能：
 * - 尺寸标准化为 512x512
 * - 居中正方形裁剪
 * - JPEG 80% 质量压缩
 * - Base64 编码
 * 
 * @param imageData - 原始图像 Base64 数据
 * @param options - 预处理配置
 * @returns 处理后的图像数据和元信息
 */
export async function preprocessFaceImage(
  imageData: string,
  options: PreprocessOptions = {}
): Promise<PreprocessResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error("Canvas context not available"));
          return;
        }

        // 计算裁剪区域（居中正方形）
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;

        // 设置目标尺寸
        canvas.width = opts.targetSize;
        canvas.height = opts.targetSize;

        // 绘制并缩放（居中裁剪）
        ctx.drawImage(
          img,
          sx,
          sy,
          minDim,
          minDim,
          0,
          0,
          opts.targetSize,
          opts.targetSize
        );

        // 导出为 JPEG，初始质量
        let processedImage = canvas.toDataURL("image/jpeg", opts.quality);
        let fileSize = getBase64Size(processedImage);

        // 如果超过最大大小，逐步降低质量
        let currentQuality = opts.quality;
        while (fileSize > opts.maxFileSize && currentQuality > 0.3) {
          currentQuality -= 0.1;
          processedImage = canvas.toDataURL("image/jpeg", currentQuality);
          fileSize = getBase64Size(processedImage);
        }

        resolve({
          imageData: processedImage,
          originalSize: { width: img.width, height: img.height },
          processedSize: { width: opts.targetSize, height: opts.targetSize },
          fileSize,
        });
      } catch (error) {
        reject(new Error(`Image processing failed: ${error}`));
      }
    };

    img.onerror = () => {
      reject(new Error("Image loading failed"));
    };

    img.src = imageData;
  });
}

/**
 * 计算 Base64 字符串的实际字节大小
 */
export function getBase64Size(base64: string): number {
  // 移除 data URL 前缀
  const base64Data = base64.split(",")[1] || base64;
  // Base64 编码比原始数据大约 33%
  return Math.ceil((base64Data.length * 3) / 4);
}

/**
 * 计算图像亮度（用于光线检测）
 * 
 * @param imageData - Canvas ImageData 对象
 * @returns 亮度值 (0-1 范围，0=纯黑, 1=纯白)
 */
export function calculateBrightness(imageData: ImageData): number {
  const data = imageData.data;
  let sum = 0;

  for (let i = 0; i < data.length; i += 4) {
    // 使用感知亮度公式 (ITU-R BT.601)
    const brightness = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    sum += brightness;
  }

  // 返回 0-1 范围的亮度值
  return sum / (data.length / 4) / 255;
}

/**
 * 分析图像的光线质量
 * 
 * @param imageData - Canvas ImageData 对象
 * @returns 光线质量评估
 */
export function analyzeLightQuality(imageData: ImageData): {
  level: "good" | "medium" | "low";
  brightness: number;
  message: string;
} {
  const brightness = calculateBrightness(imageData);

  if (brightness > 0.4) {
    return {
      level: "good",
      brightness,
      message: "光线良好",
    };
  } else if (brightness > 0.25) {
    return {
      level: "medium",
      brightness,
      message: "光线一般，建议增加光源",
    };
  } else {
    return {
      level: "low",
      brightness,
      message: "光线较暗，请移到更亮的地方",
    };
  }
}

/**
 * 从 Base64 提取 MIME 类型
 */
export function getBase64MimeType(base64: string): string | null {
  const match = base64.match(/^data:([^;]+);base64,/);
  return match ? match[1] : null;
}

/**
 * 验证图像数据是否有效
 * 
 * @param imageData - 图像 Base64 数据
 * @returns 是否有效
 */
export function isValidImageData(imageData: string): boolean {
  if (!imageData) return false;

  // 检查是否为有效的 Base64 数据 URL
  const mimeType = getBase64MimeType(imageData);
  if (!mimeType) return false;

  // 检查是否为图像类型
  return mimeType.startsWith("image/");
}

/**
 * 将 File 对象转换为 Base64
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * 创建用于 API 传输的最小化图像数据
 * 仅保留必要的 Base64 数据，移除前缀
 * 
 * @param imageData - 完整的 Base64 图像数据
 * @returns 仅 Base64 编码部分
 */
export function extractBase64Data(imageData: string): string {
  const parts = imageData.split(",");
  return parts.length > 1 ? parts[1] : imageData;
}

/**
 * 重建完整的 Base64 数据 URL
 * 
 * @param base64Data - 纯 Base64 数据
 * @param mimeType - MIME 类型
 * @returns 完整的 data URL
 */
export function buildBase64DataUrl(
  base64Data: string,
  mimeType: string = "image/jpeg"
): string {
  return `data:${mimeType};base64,${base64Data}`;
}

