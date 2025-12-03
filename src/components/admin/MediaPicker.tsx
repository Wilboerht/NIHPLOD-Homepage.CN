"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import {
  Search,
  Upload,
  Check,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
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

interface MediaPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (url: string, alt?: string) => void;
  title?: string;
  multiple?: boolean;
  onSelectMultiple?: (items: { url: string; alt?: string }[]) => void;
}

export function MediaPicker({
  isOpen,
  onClose,
  onSelect,
  title = "选择图片",
  multiple = false,
  onSelectMultiple,
}: MediaPickerProps) {
  const { success, error: showError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
      setSelectedIds(new Set());
    }
  }, [isOpen, fetchMedia]);

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // 上传文件
  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);

    let successCount = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("folder", "media");

        const res = await fetch("/api/admin/media", {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          successCount++;
        }
      } catch (error) {
        console.error(`上传失败: ${file.name}`, error);
      }
    }

    setUploading(false);

    if (successCount > 0) {
      success(`成功上传 ${successCount} 个文件`);
      fetchMedia();
    } else {
      showError("上传失败");
    }
  };

  // 选择图片
  const handleItemClick = (item: MediaItem) => {
    if (multiple) {
      const newSelected = new Set(selectedIds);
      if (newSelected.has(item.id)) {
        newSelected.delete(item.id);
      } else {
        newSelected.add(item.id);
      }
      setSelectedIds(newSelected);
    } else {
      onSelect(item.url, item.alt || undefined);
      onClose();
    }
  };

  // 确认多选
  const handleConfirmMultiple = () => {
    if (!onSelectMultiple) return;
    const selectedItems = items
      .filter((item) => selectedIds.has(item.id))
      .map((item) => ({ url: item.url, alt: item.alt || undefined }));
    onSelectMultiple(selectedItems);
    onClose();
  };

  return (
    <Modal open={isOpen} onClose={onClose} title={title} size="xl">
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
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <Button
            size="sm"
            variant="outline"
            leftIcon={<Upload className="h-4 w-4" />}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "上传中..." : "上传"}
          </Button>
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
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {items.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "group relative aspect-square cursor-pointer overflow-hidden rounded-lg border-2 bg-gray-100",
                    selectedIds.has(item.id)
                      ? "border-brand-gold"
                      : "border-transparent hover:border-gray-300"
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
                  {multiple && selectedIds.has(item.id) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-brand-gold/30">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-gold text-white">
                        <Check className="h-4 w-4" />
                      </div>
                    </div>
                  )}
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

        {/* 底部操作 */}
        {multiple && (
          <div className="flex items-center justify-between border-t border-gray-200 pt-4">
            <span className="text-sm text-gray-500">
              已选择 {selectedIds.size} 张图片
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                取消
              </Button>
              <Button
                onClick={handleConfirmMultiple}
                disabled={selectedIds.size === 0}
              >
                确认选择
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

