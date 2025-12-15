"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import {
  Search,
  Upload,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import { ImageCropper } from "./ImageCropper";
import { cn } from "@/lib/utils";

interface MediaItem {
  id: string;
  filename: string;
  url: string;
  type: string;
  size: number;
  width: number | null;
  height: number | null;
  alt: string | null;
  createdAt: string;
}

interface BackgroundImagePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  aspectRatio?: number;
  title?: string;
}

export function BackgroundImagePicker({
  isOpen,
  onClose,
  onSelect,
  aspectRatio = 21 / 9,
  title = "选择背景图片",
}: BackgroundImagePickerProps) {
  const { success, error: showError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropFileInputRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  
  // 裁剪相关状态
  const [showCropper, setShowCropper] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string>("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // 获取媒体列表
  const fetchMedia = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: "18",
        type: "image",
      });
      if (search) params.set("search", search);

      const res = await fetch(`/api/admin/media?${params}`);
      const data = await res.json();

      if (data.success) {
        setItems(data.data.items);
        setTotal(data.data.pagination.total);
      }
    } catch (error) {
      console.error("获取媒体列表失败:", error);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    if (isOpen) {
      fetchMedia();
    }
  }, [isOpen, fetchMedia]);

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // 上传文件 - 直接上传，不裁剪
  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "backgrounds");

      const res = await fetch("/api/admin/media", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("上传失败");
      }

      const data = await res.json();
      success("背景图片已上传");

      // 返回上传后的图片 URL
      onSelect(data.data.url);
      onClose();
    } catch (error) {
      console.error("上传失败:", error);
      showError("上传失败");
    } finally {
      setUploading(false);
    }
  };

  // 打开裁剪器（用于上传后裁剪）
  const handleUploadAndCrop = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    setUploadedFile(file);

    // 创建预览 URL 并打开裁剪器
    const url = URL.createObjectURL(file);
    setSelectedImageUrl(url);
    setShowCropper(true);
  };

  // 选择图片 - 直接使用，不强制裁剪
  const handleItemClick = (item: MediaItem) => {
    onSelect(item.url);
    onClose();
  };

  // 裁剪完成后上传
  const handleCropComplete = async (croppedBlob: Blob) => {
    setUploading(true);
    setShowCropper(false);

    try {
      const formData = new FormData();
      formData.append("file", croppedBlob, "background.jpg");
      formData.append("folder", "backgrounds");

      const res = await fetch("/api/admin/media", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("上传失败");
      }

      const data = await res.json();
      console.log("[BackgroundImagePicker] 上传成功，返回数据:", data);
      success("背景图片已上传");

      // 返回裁剪后的图片 URL
      console.log("[BackgroundImagePicker] 调用 onSelect，URL:", data.data.url);
      onSelect(data.data.url);
      onClose();
    } catch (error) {
      console.error("上传失败:", error);
      showError("上传失败");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <Modal open={isOpen && !showCropper} onClose={onClose} title={title} size="xl">
        <div className="space-y-4">
          {/* 工具栏 */}
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="搜索图片..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full rounded-lg border border-gray-200 pl-9 pr-3 text-sm focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold"
              />
            </div>
            {/* 直接上传 */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
            {/* 上传并裁剪 */}
            <input
              ref={cropFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleUploadAndCrop(e.target.files)}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                leftIcon={<Upload className="h-4 w-4" />}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? "上传中..." : "上传图片"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                leftIcon={<Upload className="h-4 w-4" />}
                onClick={() => cropFileInputRef.current?.click()}
                disabled={uploading}
              >
                上传并裁剪
              </Button>
            </div>
          </div>

          {/* 图片网格 */}
          <div className="min-h-[300px] rounded-lg border border-gray-200 p-4">
            {loading ? (
              <div className="flex h-[300px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-brand-gold" />
              </div>
            ) : items.length === 0 ? (
              <div className="flex h-[300px] flex-col items-center justify-center text-gray-400">
                <ImageIcon className="mb-2 h-12 w-12" />
                <p>暂无图片</p>
                <p className="mt-1 text-sm">点击上传按钮添加图片</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "group relative aspect-square cursor-pointer overflow-hidden rounded-lg border-2 bg-gray-100 transition-all hover:border-brand-gold hover:shadow-md",
                      "border-transparent"
                    )}
                    onClick={() => handleItemClick(item)}
                  >
                    <Image
                      src={item.url}
                      alt={item.alt || item.filename}
                      fill
                      className="object-cover"
                      sizes="100px"
                    />
                    <div className="absolute inset-0 bg-black/0 transition-all group-hover:bg-black/10" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 分页 */}
          {total > 18 && (
            <div className="flex justify-center">
              <Pagination
                page={page}
                pageSize={18}
                total={total}
                onChange={setPage}
              />
            </div>
          )}
        </div>
      </Modal>

      {/* 图片裁剪器 */}
      <ImageCropper
        isOpen={showCropper}
        onClose={() => {
          setShowCropper(false);
          setSelectedImageUrl("");
        }}
        imageUrl={selectedImageUrl}
        onCropComplete={handleCropComplete}
        aspectRatio={aspectRatio}
        title="裁剪背景图片"
      />
    </>
  );
}


