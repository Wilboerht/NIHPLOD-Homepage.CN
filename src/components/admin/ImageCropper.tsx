"use client";

import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Crop, RotateCw } from "lucide-react";

interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ImageCropperProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  onCropComplete: (croppedImageBlob: Blob) => void;
  aspectRatio?: number;
  title?: string;
}

export function ImageCropper({
  isOpen,
  onClose,
  imageUrl,
  onCropComplete,
  aspectRatio = 21 / 9, // 默认宽屏比例
  title = "裁剪图片",
}: ImageCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);

  const onCropChange = useCallback((crop: { x: number; y: number }) => {
    setCrop(crop);
  }, []);

  const onZoomChange = useCallback((zoom: number) => {
    setZoom(zoom);
  }, []);

  const onCropAreaChange = useCallback(
    (_croppedArea: Area, croppedAreaPixels: Area) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    []
  );

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const createCroppedImage = async (): Promise<Blob> => {
    if (!croppedAreaPixels) {
      throw new Error("No crop area defined");
    }

    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.src = imageUrl;

      image.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        // 计算旋转后的包围矩形尺寸
        const rad = (rotation * Math.PI) / 180;
        const absCos = Math.abs(Math.cos(rad));
        const absSin = Math.abs(Math.sin(rad));
        const rotatedWidth = croppedAreaPixels.width * absCos + croppedAreaPixels.height * absSin;
        const rotatedHeight = croppedAreaPixels.width * absSin + croppedAreaPixels.height * absCos;

        // 设置画布大小为旋转后的包围矩形
        canvas.width = Math.ceil(rotatedWidth);
        canvas.height = Math.ceil(rotatedHeight);

        // 应用旋转
        if (rotation !== 0) {
          const centerX = canvas.width / 2;
          const centerY = canvas.height / 2;
          ctx.translate(centerX, centerY);
          ctx.rotate(rad);
          ctx.translate(-centerX, -centerY);
        }

        // 绘制裁剪后的图片（居中绘制以匹配旋转后的画布）
        const offsetX = (canvas.width - croppedAreaPixels.width) / 2;
        const offsetY = (canvas.height - croppedAreaPixels.height) / 2;
        ctx.drawImage(
          image,
          croppedAreaPixels.x,
          croppedAreaPixels.y,
          croppedAreaPixels.width,
          croppedAreaPixels.height,
          offsetX,
          offsetY,
          croppedAreaPixels.width,
          croppedAreaPixels.height
        );

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Failed to create blob"));
            }
          },
          "image/jpeg",
          0.95
        );
      };

      image.onerror = () => {
        reject(new Error("Failed to load image"));
      };
    });
  };

  const handleConfirm = async () => {
    setProcessing(true);
    try {
      const croppedBlob = await createCroppedImage();
      onCropComplete(croppedBlob);
      onClose();
    } catch (error) {
      console.error("裁剪失败:", error);
      alert("裁剪失败，请重试");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Modal open={isOpen} onClose={onClose} title={title} size="xl">
      <div className="space-y-4">
        {/* 裁剪区域 */}
        <div className="relative h-[400px] w-full bg-gray-900">
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspectRatio}
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onCropComplete={onCropAreaChange}
          />
        </div>

        {/* 控制面板 */}
        <div className="space-y-4 rounded-lg bg-gray-50 p-4">
          {/* 缩放控制 */}
          <div>
            <label className="mb-2 flex items-center justify-between text-sm font-medium text-gray-700">
              <span>缩放</span>
              <span className="text-xs text-gray-500">{Math.round(zoom * 100)}%</span>
            </label>
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200"
            />
          </div>

          {/* 旋转按钮 */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              旋转
            </label>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RotateCw className="h-4 w-4" />}
              onClick={handleRotate}
            >
              旋转 90°
            </Button>
          </div>

          {/* 比例提示 */}
          <div className="text-xs text-gray-500">
            裁剪比例: {aspectRatio === 21 / 9 ? "21:9 (宽屏)" : aspectRatio === 16 / 9 ? "16:9" : `${aspectRatio}:1`}
          </div>
        </div>

        {/* 底部操作 */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4">
          <Button variant="outline" onClick={onClose} disabled={processing}>
            取消
          </Button>
          <Button
            leftIcon={<Crop className="h-4 w-4" />}
            onClick={handleConfirm}
            loading={processing}
          >
            确认裁剪
          </Button>
        </div>
      </div>
    </Modal>
  );
}


