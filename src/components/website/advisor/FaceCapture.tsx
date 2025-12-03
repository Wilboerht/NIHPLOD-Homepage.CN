"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { m } from "framer-motion";
import {
  Camera,
  Upload,
  RefreshCw,
  Check,
  X,
  Sun,
  SunDim,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FaceCaptureProps {
  onCapture: (imageData: string) => void;
  onSkip?: () => void;
}

type LightLevel = "good" | "low" | "unknown";

/**
 * 面部拍照/上传组件
 * 功能：
 * - 摄像头调用 (WebRTC getUserMedia)
 * - 拍照功能 (Canvas 截图)
 * - 图片上传 (文件选择器)
 * - 面部框引导 (椭圆形引导框)
 * - 光线检测提示
 * - 前置/后置摄像头切换
 */
export function FaceCapture({ onCapture, onSkip }: FaceCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [lightLevel, setLightLevel] = useState<LightLevel>("unknown");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * 初始化摄像头
   */
  const initCamera = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 先停止现有流
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
      }

      setIsLoading(false);
    } catch (err) {
      console.error("Camera error:", err);
      setError("无法访问摄像头，请检查权限设置或使用上传功能");
      setIsLoading(false);
    }
  }, [facingMode, stream]);

  /**
   * 分析光线条件
   */
  const analyzeLightLevel = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;

    canvas.width = 100; // 小尺寸用于快速分析
    canvas.height = 75;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, 100, 75);

    const imageData = ctx.getImageData(0, 0, 100, 75);
    const data = imageData.data;

    // 计算平均亮度
    let totalBrightness = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // 使用感知亮度公式
      totalBrightness += 0.299 * r + 0.587 * g + 0.114 * b;
    }

    const avgBrightness = totalBrightness / (data.length / 4);

    if (avgBrightness > 100) {
      setLightLevel("good");
    } else if (avgBrightness > 50) {
      setLightLevel("low");
    } else {
      setLightLevel("low");
    }
  }, []);

  /**
   * 拍照
   */
  const takePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 前置摄像头需要镜像
    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0);

    const imageData = canvas.toDataURL("image/jpeg", 0.9);
    setCapturedImage(imageData);
  }, [facingMode]);

  /**
   * 确认使用照片
   */
  const confirmPhoto = useCallback(() => {
    if (capturedImage) {
      onCapture(capturedImage);
    }
  }, [capturedImage, onCapture]);

  /**
   * 重新拍照
   */
  const retakePhoto = useCallback(() => {
    setCapturedImage(null);
  }, []);

  /**
   * 上传图片
   */
  const handleUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // 验证文件类型
      if (!file.type.startsWith("image/")) {
        setError("请选择图片文件");
        return;
      }

      // 验证文件大小 (最大 10MB)
      if (file.size > 10 * 1024 * 1024) {
        setError("图片大小不能超过 10MB");
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const imageData = reader.result as string;
        setCapturedImage(imageData);
      };
      reader.onerror = () => {
        setError("读取图片失败，请重试");
      };
      reader.readAsDataURL(file);
    },
    []
  );

  /**
   * 触发文件选择
   */
  const triggerUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /**
   * 切换前后摄像头
   */
  const toggleCamera = useCallback(() => {
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  }, []);

  // 初始化摄像头
  useEffect(() => {
    initCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  // 定时检测光线
  useEffect(() => {
    if (!stream || capturedImage) return;

    const interval = setInterval(analyzeLightLevel, 1000);
    return () => clearInterval(interval);
  }, [stream, capturedImage, analyzeLightLevel]);

  /**
   * 渲染光线提示
   */
  const renderLightIndicator = () => {
    const configs = {
      good: {
        icon: Sun,
        text: "光线良好",
        className: "text-green-600 bg-green-50",
      },
      low: {
        icon: SunDim,
        text: "光线较暗，建议移到更亮的地方",
        className: "text-yellow-600 bg-yellow-50",
      },
      unknown: {
        icon: Sun,
        text: "检测光线中...",
        className: "text-gray-500 bg-gray-50",
      },
    };

    const config = configs[lightLevel];
    const Icon = config.icon;

    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs",
          config.className
        )}
      >
        <Icon className="h-4 w-4" />
        <span>{config.text}</span>
      </div>
    );
  };

  return (
    <div className="flex flex-col items-center">
      {/* 隐藏的 Canvas 和文件输入 */}
      <canvas ref={canvasRef} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleUpload}
        className="hidden"
      />

      {/* 预览区域 */}
      <div className="relative mb-4 aspect-[3/4] w-full max-w-sm overflow-hidden rounded-2xl bg-brand-charcoal/5">
        {/* 摄像头预览或拍摄的照片 */}
        {capturedImage ? (
          <m.img
            src={capturedImage}
            alt="拍摄的照片"
            className="h-full w-full object-cover"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
          />
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={cn(
                "h-full w-full object-cover",
                facingMode === "user" && "-scale-x-100" // 前置摄像头镜像
              )}
            />

            {/* 面部引导框 */}
            {!isLoading && !error && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-[70%] w-[65%]">
                  {/* 椭圆形边框 */}
                  <div className="absolute inset-0 rounded-[50%] border-2 border-dashed border-white/60" />
                  {/* 四角标记 */}
                  <div className="absolute -left-1 -top-1 h-4 w-4 border-l-2 border-t-2 border-white" />
                  <div className="absolute -right-1 -top-1 h-4 w-4 border-r-2 border-t-2 border-white" />
                  <div className="absolute -bottom-1 -left-1 h-4 w-4 border-b-2 border-l-2 border-white" />
                  <div className="absolute -bottom-1 -right-1 h-4 w-4 border-b-2 border-r-2 border-white" />
                </div>
                {/* 提示文字 */}
                <p className="absolute bottom-8 text-center text-sm text-white/80">
                  请将面部置于框内
                </p>
              </div>
            )}

            {/* 加载状态 */}
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-brand-charcoal/10">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
              </div>
            )}

            {/* 错误状态 */}
            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-brand-charcoal/5 p-6 text-center">
                <AlertCircle className="mb-2 h-10 w-10 text-red-400" />
                <p className="text-sm text-brand-charcoal/70">{error}</p>
              </div>
            )}
          </>
        )}

        {/* 切换摄像头按钮 */}
        {!capturedImage && !error && !isLoading && (
          <button
            onClick={toggleCamera}
            className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm transition-colors hover:bg-black/50"
            aria-label="切换摄像头"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* 光线提示 */}
      {!capturedImage && !error && !isLoading && (
        <div className="mb-4">{renderLightIndicator()}</div>
      )}

      {/* 操作按钮 */}
      <div className="flex w-full max-w-sm gap-3">
        {capturedImage ? (
          <>
            {/* 重拍按钮 */}
            <button
              onClick={retakePhoto}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-brand-beige bg-white py-3.5 text-brand-charcoal transition-colors hover:bg-brand-cream"
            >
              <X className="h-5 w-5" />
              重新拍摄
            </button>
            {/* 确认按钮 */}
            <button
              onClick={confirmPhoto}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-gold py-3.5 text-white shadow-lg transition-colors hover:bg-brand-gold/90"
            >
              <Check className="h-5 w-5" />
              使用此照片
            </button>
          </>
        ) : (
          <>
            {/* 拍照按钮 */}
            <button
              onClick={takePhoto}
              disabled={isLoading || !!error}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-gold py-3.5 text-white shadow-lg transition-colors hover:bg-brand-gold/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Camera className="h-5 w-5" />
              拍照
            </button>
            {/* 上传按钮 */}
            <button
              onClick={triggerUpload}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-brand-beige bg-white py-3.5 text-brand-charcoal transition-colors hover:bg-brand-cream"
            >
              <Upload className="h-5 w-5" />
              上传照片
            </button>
          </>
        )}
      </div>

      {/* 跳过按钮 */}
      {onSkip && !capturedImage && (
        <button
          onClick={onSkip}
          className="mt-4 text-sm text-brand-charcoal/50 transition-colors hover:text-brand-charcoal/70"
        >
          跳过此步骤
        </button>
      )}

      {/* 隐私提示 */}
      <p className="mt-6 text-center text-xs text-brand-charcoal/40">
        🔒 照片仅用于 AI 分析，不会保存或分享
      </p>
    </div>
  );
}

