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
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FaceCaptureProps {
  onCapture: (imageData: string) => void;
  onSkip?: () => void;
}

type LightLevel = "good" | "low" | "unknown";
type FaceStatus = "none" | "detecting" | "found" | "ready";

/**
 * 面部拍照/上传组件
 * 功能：
 * - 摄像头调用 (WebRTC getUserMedia)
 * - 自动面部检测 (face-api.js)
 * - 检测到稳定面部后自动拍照
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
  const faceDetectionRef = useRef<number | null>(null);
  const stableCountRef = useRef<number>(0);
  const countdownRef = useRef<number | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [lightLevel, setLightLevel] = useState<LightLevel>("unknown");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [faceStatus, setFaceStatus] = useState<FaceStatus>("none");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [faceApiLoaded, setFaceApiLoaded] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const faceApiRef = useRef<any>(null);

  /**
   * 初始化摄像头
   * 注意：禁用美颜效果，确保获取原始相机画面用于AI肌肤分析
   */
  const initCamera = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 先停止现有流
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      // 视频约束配置
      // 添加高级约束以禁用美颜效果，确保获取原始相机画面
      const videoConstraints: MediaTrackConstraints = {
        facingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 },
        // 标准化的高级约束，用于禁用图像处理/美颜效果
        // 这些约束在支持的浏览器/设备上会生效
        // @ts-expect-error - 非标准但广泛支持的约束
        advanced: [
          // 禁用美颜模式（部分Android设备支持）
          { beautificationMode: "off" },
          // 禁用图像增强
          { imageEnhancement: false },
          // 禁用自动美化
          { autoBeautify: false },
          // 禁用人脸美化
          { faceBeautification: false },
          // 禁用皮肤平滑
          { skinSmoothing: false },
        ],
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
      });

      // 获取视频轨道并尝试应用更多约束
      const videoTrack = mediaStream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          // 获取当前轨道能力
          const capabilities = videoTrack.getCapabilities?.();

          // 尝试应用额外的约束来禁用美颜
          // 不同设备/浏览器支持的约束可能不同
          const constraintsToApply: MediaTrackConstraints = {};

          // @ts-expect-error - 检查并应用非标准约束
          if (capabilities?.beautificationMode) {
            // @ts-expect-error - 非标准约束
            constraintsToApply.beautificationMode = "off";
          }

          if (Object.keys(constraintsToApply).length > 0) {
            await videoTrack.applyConstraints(constraintsToApply);
          }
        } catch {
          // 如果应用约束失败，继续使用现有流
          console.log("Note: Some camera constraints not supported on this device");
        }
      }

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
   * 加载 face-api.js 和模型
   */
  const loadFaceApi = useCallback(async () => {
    if (faceApiLoaded) return;

    try {
      // 动态导入 @vladmandic/face-api
      const faceapi = await import("@vladmandic/face-api");
      faceApiRef.current = faceapi;

      // 从本地加载 TinyFaceDetector 模型
      await faceapi.nets.tinyFaceDetector.loadFromUri("/models");

      setModelsLoaded(true);
      setFaceApiLoaded(true);
      console.log("Face detection models loaded");
    } catch (err) {
      console.error("Failed to load face detection:", err);
      // 加载失败时，使用手动模式
      setModelsLoaded(false);
    }
  }, [faceApiLoaded]);

  /**
   * 检测面部
   */
  const detectFace = useCallback(async () => {
    if (!videoRef.current || !faceApiRef.current || !modelsLoaded || capturedImage) {
      return;
    }

    const faceapi = faceApiRef.current;
    const video = videoRef.current;

    try {
      const detection = await faceapi.detectSingleFace(
        video,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
      );

      if (detection) {
        // 检查面部是否在中心区域且大小合适
        const { box } = detection;
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;

        // 面部中心点
        const faceCenterX = box.x + box.width / 2;
        const faceCenterY = box.y + box.height / 2;

        // 视频中心点
        const videoCenterX = videoWidth / 2;
        const videoCenterY = videoHeight / 2;

        // 检查面部是否在中心区域（允许20%的偏移）
        const offsetX = Math.abs(faceCenterX - videoCenterX) / videoWidth;
        const offsetY = Math.abs(faceCenterY - videoCenterY) / videoHeight;

        // 检查面部大小是否合适（占视频高度的20%-60%）
        const faceRatio = box.height / videoHeight;

        const isCentered = offsetX < 0.2 && offsetY < 0.2;
        const isSizeOk = faceRatio > 0.15 && faceRatio < 0.7;

        if (isCentered && isSizeOk) {
          stableCountRef.current += 1;
          setFaceStatus("found");

          // 面部稳定检测 1.5 秒后开始倒计时
          if (stableCountRef.current >= 5) {
            setFaceStatus("ready");
            startCountdown();
          }
        } else {
          stableCountRef.current = 0;
          setFaceStatus("detecting");
        }
      } else {
        stableCountRef.current = 0;
        setFaceStatus("detecting");
      }
    } catch (err) {
      console.error("Face detection error:", err);
    }
  }, [modelsLoaded, capturedImage]);

  /**
   * 开始倒计时
   */
  const startCountdown = useCallback(() => {
    if (countdownRef.current !== null) return;

    setCountdown(3);

    let count = 3;
    countdownRef.current = window.setInterval(() => {
      count -= 1;
      setCountdown(count);

      if (count === 0) {
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
        // 自动拍照
        takePhotoAuto();
      }
    }, 1000);
  }, []);

  /**
   * 自动拍照
   */
  const takePhotoAuto = useCallback(() => {
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
    setCountdown(null);

    // 停止面部检测
    if (faceDetectionRef.current) {
      cancelAnimationFrame(faceDetectionRef.current);
      faceDetectionRef.current = null;
    }
  }, [facingMode]);

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
    setFaceStatus("none");
    stableCountRef.current = 0;
    setCountdown(null);
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
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

  // 加载 face-api.js
  useEffect(() => {
    loadFaceApi();
  }, [loadFaceApi]);

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

  // 面部检测循环
  useEffect(() => {
    if (!stream || !modelsLoaded || capturedImage || isLoading) return;

    let animationId: number;
    let lastDetectionTime = 0;
    const detectionInterval = 300; // 每 300ms 检测一次

    const runDetection = (timestamp: number) => {
      if (timestamp - lastDetectionTime >= detectionInterval) {
        detectFace();
        lastDetectionTime = timestamp;
      }
      animationId = requestAnimationFrame(runDetection);
    };

    animationId = requestAnimationFrame(runDetection);
    faceDetectionRef.current = animationId;

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [stream, modelsLoaded, capturedImage, isLoading, detectFace]);

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
    <div className="flex h-full flex-col items-center">
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
      <div className="relative mb-3 aspect-[3/4] w-full max-w-sm overflow-hidden rounded-2xl bg-brand-charcoal/5">
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
                  {/* 椭圆形边框 - 根据检测状态变色 */}
                  <div
                    className={cn(
                      "absolute inset-0 rounded-[50%] border-2 transition-colors duration-300",
                      faceStatus === "none" || faceStatus === "detecting"
                        ? "border-dashed border-white/60"
                        : faceStatus === "found"
                        ? "border-solid border-yellow-400"
                        : "border-solid border-green-400"
                    )}
                  />
                  {/* 四角标记 */}
                  <div className={cn(
                    "absolute -left-1 -top-1 h-4 w-4 border-l-2 border-t-2 transition-colors duration-300",
                    faceStatus === "ready" ? "border-green-400" : "border-white"
                  )} />
                  <div className={cn(
                    "absolute -right-1 -top-1 h-4 w-4 border-r-2 border-t-2 transition-colors duration-300",
                    faceStatus === "ready" ? "border-green-400" : "border-white"
                  )} />
                  <div className={cn(
                    "absolute -bottom-1 -left-1 h-4 w-4 border-b-2 border-l-2 transition-colors duration-300",
                    faceStatus === "ready" ? "border-green-400" : "border-white"
                  )} />
                  <div className={cn(
                    "absolute -bottom-1 -right-1 h-4 w-4 border-b-2 border-r-2 transition-colors duration-300",
                    faceStatus === "ready" ? "border-green-400" : "border-white"
                  )} />

                  {/* 倒计时显示 */}
                  {countdown !== null && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <m.div
                        key={countdown}
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 1.5, opacity: 0 }}
                        className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-gold/90 text-4xl font-bold text-white shadow-lg"
                      >
                        {countdown}
                      </m.div>
                    </div>
                  )}
                </div>

                {/* 状态提示文字 */}
                <div className="absolute bottom-8 text-center">
                  {!modelsLoaded ? (
                    <div className="flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 text-xs text-white">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>正在加载面部识别...</span>
                    </div>
                  ) : faceStatus === "none" || faceStatus === "detecting" ? (
                    <p className="text-sm text-white/80">请将面部置于框内</p>
                  ) : faceStatus === "found" ? (
                    <p className="text-sm text-yellow-300">检测到面部，请保持不动</p>
                  ) : countdown !== null ? (
                    <p className="text-sm text-green-300">即将自动拍照...</p>
                  ) : null}
                </div>
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
        <div className="mb-2">{renderLightIndicator()}</div>
      )}

      {/* 操作按钮 */}
      <div className="flex w-full max-w-sm shrink-0 gap-2">
        {capturedImage ? (
          <>
            {/* 重拍按钮 */}
            <button
              onClick={retakePhoto}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-brand-beige bg-white py-2.5 text-sm text-brand-charcoal transition-colors hover:bg-brand-cream"
            >
              <X className="h-4 w-4" />
              重新拍摄
            </button>
            {/* 确认按钮 */}
            <button
              onClick={confirmPhoto}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-gold py-2.5 text-sm text-white shadow-lg transition-colors hover:bg-brand-gold/90"
            >
              <Check className="h-4 w-4" />
              使用此照片
            </button>
          </>
        ) : (
          <>
            {/* 拍照按钮 */}
            <button
              onClick={takePhoto}
              disabled={isLoading || !!error}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-gold py-2.5 text-sm text-white shadow-lg transition-colors hover:bg-brand-gold/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Camera className="h-4 w-4" />
              拍照
            </button>
            {/* 上传按钮 */}
            <button
              onClick={triggerUpload}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-brand-beige bg-white py-2.5 text-sm text-brand-charcoal transition-colors hover:bg-brand-cream"
            >
              <Upload className="h-4 w-4" />
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

