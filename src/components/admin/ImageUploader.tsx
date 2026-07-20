"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import { Upload, X, GripVertical, ImageIcon, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import imageCompression from "browser-image-compression";

interface ImageItem {
  id?: string;
  url: string;
  alt?: string | null;
  order: number;
  file?: File; // 新上传的文件
  uploading?: boolean;
}

interface ImageUploaderProps {
  value: ImageItem[];
  onChange: (images: ImageItem[]) => void;
  maxImages?: number;
  maxSize?: number; // MB
  accept?: string;
  label?: string;
  error?: string;
  className?: string;
}

export function ImageUploader({
  value = [],
  onChange,
  maxImages = 10,
  maxSize = 10,
  accept = "image/jpeg,image/png,image/webp",
  label,
  error,
  className,
}: ImageUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false); // 新增压缩状态
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragItem = useRef<number | null>(null);

  // 验证文件
  const validateFile = useCallback(
    (file: File): string | null => {
      if (!accept.includes(file.type)) {
        return `不支持的文件格式: ${file.name}`;
      }
      if (file.size > maxSize * 1024 * 1024) {
        return `文件过大: ${file.name} (最大 ${maxSize}MB)`;
      }
      return null;
    },
    [accept, maxSize]
  );

  // 处理文件选择
  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files) return;

      setIsCompressing(true);
      const errors: string[] = [];
      const newImages: ImageItem[] = [];
      const remainingSlots = maxImages - value.length;
      const fileArray = Array.from(files).slice(0, remainingSlots);

      for (let i = 0; i < fileArray.length; i++) {
        let file = fileArray[i];

        // 自动压缩逻辑
        if (file.type.startsWith("image/") && file.type !== "image/gif") {
          try {
            const options = {
              maxSizeMB: 2, // 目标大小 2MB
              maxWidthOrHeight: 2000, // 最大宽高 2000px
              useWebWorker: true,
              initialQuality: 0.8, // 初始质量
            };

            // 只有当文件确实很大或者尺寸很大时才执行压缩
            if (file.size > 1 * 1024 * 1024) {
              file = await imageCompression(file, options);
            }
          } catch (e) {
            console.error("图片压缩失败:", e);
          }
        }

        const error = validateFile(file);
        if (error) {
          errors.push(error);
          continue;
        }

        const url = URL.createObjectURL(file);
        newImages.push({
          url,
          alt: null,
          order: value.length + i,
          file,
        });
      }

      if (errors.length > 0) {
        setUploadErrors(errors);
        setTimeout(() => setUploadErrors([]), 5000);
      }

      if (newImages.length > 0) {
        onChange([...value, ...newImages]);
      }
      setIsCompressing(false);
    },
    [value, maxImages, onChange, validateFile]
  );

  // 拖拽事件
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  };

  // 删除图片
  const removeImage = (index: number) => {
    const removed = value[index];
    if (removed?.url?.startsWith("blob:")) {
      URL.revokeObjectURL(removed.url);
    }
    const newImages = value.filter((_, i) => i !== index);
    // 重新计算 order（不可变更新）
    onChange(newImages.map((img, i) => ({ ...img, order: i })));
  };

  // 组件卸载时清理所有 blob URL
  useEffect(() => {
    return () => {
      value.forEach((img) => {
        if (img?.url?.startsWith("blob:")) {
          URL.revokeObjectURL(img.url);
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 图片排序拖拽
  const handleDragStart = (index: number) => {
    dragItem.current = index;
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDragEnd = () => {
    if (dragItem.current === null || dragOverIndex === null) {
      setDragOverIndex(null);
      dragItem.current = null;
      return;
    }

    const newImages = [...value];
    const draggedItem = newImages[dragItem.current];
    newImages.splice(dragItem.current, 1);
    newImages.splice(dragOverIndex, 0, draggedItem);
    // 重新计算 order（不可变更新）
    onChange(newImages.map((img, i) => ({ ...img, order: i })));

    setDragOverIndex(null);
    dragItem.current = null;
  };

  return (
    <div className={className}>
      {label && <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>}

      {/* 错误提示 */}
      {uploadErrors.length > 0 && (
        <div className="mb-3 rounded-lg bg-red-50 p-3">
          {uploadErrors.map((err, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{err}</span>
            </div>
          ))}
        </div>
      )}

      {/* 图片列表 */}
      {value.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {value.map((image, index) => (
            <div
              key={image.url}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={cn(
                "group relative aspect-square overflow-hidden rounded-lg border-2 bg-gray-100",
                dragOverIndex === index ? "border-brand-primary" : "border-transparent",
                image.uploading && "opacity-50"
              )}
            >
              <Image src={image.url} alt={image.alt || "产品图片"} fill className="object-cover" />
              {/* 拖拽手柄 */}
              <div className="absolute left-1 top-1 cursor-grab rounded bg-black/50 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                <GripVertical className="h-4 w-4 text-white" />
              </div>
              {/* 删除按钮 */}
              <button
                type="button"
                onClick={() => removeImage(index)}
                className="absolute right-1 top-1 rounded-full bg-black/50 p-1 opacity-0 transition-opacity hover:bg-red-500 group-hover:opacity-100"
              >
                <X className="h-4 w-4 text-white" />
              </button>
              {/* 序号 */}
              <div className="absolute bottom-1 left-1 rounded bg-black/50 px-1.5 py-0.5 text-xs text-white">
                {index + 1}
              </div>
              {/* 加载指示器 */}
              {image.uploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/50">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 上传区域 */}
      {value.length < maxImages && (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors",
            dragActive
              ? "border-brand-primary bg-brand-primary/5"
              : error
                ? "border-red-300 bg-red-50"
                : "border-gray-300 hover:border-brand-primary hover:bg-brand-cream/30"
          )}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={accept}
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
          />
          <div className="mb-3 rounded-full bg-gray-100 p-3">
            {isCompressing ? (
              <Loader2 className="h-6 w-6 animate-spin text-brand-primary" />
            ) : dragActive ? (
              <Upload className="h-6 w-6 text-brand-primary" />
            ) : (
              <ImageIcon className="h-6 w-6 text-gray-400" />
            )}
          </div>
          <p className="mb-1 text-sm font-medium text-gray-700">
            {isCompressing ? "正在处理图片..." : dragActive ? "释放以上传" : "点击或拖拽上传图片"}
          </p>
          <p className="text-xs text-gray-500">支持 JPG, PNG, WebP，单个文件最大 {maxSize}MB</p>
          <p className="mt-1 text-xs text-gray-400">
            已上传 {value.length}/{maxImages} 张
          </p>
        </div>
      )}

      {error && <p className="mt-1.5 text-sm text-red-500">{error}</p>}
    </div>
  );
}
