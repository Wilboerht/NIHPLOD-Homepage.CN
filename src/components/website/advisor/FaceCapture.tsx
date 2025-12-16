"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { m, AnimatePresence } from "framer-motion";
import {
  RefreshCw,
  Check,
  Sun,
  SunDim,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

// 三张照片的数据结构
export interface FaceCaptureImages {
  front: string;
  left: string;
  right: string;
}

interface FaceCaptureProps {
  onCapture: (images: FaceCaptureImages) => void;
  onSkip?: () => void;
}

type LightLevel = "excellent" | "good" | "low" | "too_dark" | "too_bright" | "uneven" | "unknown";
type FaceStatus = "none" | "detecting" | "found" | "ready";

// 拍照步骤类型
type CaptureStep = "front" | "left" | "right";

// 头部朝向类型
type HeadPose = "front" | "left" | "right" | "unknown";

// 步骤配置
const CAPTURE_STEPS: { step: CaptureStep; label: string; instruction: string; icon: React.ReactNode }[] = [
  { step: "front", label: "正脸", instruction: "请正对镜头", icon: <User className="h-6 w-6" /> },
  { step: "left", label: "左转", instruction: "请向左转头", icon: <ChevronLeft className="h-6 w-6" /> },
  { step: "right", label: "右转", instruction: "请向右转头", icon: <ChevronRight className="h-6 w-6" /> },
];

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
  const faceDetectionRef = useRef<number | null>(null);
  const stableCountRef = useRef<number>(0);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImages, setCapturedImages] = useState<Record<CaptureStep, string | null>>({
    front: null,
    left: null,
    right: null,
  });
  const [currentStep, setCurrentStep] = useState<CaptureStep>("front");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [lightLevel, setLightLevel] = useState<LightLevel>("unknown");
  const [lightScore, setLightScore] = useState<number>(0); // 0-100 光线质量分数
  const [error, setError] = useState<string | null>(null);
  const [stabilityProgress, setStabilityProgress] = useState<number>(0); // 姿势稳定进度 0-100
  const [isLoading, setIsLoading] = useState(true);
  const [faceStatus, setFaceStatus] = useState<FaceStatus>("none");
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [faceApiLoaded, setFaceApiLoaded] = useState(false);
  const [currentHeadPose, setCurrentHeadPose] = useState<HeadPose>("unknown");
  const [isAllCaptured, setIsAllCaptured] = useState(false);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const videoConstraints: MediaTrackConstraints & { advanced?: any[] } = {
        facingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 },
        // 非标准的高级约束，用于禁用图像处理/美颜效果
        // 这些约束在支持的浏览器/设备上会生效
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

      // 从本地加载 TinyFaceDetector 和 faceLandmark68Net 模型
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
        faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
      ]);

      setModelsLoaded(true);
      setFaceApiLoaded(true);
      console.log("Face detection models loaded (including landmarks)");
    } catch (err) {
      console.error("Failed to load face detection:", err);
      // 加载失败时，使用手动模式
      setModelsLoaded(false);
    }
  }, [faceApiLoaded]);

  /**
   * 根据面部关键点计算头部朝向
   * 使用鼻尖和眼睛位置来判断头部方向
   */
  const calculateHeadPose = useCallback((landmarks: { positions: { x: number; y: number }[] }): HeadPose => {
    const positions = landmarks.positions;

    // 68点面部关键点索引:
    // 左眼外角: 36, 左眼内角: 39
    // 右眼外角: 45, 右眼内角: 42
    // 鼻尖: 30
    // 面部左边缘: 0, 面部右边缘: 16

    const leftEyeOuter = positions[36];
    const rightEyeOuter = positions[45];
    const noseTip = positions[30];
    const faceLeft = positions[0];
    const faceRight = positions[16];

    // 计算眼睛中心
    const eyesCenterX = (leftEyeOuter.x + rightEyeOuter.x) / 2;

    // 计算面部宽度
    const faceWidth = faceRight.x - faceLeft.x;

    // 计算鼻尖相对于眼睛中心的水平偏移比例
    const noseOffsetRatio = (noseTip.x - eyesCenterX) / faceWidth;

    // 计算左右眼到面部边缘的距离比例
    const leftEyeToEdge = leftEyeOuter.x - faceLeft.x;
    const rightEyeToEdge = faceRight.x - rightEyeOuter.x;
    const eyeEdgeRatio = leftEyeToEdge / rightEyeToEdge;

    // 判断头部朝向
    // 正脸: 鼻尖在眼睛中心附近，左右对称
    // 左转: 鼻尖偏向右侧（从摄像头看），右眼到边缘距离更小
    // 右转: 鼻尖偏向左侧（从摄像头看），左眼到边缘距离更小

    // 对于前置摄像头，图像是镜像的，需要反转判断
    if (Math.abs(noseOffsetRatio) < 0.08 && eyeEdgeRatio > 0.6 && eyeEdgeRatio < 1.5) {
      return "front";
    } else if (noseOffsetRatio > 0.1 || eyeEdgeRatio > 1.8) {
      // 镜像后：用户向左转时，鼻尖在摄像头画面中偏右
      return "left";
    } else if (noseOffsetRatio < -0.1 || eyeEdgeRatio < 0.55) {
      // 镜像后：用户向右转时，鼻尖在摄像头画面中偏左
      return "right";
    }

    return "unknown";
  }, []);

  /**
   * 检测面部和头部朝向
   */
  const detectFace = useCallback(async () => {
    if (!videoRef.current || !faceApiRef.current || !modelsLoaded || isAllCaptured) {
      return;
    }

    const faceapi = faceApiRef.current;
    const video = videoRef.current;

    try {
      // 使用 withFaceLandmarks 获取面部关键点
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
        .withFaceLandmarks();

      if (detection) {
        const { box } = detection.detection;
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;

        // 面部中心点
        const faceCenterX = box.x + box.width / 2;
        const faceCenterY = box.y + box.height / 2;

        // 视频中心点
        const videoCenterX = videoWidth / 2;
        const videoCenterY = videoHeight / 2;

        // 检查面部是否在中心区域（允许25%的偏移）
        const offsetX = Math.abs(faceCenterX - videoCenterX) / videoWidth;
        const offsetY = Math.abs(faceCenterY - videoCenterY) / videoHeight;

        // 检查面部大小是否合适
        const faceRatio = box.height / videoHeight;

        const isCentered = offsetX < 0.25 && offsetY < 0.25;
        const isSizeOk = faceRatio > 0.15 && faceRatio < 0.7;

        // 计算头部朝向
        const headPose = calculateHeadPose(detection.landmarks);
        setCurrentHeadPose(headPose);

        // 检查当前头部朝向是否匹配当前步骤
        const isPoseCorrect = headPose === currentStep;

        if (isCentered && isSizeOk && isPoseCorrect) {
          stableCountRef.current += 1;
          setFaceStatus("found");
          // 更新稳定进度 (4次检测 = 100%)
          setStabilityProgress(Math.min(100, (stableCountRef.current / 4) * 100));

          // 稳定检测约1.2秒后拍照（4次检测，每次300ms）
          // 确保用户有足够时间保持姿势，拍摄清晰
          if (stableCountRef.current >= 4) {
            setFaceStatus("ready");
            setStabilityProgress(100);
            // 拍照
            takePhotoAuto();
          }
        } else {
          stableCountRef.current = 0;
          setStabilityProgress(0);
          setFaceStatus("detecting");
        }
      } else {
        stableCountRef.current = 0;
        setCurrentHeadPose("unknown");
        setFaceStatus("detecting");
      }
    } catch (err) {
      console.error("Face detection error:", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelsLoaded, isAllCaptured, calculateHeadPose, currentStep]);

  /**
   * 获取下一步骤
   */
  const getNextStep = useCallback((current: CaptureStep): CaptureStep | null => {
    const stepOrder: CaptureStep[] = ["front", "left", "right"];
    const currentIndex = stepOrder.indexOf(current);
    if (currentIndex < stepOrder.length - 1) {
      return stepOrder[currentIndex + 1];
    }
    return null;
  }, []);

  /**
   * 自动拍照并进入下一步
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

    // 保存当前步骤的照片
    setCapturedImages(prev => ({
      ...prev,
      [currentStep]: imageData,
    }));

    stableCountRef.current = 0;

    // 检查是否还有下一步
    const nextStep = getNextStep(currentStep);

    if (nextStep) {
      // 进入下一步
      setCurrentStep(nextStep);
      setFaceStatus("none");
      setCurrentHeadPose("unknown");
    } else {
      // 所有步骤完成 - 直接调用 onCapture 并传递所有照片
      setIsAllCaptured(true);

      // 停止面部检测
      if (faceDetectionRef.current) {
        cancelAnimationFrame(faceDetectionRef.current);
        faceDetectionRef.current = null;
      }

      // 停止摄像头
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        setStream(null);
      }

      // 直接调用 onCapture，传递所有三张照片
      const allImages: FaceCaptureImages = {
        front: currentStep === "front" ? imageData : capturedImages.front!,
        left: currentStep === "left" ? imageData : capturedImages.left!,
        right: imageData, // 最后一步一定是 right
      };
      onCapture(allImages);
    }
  }, [facingMode, currentStep, getNextStep, stream, capturedImages, onCapture]);

  /**
   * 分析光线条件 - 增强版
   * 检测：亮度、对比度、均匀度
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
    const pixelCount = data.length / 4;

    // 计算亮度统计
    let totalBrightness = 0;
    let minBrightness = 255;
    let maxBrightness = 0;
    const brightnessValues: number[] = [];

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // 使用感知亮度公式
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
      totalBrightness += brightness;
      brightnessValues.push(brightness);
      minBrightness = Math.min(minBrightness, brightness);
      maxBrightness = Math.max(maxBrightness, brightness);
    }

    const avgBrightness = totalBrightness / pixelCount;

    // 计算标准差（光线均匀度）
    let variance = 0;
    for (const b of brightnessValues) {
      variance += Math.pow(b - avgBrightness, 2);
    }
    const stdDev = Math.sqrt(variance / pixelCount);

    // 计算动态范围（对比度）
    const dynamicRange = maxBrightness - minBrightness;

    // 综合评分计算
    let score = 0;
    let level: LightLevel = "unknown";

    // 亮度评分 (0-40分) - 理想范围 100-180
    if (avgBrightness >= 100 && avgBrightness <= 180) {
      score += 40;
    } else if (avgBrightness >= 80 && avgBrightness <= 200) {
      score += 30;
    } else if (avgBrightness >= 50 && avgBrightness <= 220) {
      score += 15;
    }

    // 均匀度评分 (0-30分) - 标准差越小越好，理想 < 40
    if (stdDev < 30) {
      score += 30;
    } else if (stdDev < 50) {
      score += 20;
    } else if (stdDev < 70) {
      score += 10;
    }

    // 对比度评分 (0-30分) - 动态范围适中 60-150
    if (dynamicRange >= 60 && dynamicRange <= 150) {
      score += 30;
    } else if (dynamicRange >= 40 && dynamicRange <= 180) {
      score += 20;
    } else if (dynamicRange >= 20) {
      score += 10;
    }

    setLightScore(score);

    // 根据评分和具体问题设置状态
    if (score >= 85) {
      level = "excellent";
    } else if (score >= 65) {
      level = "good";
    } else if (avgBrightness > 220) {
      level = "too_bright";
    } else if (avgBrightness < 50) {
      level = "too_dark";
    } else if (stdDev > 60) {
      level = "uneven";
    } else {
      level = "low";
    }

    setLightLevel(level);
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
    if (!stream || !modelsLoaded || isAllCaptured || isLoading) return;

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
    };
  }, [stream, modelsLoaded, isAllCaptured, isLoading, detectFace]);

  // 定时检测光线
  useEffect(() => {
    if (!stream || isAllCaptured) return;

    const interval = setInterval(analyzeLightLevel, 1000);
    return () => clearInterval(interval);
  }, [stream, isAllCaptured, analyzeLightLevel]);

  /**
   * 渲染光线提示 - 增强版
   */
  const renderLightIndicator = () => {
    const configs: Record<LightLevel, { icon: typeof Sun; text: string; className: string; tip?: string }> = {
      excellent: {
        icon: Sun,
        text: "光线极佳",
        className: "text-green-600 bg-green-50 border-green-200",
      },
      good: {
        icon: Sun,
        text: "光线良好",
        className: "text-green-600 bg-green-50 border-green-200",
      },
      low: {
        icon: SunDim,
        text: "光线偏暗",
        className: "text-yellow-600 bg-yellow-50 border-yellow-200",
        tip: "建议移到更亮的地方",
      },
      too_dark: {
        icon: SunDim,
        text: "光线太暗",
        className: "text-orange-600 bg-orange-50 border-orange-200",
        tip: "请移到光线充足的地方",
      },
      too_bright: {
        icon: Sun,
        text: "光线过强",
        className: "text-orange-600 bg-orange-50 border-orange-200",
        tip: "避免阳光直射，移到阴凉处",
      },
      uneven: {
        icon: SunDim,
        text: "光线不均",
        className: "text-yellow-600 bg-yellow-50 border-yellow-200",
        tip: "避免侧面强光，面向光源",
      },
      unknown: {
        icon: Sun,
        text: "检测光线中...",
        className: "text-gray-500 bg-gray-50 border-gray-200",
      },
    };

    const config = configs[lightLevel];
    const Icon = config.icon;

    return (
      <div className="flex flex-col items-center gap-1">
        <div
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-all duration-300",
            config.className
          )}
        >
          <Icon className="h-4 w-4" />
          <span>{config.text}</span>
          {/* 光线质量分数 */}
          <span className="ml-1 rounded-full bg-white/60 px-1.5 py-0.5 text-[10px] font-medium">
            {lightScore}分
          </span>
        </div>
        {/* 提示文字 */}
        {config.tip && (
          <m.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[10px] text-brand-charcoal/50"
          >
            💡 {config.tip}
          </m.p>
        )}
      </div>
    );
  };

  // 获取当前步骤配置
  const currentStepConfig = CAPTURE_STEPS.find(s => s.step === currentStep)!;
  const currentStepIndex = CAPTURE_STEPS.findIndex(s => s.step === currentStep);

  // 获取动作提示文字
  const getActionHint = () => {
    if (!modelsLoaded) return "正在加载面部识别...";
    if (faceStatus === "none") return "请将面部置于框内";

    const isPoseCorrect = currentHeadPose === currentStep;

    if (faceStatus === "detecting") {
      if (currentHeadPose === "unknown") {
        return currentStepConfig.instruction;
      }
      if (!isPoseCorrect) {
        return currentStepConfig.instruction;
      }
      return "请将面部居中";
    }

    if (faceStatus === "found") {
      return "检测到正确姿势，请保持不动";
    }

    if (faceStatus === "ready") {
      return "拍照中...";
    }

    return currentStepConfig.instruction;
  };

  return (
    <div className="flex h-full flex-col items-center">
      {/* 隐藏的 Canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* 步骤进度指示器 */}
      <div className="mb-3 flex w-full max-w-sm items-center justify-center gap-2">
        {CAPTURE_STEPS.map((step, index) => {
          const isCompleted = capturedImages[step.step] !== null;
          const isCurrent = step.step === currentStep && !isAllCaptured;

          return (
            <div key={step.step} className="flex items-center gap-2">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300",
                    isCompleted
                      ? "border-green-500 bg-green-500 text-white"
                      : isCurrent
                      ? "border-brand-gold bg-brand-gold/10 text-brand-gold"
                      : "border-gray-300 bg-gray-100 text-gray-400"
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    step.icon
                  )}
                </div>
                <span className={cn(
                  "mt-1 text-xs",
                  isCurrent ? "font-medium text-brand-gold" : "text-gray-500"
                )}>
                  {step.label}
                </span>
              </div>
              {index < CAPTURE_STEPS.length - 1 && (
                <div className={cn(
                  "mb-4 h-0.5 w-8 transition-colors duration-300",
                  capturedImages[step.step] ? "bg-green-500" : "bg-gray-200"
                )} />
              )}
            </div>
          );
        })}
      </div>

      {/* 预览区域 */}
      <div className="relative mb-3 aspect-[3/4] w-full max-w-sm overflow-hidden rounded-2xl bg-brand-charcoal/5">
        {/* 完成后显示模糊背景 + 分析提示 */}
        {isAllCaptured && capturedImages.front ? (
          <div className="relative h-full w-full">
            {/* 模糊的背景照片 */}
            <m.img
              src={capturedImages.front}
              alt=""
              className="h-full w-full scale-110 object-cover blur-xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            />
            {/* 深色蒙版 */}
            <div className="absolute inset-0 bg-brand-charcoal/60" />
            {/* 即将开始分析提示 */}
            <m.div
              className="absolute inset-0 flex flex-col items-center justify-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
            >
              <div className="flex flex-col items-center gap-4">
                {/* 加载动画 */}
                <div className="relative">
                  <div className="h-16 w-16 animate-spin rounded-full border-[3px] border-white/20 border-t-brand-gold" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Check className="h-6 w-6 text-white" />
                  </div>
                </div>
                {/* 提示文字 */}
                <div className="text-center">
                  <p className="text-lg font-medium text-white">拍摄完成</p>
                  <p className="mt-1 text-sm text-white/70">正在准备 AI 分析...</p>
                </div>
              </div>
            </m.div>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={cn(
                "h-full w-full object-cover",
                facingMode === "user" && "-scale-x-100"
              )}
            />

            {/* 面部引导框 */}
            {!isLoading && !error && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-[70%] w-[65%]">
                  {/* 椭圆形边框 */}
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

                  {/* 方向指示箭头 */}
                  <AnimatePresence mode="wait">
                    {currentStep !== "front" && faceStatus !== "ready" && (
                      <m.div
                        key={currentStep}
                        initial={{ opacity: 0, x: currentStep === "left" ? 20 : -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        className={cn(
                          "absolute top-1/2 -translate-y-1/2",
                          currentStep === "left" ? "-left-12" : "-right-12"
                        )}
                      >
                        <div className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-full",
                          currentHeadPose === currentStep
                            ? "bg-green-500 text-white"
                            : "bg-brand-gold/80 text-white animate-pulse"
                        )}>
                          {currentStep === "left" ? (
                            <ChevronLeft className="h-6 w-6" />
                          ) : (
                            <ChevronRight className="h-6 w-6" />
                          )}
                        </div>
                      </m.div>
                    )}
                  </AnimatePresence>

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

                  {/* 稳定度进度环 - 当检测到正确姿势时显示 */}
                  {faceStatus === "found" && stabilityProgress > 0 && (
                    <m.div
                      className="absolute inset-0 flex items-center justify-center"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <svg className="h-full w-full" viewBox="0 0 100 100">
                        <ellipse
                          cx="50"
                          cy="50"
                          rx="48"
                          ry="48"
                          fill="none"
                          stroke="rgba(74, 222, 128, 0.3)"
                          strokeWidth="3"
                        />
                        <m.ellipse
                          cx="50"
                          cy="50"
                          rx="48"
                          ry="48"
                          fill="none"
                          stroke="#4ade80"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeDasharray={`${stabilityProgress * 3.02} 302`}
                          transform="rotate(-90 50 50)"
                          initial={{ strokeDasharray: "0 302" }}
                          animate={{ strokeDasharray: `${stabilityProgress * 3.02} 302` }}
                          transition={{ duration: 0.2 }}
                        />
                      </svg>
                      {/* 倒计时数字 */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <m.div
                          className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 backdrop-blur-sm"
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                        >
                          <span className="text-2xl font-bold text-white">
                            {Math.ceil((100 - stabilityProgress) / 25) || "✓"}
                          </span>
                        </m.div>
                      </div>
                    </m.div>
                  )}

                </div>

                {/* 状态提示文字 */}
                <div className="absolute bottom-8 text-center">
                  {!modelsLoaded ? (
                    <div className="flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 text-xs text-white">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>正在加载面部识别...</span>
                    </div>
                  ) : (
                    <m.div
                      key={getActionHint()}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "rounded-full px-4 py-2 text-sm",
                        faceStatus === "ready"
                          ? "bg-green-500/80 text-white"
                          : faceStatus === "found"
                          ? "bg-yellow-500/80 text-white"
                          : "bg-black/50 text-white"
                      )}
                    >
                      {getActionHint()}
                    </m.div>
                  )}
                </div>

                {/* 当前步骤提示 */}
                <div className="absolute left-4 top-4">
                  <div className="rounded-full bg-black/50 px-3 py-1 text-xs text-white">
                    步骤 {currentStepIndex + 1}/3: {currentStepConfig.label}
                  </div>
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
        {!isAllCaptured && !error && !isLoading && (
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
      {!isAllCaptured && !error && !isLoading && (
        <div className="mb-2">{renderLightIndicator()}</div>
      )}

      {/* 拍照提示 */}
      {!isAllCaptured && !error && !isLoading && (
        <div className="flex w-full max-w-sm shrink-0 gap-2">
          <div className="flex w-full flex-col items-center gap-2">
            <p className="text-center text-xs text-brand-charcoal/60">
              请按照提示完成三个动作，系统将自动拍照
            </p>
          </div>
        </div>
      )}

      {/* 跳过按钮 */}
      {onSkip && !isAllCaptured && (
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

