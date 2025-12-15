"use client";

import { useRef, useState, useCallback, useEffect } from "react";

export interface SignatureData {
  imageDataUrl: string; // base64 图片
  strokeCount: number; // 笔画数
  duration: number; // 绘制时长（毫秒）
  complexity: number; // 复杂度评分 0-100
}

interface SignaturePadProps {
  width?: number;
  height?: number;
  strokeColor?: string;
  strokeWidth?: number;
  backgroundColor?: string;
  onChange?: (data: SignatureData | null) => void;
  className?: string;
}

export default function SignaturePad({
  width = 300,
  height = 150,
  strokeColor = "#000000",
  strokeWidth = 2,
  backgroundColor = "#ffffff",
  onChange,
  className = "",
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [strokeCount, setStrokeCount] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [totalPoints, setTotalPoints] = useState(0);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  // 初始化 canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
  }, [width, height, backgroundColor]);

  // 获取相对位置
  const getPosition = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ("touches" in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  // 开始绘制
  const handleStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const pos = getPosition(e);
    setIsDrawing(true);
    lastPos.current = pos;
    if (!startTime) setStartTime(Date.now());
  }, [getPosition, startTime]);

  // 绘制中
  const handleMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !lastPos.current) return;

    const pos = getPosition(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPos.current = pos;
    setTotalPoints((p) => p + 1);
    setHasContent(true);
  }, [isDrawing, getPosition, strokeColor, strokeWidth]);

  // 结束绘制
  const handleEnd = useCallback(() => {
    if (isDrawing) {
      setIsDrawing(false);
      setStrokeCount((c) => c + 1);
      lastPos.current = null;
    }
  }, [isDrawing]);

  // 生成签名数据
  const getSignatureData = useCallback((): SignatureData | null => {
    const canvas = canvasRef.current;
    if (!canvas || !hasContent) return null;
    const duration = startTime ? Date.now() - startTime : 0;
    // 复杂度 = min(100, 笔画数 * 10 + 点数 / 10)
    const complexity = Math.min(100, strokeCount * 10 + Math.floor(totalPoints / 10));
    return {
      imageDataUrl: canvas.toDataURL("image/png"),
      strokeCount,
      duration,
      complexity,
    };
  }, [hasContent, startTime, strokeCount, totalPoints]);

  // 内容变化时通知父组件
  useEffect(() => {
    if (!isDrawing && hasContent) {
      onChange?.(getSignatureData());
    }
  }, [isDrawing, hasContent, onChange, getSignatureData]);

  // 清除签名
  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
    setHasContent(false);
    setStrokeCount(0);
    setTotalPoints(0);
    setStartTime(null);
    onChange?.(null);
  }, [backgroundColor, width, height, onChange]);

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="border border-gray-300 rounded-lg cursor-crosshair touch-none"
        style={{ width: "100%", height: "auto", aspectRatio: `${width}/${height}` }}
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
      />
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-500">
          {hasContent ? `${strokeCount} 笔` : "在上方区域签名"}
        </span>
        <button
          type="button"
          onClick={handleClear}
          className="text-xs text-gray-500 hover:text-gray-700 underline"
        >
          清除
        </button>
      </div>
    </div>
  );
}

