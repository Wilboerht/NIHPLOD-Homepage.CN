"use client";

import { useRef, useState, useCallback, useEffect } from "react";

// 预设的花朵颜色调色板
const FLOWER_COLORS = [
  "#ec4899", // 粉色
  "#f43f5e", // 玫红
  "#f97316", // 橙色
  "#eab308", // 黄色
  "#22c55e", // 绿色
  "#06b6d4", // 青色
  "#3b82f6", // 蓝色
  "#8b5cf6", // 紫色
  "#000000", // 黑色
];

export interface FlowerData {
  imageDataUrl: string;
  colors: string[];
  strokeCount: number;
  duration: number;
  complexity: number;
}

interface FlowerCanvasProps {
  width?: number;
  height?: number;
  onChange?: (data: FlowerData | null) => void;
  className?: string;
}

export default function FlowerCanvas({
  width = 280,
  height = 280,
  onChange,
  className = "",
}: FlowerCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentColor, setCurrentColor] = useState(FLOWER_COLORS[0]);
  const [brushSize, setBrushSize] = useState(4);
  const [isEraser, setIsEraser] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [strokeCount, setStrokeCount] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [usedColors, setUsedColors] = useState<Set<string>>(new Set());
  const [totalPoints, setTotalPoints] = useState(0);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  // 初始化 canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }, [width, height]);

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
    if (!isEraser) {
      setUsedColors((prev) => new Set(prev).add(currentColor));
    }
  }, [getPosition, startTime, isEraser, currentColor]);

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
    ctx.strokeStyle = isEraser ? "#ffffff" : currentColor;
    ctx.lineWidth = isEraser ? brushSize * 2 : brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPos.current = pos;
    setTotalPoints((p) => p + 1);
    setHasContent(true);
  }, [isDrawing, getPosition, currentColor, brushSize, isEraser]);

  // 结束绘制
  const handleEnd = useCallback(() => {
    if (isDrawing) {
      setIsDrawing(false);
      setStrokeCount((c) => c + 1);
      lastPos.current = null;
    }
  }, [isDrawing]);

  // 生成花朵数据
  const getFlowerData = useCallback((): FlowerData | null => {
    const canvas = canvasRef.current;
    if (!canvas || !hasContent) return null;
    const duration = startTime ? Date.now() - startTime : 0;
    const complexity = Math.min(100, strokeCount * 8 + Math.floor(totalPoints / 8) + usedColors.size * 5);
    return {
      imageDataUrl: canvas.toDataURL("image/png"),
      colors: Array.from(usedColors),
      strokeCount,
      duration,
      complexity,
    };
  }, [hasContent, startTime, strokeCount, totalPoints, usedColors]);

  // 内容变化时通知父组件
  useEffect(() => {
    if (!isDrawing && hasContent) {
      onChange?.(getFlowerData());
    }
  }, [isDrawing, hasContent, onChange, getFlowerData]);

  // 清除画布
  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    setHasContent(false);
    setStrokeCount(0);
    setTotalPoints(0);
    setStartTime(null);
    setUsedColors(new Set());
    onChange?.(null);
  }, [width, height, onChange]);

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* 调色板 */}
      <div className="flex flex-wrap gap-1.5 justify-center">
        {FLOWER_COLORS.map((color) => (
          <button key={color} type="button" onClick={() => { setCurrentColor(color); setIsEraser(false); }}
            className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-105 ${currentColor === color && !isEraser ? "border-gray-800 scale-110 ring-2 ring-offset-1 ring-gray-400" : "border-gray-300"}`}
            style={{ backgroundColor: color }} title={color} />
        ))}
        <button type="button" onClick={() => setIsEraser(!isEraser)}
          className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs hover:scale-105 ${isEraser ? "border-gray-800 bg-gray-100 ring-2 ring-offset-1 ring-gray-400" : "border-gray-300 bg-white"}`}
          title="橡皮擦">🧹</button>
      </div>

      {/* 画笔大小 */}
      <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
        <span>画笔</span>
        <input
          type="range"
          min="2"
          max="12"
          value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
          className="w-20 h-1 accent-pink-500"
        />
        <span className="w-4 text-center">{brushSize}</span>
      </div>

      {/* 画布 */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="border-2 border-dashed border-pink-300 rounded-xl cursor-crosshair touch-none bg-white shadow-inner"
          style={{ width: "100%", height: "auto", aspectRatio: "1/1" }}
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
        />
        {!hasContent && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-pink-300 text-sm">🌸 在这里画一朵属于你的花</span>
          </div>
        )}
      </div>

      {/* 底部信息和操作 */}
      <div className="flex justify-between items-center text-sm">
        <span className="text-gray-500">
          {hasContent ? (
            <>
              <span className="text-pink-500">{strokeCount}</span> 笔 ·
              <span className="text-pink-500">{usedColors.size}</span> 种颜色
            </>
          ) : (
            "选择颜色开始创作"
          )}
        </span>
        <button
          type="button"
          onClick={handleClear}
          disabled={!hasContent}
          className="text-gray-500 hover:text-gray-700 underline disabled:opacity-50 disabled:cursor-not-allowed"
        >
          清除重画
        </button>
      </div>
    </div>
  );
}

