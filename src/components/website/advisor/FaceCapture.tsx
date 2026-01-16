"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { m } from "framer-motion";
import {
  RefreshCw,
  Sun,
  SunDim,
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FaceScanOverlay } from "./FaceScanOverlay";

// 四张照片的数据结构
export interface FaceCaptureImages {
  front: string;
  left: string;
  right: string;
  chin: string;
}

interface FaceCaptureProps {
  onCapture: (images: FaceCaptureImages) => void;
}

type LightLevel = "excellent" | "good" | "low" | "too_dark" | "too_bright" | "uneven" | "unknown";
type FaceStatus = "none" | "detecting" | "found" | "ready";

// 拍照步骤类型
type CaptureStep = "front" | "left" | "right" | "chin";

// 头部朝向类型
type HeadPose = "front" | "left" | "right" | "chin" | "unknown";

// 步骤配置
const CAPTURE_STEPS: { step: CaptureStep; label: string; instruction: string; icon: React.ReactNode }[] = [
  { step: "front", label: "正脸", instruction: "请正对镜头", icon: <User className="h-6 w-6" /> },
  { step: "left", label: "左转", instruction: "请向左转头", icon: <ChevronLeft className="h-6 w-6" /> },
  { step: "right", label: "右转", instruction: "请向右转头", icon: <ChevronRight className="h-6 w-6" /> },
  { step: "chin", label: "下颚", instruction: "请微微抬头", icon: <ChevronUp className="h-6 w-6" /> },
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
export function FaceCapture({ onCapture }: FaceCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceDetectionRef = useRef<number | null>(null);
  const stableCountRef = useRef<number>(0);
  const cooldownRef = useRef<boolean>(false); // 步骤切换冷却标志

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImages, setCapturedImages] = useState<Record<CaptureStep, string | null>>({
    front: null,
    left: null,
    right: null,
    chin: null,
  });
  const [currentStep, setCurrentStep] = useState<CaptureStep>("front");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [lightLevel, setLightLevel] = useState<LightLevel>("unknown");
  const [_lightScore, setLightScore] = useState<number>(0); // 0-100 光线质量分数
  const [error, setError] = useState<string | null>(null);
  const [stabilityProgress, setStabilityProgress] = useState<number>(0); // 姿势稳定进度 0-100
  const [isInCooldown, setIsInCooldown] = useState<boolean>(false); // 冷却状态 UI 显示
  const [cooldownProgress, setCooldownProgress] = useState<number>(0); // 冷却进度 0-100
  const [isLoading, setIsLoading] = useState(true);
  const [faceStatus, setFaceStatus] = useState<FaceStatus>("none");
  const [detectionStartTime, setDetectionStartTime] = useState<number | null>(null); // 检测开始时间，用于计算5秒后显示手动按钮
  const [showManualButton, setShowManualButton] = useState(false); // 是否显示手动拍照按钮
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [faceApiLoaded, setFaceApiLoaded] = useState(false);
  const [isAllCaptured, setIsAllCaptured] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const faceApiRef = useRef<any>(null);
  // 保存最新的面部检测框，用于裁剪
  const faceBoxRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

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

      let mediaStream: MediaStream;

      try {
        // 尝试优先使用高级约束（禁用美颜）
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const videoConstraints: MediaTrackConstraints & { advanced?: any[] } = {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          advanced: [
            { beautificationMode: "off" },
            { imageEnhancement: false },
            { autoBeautify: false },
            { faceBeautification: false },
            { skinSmoothing: false },
          ],
        };

        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
        });
      } catch (err) {
        console.warn("Advanced camera constraints failed, retrying with basic constraints:", err);
        // 降级策略：使用基础约束
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
      }

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
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn("Video playback failed but stream is active:", playErr);
          // 忽略播放中断等非致命错误，只要流可以正常获取即可
        }
      }

      setIsLoading(false);
    } catch (err) {
      console.error("Camera error:", err);

      // 如果流已经获取成功，或者是播放错误导致的跳转，不应视为严重错误
      // 检查 err 是否是 'AbortError' 或类似的非权限错误
      if ((err as Error)?.name === 'AbortError') {
        console.warn("Camera init interrupted, ignoring.");
        return;
      }

      let errorMessage = "无法访问摄像头，请检查权限设置或使用上传功能";
      const errorName = (err as Error)?.name;

      if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
        errorMessage = "摄像头权限被拒绝，请在浏览器地址栏点击锁图标允许访问摄像头";
      } else if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
        errorMessage = "未检测到摄像头设备，请检查设备连接";
      } else if (errorName === 'NotReadableError' || errorName === 'TrackStartError') {
        errorMessage = "摄像头可能被其他应用占用（如微信/Zoom），请关闭后重试";
      } else if (errorName === 'OverconstrainedError') {
        errorMessage = "摄像头不支持请求的分辨率，请尝试使用上传功能";
      }

      setError(errorMessage);
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
   * 包含左右转头和仰头（下颚）检测
   */
  const calculateHeadPose = useCallback((landmarks: { positions: { x: number; y: number }[] }, targetStep: CaptureStep): HeadPose => {
    const positions = landmarks.positions;

    // 68点面部关键点索引
    // 左眼外角: 36, 右眼外角: 45
    // 鼻尖: 30
    // 面部左右边缘: 0, 16
    // 下巴: 8, 眉心: 27

    const leftEyeOuter = positions[36];
    const rightEyeOuter = positions[45];
    const noseTip = positions[30];
    const faceLeft = positions[0];
    const faceRight = positions[16];
    const chin = positions[8];
    const _noseBridge = positions[27];

    // 计算眼睛中心
    const eyesCenterX = (leftEyeOuter.x + rightEyeOuter.x) / 2;
    const eyesCenterY = (leftEyeOuter.y + rightEyeOuter.y) / 2;

    // 计算面部宽度
    const faceWidth = faceRight.x - faceLeft.x;

    // 计算鼻尖水平偏移比例 (Mirror mode: Left turn -> nose right -> ratio > 0)
    const noseOffsetRatio = (noseTip.x - eyesCenterX) / faceWidth;

    // 计算仰头指标：鼻尖到眼连线垂距 / 眼到下巴垂距
    const noseToEyesY = noseTip.y - eyesCenterY;
    const eyesToChinY = chin.y - eyesCenterY;
    // 避免除以零
    const tiltRatio = eyesToChinY !== 0 ? noseToEyesY / eyesToChinY : 0.5;

    // --- 判定逻辑 ---

    // 基础标志位
    // 放宽左右转阈值 (0.20 -> 0.15)
    const isLookingLeft = noseOffsetRatio > 0.15;
    const isLookingRight = noseOffsetRatio < -0.15;
    const isLookingCenter = Math.abs(noseOffsetRatio) < 0.25;

    // 抬头标志: tiltRatio 越小越仰头。0.30 是一个经验阈值，低于此值可能有抬头倾向
    const isLookingUp = tiltRatio < 0.32;

    // 优先匹配当前目标步骤 (Bias towards user intent)

    if (targetStep === 'left') {
      // 只要往左转了，哪怕有点抬头/低头也通过
      if (isLookingLeft) return "left";
    }

    if (targetStep === 'right') {
      // 只要往右转了，哪怕有点抬头/低头也通过
      if (isLookingRight) return "right";
    }

    if (targetStep === 'chin') {
      // 必须有明显抬头特征
      // 收紧 tiltRatio 阈值 (< 0.28)，需要真正的抬头动作
      // 同时要求头部基本正对镜头（不要偏转太厉害）
      if (tiltRatio < 0.28 && Math.abs(noseOffsetRatio) < 0.30) {
        return "chin";
      }
    }

    if (targetStep === 'front') {
      // 只要水平居中，允许自然的低头/抬头
      if (isLookingCenter) return "front";
    }

    // Fallback: 如果不符合主要目标，就按默认严格优先级返回
    if (isLookingUp && isLookingCenter) return "chin";
    if (isLookingLeft) return "left";
    if (isLookingRight) return "right";
    if (isLookingCenter) return "front";

    return "unknown";
  }, []);

  /**
   * 检测面部和头部朝向
   */
  const detectFace = useCallback(async () => {
    // 如果处于冷却期，跳过检测
    if (cooldownRef.current) {
      return;
    }
    if (!videoRef.current || !faceApiRef.current || !modelsLoaded || isAllCaptured) {
      return;
    }

    const faceapi = faceApiRef.current;
    const video = videoRef.current;

    try {
      // 使用 withFaceLandmarks 获取面部关键点
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 }))
        .withFaceLandmarks();

      if (detection) {
        const { box } = detection.detection;
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;

        // 保存面部检测框用于裁剪
        faceBoxRef.current = { x: box.x, y: box.y, width: box.width, height: box.height };

        // 面部中心点
        const faceCenterX = box.x + box.width / 2;
        const faceCenterY = box.y + box.height / 2;

        // 视频中心点
        const videoCenterX = videoWidth / 2;
        const videoCenterY = videoHeight / 2;

        // 检查面部是否在中心区域（允许45%的偏移 - 几乎只要在画面里就行）
        const offsetX = Math.abs(faceCenterX - videoCenterX) / videoWidth;
        const offsetY = Math.abs(faceCenterY - videoCenterY) / videoHeight;

        // 检查面部大小是否合适
        const faceRatio = box.height / videoHeight;

        // 大幅放宽限制，只要检测到脸且大概在中间即可
        const isCentered = offsetX < 0.45 && offsetY < 0.45;
        const isSizeOk = faceRatio > 0.15 && faceRatio < 0.9;

        // 计算头部朝向 (传入 currentStep 以优化判定逻辑)
        const headPose = calculateHeadPose(detection.landmarks, currentStep);


        // 检查当前头部朝向是否匹配当前步骤
        const isPoseCorrect = headPose === currentStep;

        if (isCentered && isSizeOk && isPoseCorrect) {
          stableCountRef.current += 1;
          setFaceStatus("found");

          // chin 步骤需要更多稳定帧数，防止误触发
          // 普通步骤: 4帧约0.8秒, chin步骤: 6帧约1.2秒
          const requiredFrames = currentStep === 'chin' ? 6 : 4;
          const progressFrames = currentStep === 'chin' ? 7 : 5;

          // 更新稳定进度
          setStabilityProgress(Math.min(100, (stableCountRef.current / progressFrames) * 100));

          // 稳定检测后拍照
          // 普通步骤: 约0.6秒 (3帧 x 200ms)
          // chin步骤: 约1秒 (5帧 x 200ms)，需要更稳定的姿势
          if (stableCountRef.current >= requiredFrames) {
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
        faceBoxRef.current = null;

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
    const stepOrder: CaptureStep[] = ["front", "left", "right", "chin"];
    const currentIndex = stepOrder.indexOf(current);
    if (currentIndex < stepOrder.length - 1) {
      return stepOrder[currentIndex + 1];
    }
    return null;
  }, []);

  /**
   * 自动拍照并进入下一步
   * 优化：根据面部检测框裁剪图像，去除多余背景
   */
  const takePhotoAuto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let imageData: string;

    // 如果有面部检测框，进行智能裁剪
    if (faceBoxRef.current) {
      const faceBox = faceBoxRef.current;

      // 扩展裁剪区域：上方多留40%（头发），下方多留30%（脖子），左右各多留35%
      const expandTop = faceBox.height * 0.5;
      const expandBottom = faceBox.height * 0.35;
      const expandSide = faceBox.width * 0.4;

      // 计算裁剪区域
      let cropX = faceBox.x - expandSide;
      let cropY = faceBox.y - expandTop;
      let cropWidth = faceBox.width + expandSide * 2;
      let cropHeight = faceBox.height + expandTop + expandBottom;

      // 确保不超出视频边界
      cropX = Math.max(0, cropX);
      cropY = Math.max(0, cropY);
      cropWidth = Math.min(cropWidth, videoWidth - cropX);
      cropHeight = Math.min(cropHeight, videoHeight - cropY);

      // 保持宽高比为 3:4（适合人像）
      const targetRatio = 3 / 4;
      const currentRatio = cropWidth / cropHeight;

      if (currentRatio > targetRatio) {
        // 太宽了，增加高度或减少宽度
        const newWidth = cropHeight * targetRatio;
        cropX += (cropWidth - newWidth) / 2;
        cropWidth = newWidth;
      } else {
        // 太高了，增加宽度或减少高度
        const newHeight = cropWidth / targetRatio;
        cropY += (cropHeight - newHeight) / 2;
        cropHeight = newHeight;
      }

      // 再次确保边界
      cropX = Math.max(0, Math.min(cropX, videoWidth - cropWidth));
      cropY = Math.max(0, Math.min(cropY, videoHeight - cropHeight));

      // 设置输出尺寸（保持高质量）
      const outputWidth = 720;
      const outputHeight = 960;
      canvas.width = outputWidth;
      canvas.height = outputHeight;

      // 前置摄像头需要镜像处理
      if (facingMode === "user") {
        ctx.translate(outputWidth, 0);
        ctx.scale(-1, 1);
        // 镜像时需要调整 cropX
        const mirroredCropX = videoWidth - cropX - cropWidth;
        ctx.drawImage(video, mirroredCropX, cropY, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight);
      } else {
        ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight);
      }

      imageData = canvas.toDataURL("image/jpeg", 0.92);
    } else {
      // 没有面部检测框，使用原始方式
      canvas.width = videoWidth;
      canvas.height = videoHeight;

      if (facingMode === "user") {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }

      ctx.drawImage(video, 0, 0);
      imageData = canvas.toDataURL("image/jpeg", 0.9);
    }

    // 保存当前步骤的照片
    setCapturedImages(prev => ({
      ...prev,
      [currentStep]: imageData,
    }));

    stableCountRef.current = 0;
    faceBoxRef.current = null; // 重置面部框

    // 检查是否还有下一步
    const nextStep = getNextStep(currentStep);

    if (nextStep) {
      // **关键修复：启用冷却期，防止连续拍照**
      cooldownRef.current = true;
      setIsInCooldown(true);
      setFaceStatus("none");
      setStabilityProgress(0);
      setCooldownProgress(0);

      // 进入下一步
      setCurrentStep(nextStep);

      // 冷却期 2.5 秒，给用户足够时间调整姿势
      const cooldownDuration = 2500;
      const progressInterval = 50; // 每 50ms 更新一次进度
      let elapsed = 0;

      const progressTimer = setInterval(() => {
        elapsed += progressInterval;
        const progress = Math.min(100, (elapsed / cooldownDuration) * 100);
        setCooldownProgress(progress);

        if (elapsed >= cooldownDuration) {
          clearInterval(progressTimer);
          cooldownRef.current = false;
          setIsInCooldown(false);
          setCooldownProgress(0);
        }
      }, progressInterval);

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

      // 直接调用 onCapture，传递所有四张照片
      const allImages: FaceCaptureImages = {
        front: currentStep === "front" ? imageData : capturedImages.front!,
        left: currentStep === "left" ? imageData : capturedImages.left!,
        right: currentStep === "right" ? imageData : capturedImages.right!,
        chin: imageData, // 最后一步一定是 chin
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
    const detectionInterval = 200; // 降低间隔到 200ms，提高响应速度

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

  // 5秒后显示手动拍照按钮
  useEffect(() => {
    if (isAllCaptured || isLoading || error || isInCooldown) {
      setShowManualButton(false);
      setDetectionStartTime(null);
      return;
    }

    // 开始计时
    if (!detectionStartTime) {
      setDetectionStartTime(Date.now());
    }

    const timer = setInterval(() => {
      if (detectionStartTime && Date.now() - detectionStartTime >= 5000) {
        setShowManualButton(true);
      }
    }, 500);

    return () => clearInterval(timer);
  }, [isAllCaptured, isLoading, error, isInCooldown, detectionStartTime]);

  /**
   * 渲染光线提示 - 精简版
   * 只显示图标+状态文字，去掉分数和建议
   */
  const renderLightIndicator = () => {
    const configs: Record<LightLevel, { icon: typeof Sun; text: string; className: string }> = {
      excellent: {
        icon: Sun,
        text: "光线极佳",
        className: "text-green-600",
      },
      good: {
        icon: Sun,
        text: "光线良好",
        className: "text-green-600",
      },
      low: {
        icon: SunDim,
        text: "光线偏暗",
        className: "text-yellow-600",
      },
      too_dark: {
        icon: SunDim,
        text: "光线太暗",
        className: "text-orange-600",
      },
      too_bright: {
        icon: Sun,
        text: "光线过强",
        className: "text-orange-600",
      },
      uneven: {
        icon: SunDim,
        text: "光线不均",
        className: "text-yellow-600",
      },
      unknown: {
        icon: Sun,
        text: "检测中...",
        className: "text-gray-400",
      },
    };

    const config = configs[lightLevel];
    const Icon = config.icon;

    return (
      <div className={cn("inline-flex items-center gap-1.5 text-xs", config.className)}>
        <Icon className="h-3.5 w-3.5" />
        <span>{config.text}</span>
      </div>
    );
  };

  // 获取当前步骤配置


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
              <FaceScanOverlay
                currentStep={currentStep}
                faceStatus={faceStatus}
                stabilityProgress={stabilityProgress}
              />
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

      {/* 光线提示 + 拍照提示 (精简版) - 固定高度避免抖动 */}
      {!isAllCaptured && !error && !isLoading && (
        <div className="flex w-full max-w-sm shrink-0 flex-col items-center justify-center" style={{ minHeight: '52px' }}>
          {/* 冷却状态提示 */}
          {isInCooldown ? (
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-2 text-brand-gold">
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
                <span className="text-xs font-medium">请调整姿势...</span>
              </div>
              {/* 冷却进度条 */}
              <div className="h-0.5 w-24 overflow-hidden rounded-full bg-gray-200">
                <m.div
                  className="h-full bg-brand-gold"
                  initial={{ width: "0%" }}
                  animate={{ width: `${cooldownProgress}%` }}
                  transition={{ duration: 0.05 }}
                />
              </div>
              <p className="text-center text-xs text-brand-charcoal/60">
                下一步：{CAPTURE_STEPS.find(s => s.step === currentStep)?.instruction}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              {/* 光线状态 + 操作提示 */}
              <div className="flex items-center gap-3">
                {renderLightIndicator()}
                <span className="text-xs text-brand-charcoal/40">|</span>
                <span className="text-xs text-brand-charcoal/60">系统自动拍照</span>
              </div>

              {/* 手动拍照链接 - 5秒后才显示，否则显示占位符保持高度 */}
              <div className="h-4">
                {showManualButton && (
                  <m.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => {
                      if (faceStatus === "detecting" || faceStatus === "found" || faceStatus === "none") {
                        takePhotoAuto();
                      }
                    }}
                    className="text-[11px] text-brand-charcoal/40 underline decoration-dotted underline-offset-2 transition-colors hover:text-brand-gold"
                  >
                    检测困难？手动拍照
                  </m.button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}