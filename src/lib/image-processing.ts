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
 * 优化：提高分辨率以提升 AI 识别率，降低质量以控制体积
 */
const DEFAULT_OPTIONS: Required<PreprocessOptions> = {
  targetSize: 1024, // 提升至 1024 (原 512 太糊了)
  quality: 0.7,     // 0.7 足够清晰且体积小
  maxFileSize: 300 * 1024, // 300KB
};

/**
 * 预处理面部图像用于 AI 分析
 * 
 * 功能：
 * - 尺寸限制：最长边不超过 1024px，保持宽高比 (不裁切，防止丢失下巴/额头)
 * - JPEG 70% 质量压缩
 * - Base64 编码 (大小控制在 300KB 以内)
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

        // 1. 计算目标尺寸 (保持宽高比)
        let width = img.width;
        let height = img.height;

        // 如果图片过大，按比例缩小
        if (width > opts.targetSize || height > opts.targetSize) {
          const ratio = width / height;
          if (width > height) {
            // 宽图
            width = opts.targetSize;
            height = Math.round(width / ratio);
          } else {
            // 长图 (手机自拍常见)
            height = opts.targetSize;
            width = Math.round(height * ratio);
          }
        }

        // 设置画布尺寸
        canvas.width = width;
        canvas.height = height;

        // 2. 绘制图像
        // 优化：启用平滑缩放
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        // 3. 智能压缩
        // 尝试以 WebP 格式导出 (更小更清晰)，由于兼容性问题，保守回退到 JPEG
        // 大多数现代浏览器支持 image/webp
        const mimeType = "image/jpeg";

        let processedImage = canvas.toDataURL(mimeType, opts.quality);
        let fileSize = getBase64Size(processedImage);

        // 如果超过最大大小，逐步降低质量
        let currentQuality = opts.quality;
        // 限制循环次数，防止死循环卡死 UI
        let attempts = 0;

        while (fileSize > opts.maxFileSize && currentQuality > 0.3 && attempts < 5) {
          currentQuality -= 0.15; // 步进稍微大一点，快速收敛
          processedImage = canvas.toDataURL(mimeType, currentQuality);
          fileSize = getBase64Size(processedImage);
          attempts++;
        }

        resolve({
          imageData: processedImage,
          originalSize: { width: img.width, height: img.height },
          processedSize: { width, height },
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

