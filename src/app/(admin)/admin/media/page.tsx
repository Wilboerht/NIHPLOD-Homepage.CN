"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import {
  Upload,
  Search,
  Grid,
  List,
  Trash2,
  Check,
  Image as ImageIcon,
  Loader2,
  Download,
  Edit2,
  ZoomIn,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
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

type ViewMode = "grid" | "list";

export default function AdminMediaPage() {
  const { success, error: showError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 状态
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  // 预览/编辑弹窗
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);
  const [editItem, setEditItem] = useState<MediaItem | null>(null);
  const [editAlt, setEditAlt] = useState("");

  // 删除确认
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 获取媒体列表
  const fetchMedia = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: "24",
      });
      if (search) params.set("search", search);
      if (typeFilter !== "all") params.set("type", typeFilter);

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
  }, [page, search, typeFilter]);

  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

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
    setUploadProgress({ current: 0, total: files.length });

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
      setUploadProgress({ current: i + 1, total: files.length });
    }

    setUploading(false);
    setUploadProgress(null);

    if (successCount > 0) {
      success(`成功上传 ${successCount} 个文件`);
      fetchMedia();
    } else {
      showError("上传失败");
    }
  };

  // 拖放上传
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleUpload(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // 选择切换
  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  // 全选
  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((item) => item.id)));
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/media/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          action: "delete",
        }),
      });

      if (res.ok) {
        success(`已删除 ${selectedIds.size} 个文件`);
        setSelectedIds(new Set());
        fetchMedia();
      } else {
        throw new Error("删除失败");
      }
    } catch {
      showError("删除失败");
    } finally {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  // 更新媒体信息
  const handleUpdateMedia = async () => {
    if (!editItem) return;

    try {
      const res = await fetch(`/api/admin/media/${editItem.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alt: editAlt }),
      });

      if (res.ok) {
        success("更新成功");
        setEditItem(null);
        fetchMedia();
      } else {
        throw new Error("更新失败");
      }
    } catch {
      showError("更新失败");
    }
  };

  // 格式化文件大小
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // 格式化日期
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("zh-CN");
  };

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">媒体库</h1>
          <p className="mt-1 text-sm text-gray-500">
            共 {total} 个文件
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <Button
            leftIcon={<Upload className="h-4 w-4" />}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? `上传中 (${uploadProgress?.current}/${uploadProgress?.total})` : "上传文件"}
          </Button>
        </div>
      </div>

      {/* 工具栏 */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-white p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="搜索文件..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-60 rounded-lg border border-gray-200 pl-9 pr-3 text-sm focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold"
            />
          </div>
          <Select
            options={[
              { value: "all", label: "全部类型" },
              { value: "image", label: "图片" },
            ]}
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="w-32"
          />
        </div>

        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Trash2 className="h-4 w-4" />}
              onClick={() => setDeleteConfirm(true)}
              className="text-red-600 hover:bg-red-50"
            >
              删除 ({selectedIds.size})
            </Button>
          )}
          <div className="flex rounded-lg border border-gray-200">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "rounded-l-lg p-2",
                viewMode === "grid"
                  ? "bg-brand-gold text-white"
                  : "text-gray-500 hover:bg-gray-50"
              )}
            >
              <Grid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "rounded-r-lg p-2",
                viewMode === "list"
                  ? "bg-brand-gold text-white"
                  : "text-gray-500 hover:bg-gray-50"
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 拖放区域 / 媒体列表 */}
      <div
        className="min-h-[400px] rounded-xl bg-white p-6 shadow-sm"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-brand-gold" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-gray-400">
            <ImageIcon className="mb-4 h-16 w-16" />
            <p className="text-lg">暂无媒体文件</p>
            <p className="mt-2 text-sm">拖放文件到此处或点击上传按钮</p>
          </div>
        ) : viewMode === "grid" ? (
          /* 网格视图 */
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {items.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "group relative aspect-square cursor-pointer overflow-hidden rounded-lg border-2 bg-gray-100",
                  selectedIds.has(item.id)
                    ? "border-brand-gold"
                    : "border-transparent hover:border-gray-300"
                )}
                onClick={() => setPreviewItem(item)}
              >
                <Image
                  src={item.url}
                  alt={item.alt || item.filename}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
                />
                {/* 选择框 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelect(item.id);
                  }}
                  className={cn(
                    "absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded border-2 bg-white",
                    selectedIds.has(item.id)
                      ? "border-brand-gold bg-brand-gold text-white"
                      : "border-gray-300 opacity-0 group-hover:opacity-100"
                  )}
                >
                  {selectedIds.has(item.id) && <Check className="h-3 w-3" />}
                </button>
                {/* 操作按钮 */}
                <div className="absolute bottom-0 left-0 right-0 flex justify-end gap-1 bg-gradient-to-t from-black/50 to-transparent p-2 opacity-0 group-hover:opacity-100">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditItem(item);
                      setEditAlt(item.alt || "");
                    }}
                    className="rounded bg-white/90 p-1.5 text-gray-700 hover:bg-white"
                    title="编辑"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {/* 文件名 */}
                <div className="absolute bottom-0 left-0 right-0 truncate bg-gradient-to-t from-black/60 to-transparent px-2 py-1 text-xs text-white">
                  {item.filename}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* 列表视图 */
          <div className="space-y-2">
            {/* 表头 */}
            <div className="flex items-center gap-4 border-b border-gray-100 px-2 pb-2 text-sm font-medium text-gray-500">
              <input
                type="checkbox"
                checked={selectedIds.size === items.length && items.length > 0}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-gray-300"
              />
              <div className="w-12">预览</div>
              <div className="flex-1">文件名</div>
              <div className="w-24">大小</div>
              <div className="w-28">尺寸</div>
              <div className="w-24">上传日期</div>
              <div className="w-20">操作</div>
            </div>
            {/* 列表项 */}
            {items.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "flex items-center gap-4 rounded-lg px-2 py-2 hover:bg-gray-50",
                  selectedIds.has(item.id) && "bg-brand-gold/5"
                )}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(item.id)}
                  onChange={() => toggleSelect(item.id)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <div
                  className="relative h-10 w-12 cursor-pointer overflow-hidden rounded bg-gray-100"
                  onClick={() => setPreviewItem(item)}
                >
                  <Image
                    src={item.url}
                    alt={item.alt || item.filename}
                    fill
                    className="object-cover"
                    sizes="48px"
                  />
                </div>
                <div className="flex-1 truncate text-sm">{item.filename}</div>
                <div className="w-24 text-sm text-gray-500">{formatSize(item.size)}</div>
                <div className="w-28 text-sm text-gray-500">
                  {item.width && item.height ? `${item.width} × ${item.height}` : "-"}
                </div>
                <div className="w-24 text-sm text-gray-500">{formatDate(item.createdAt)}</div>
                <div className="flex w-20 gap-1">
                  <button
                    onClick={() => setPreviewItem(item)}
                    className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    title="预览"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      setEditItem(item);
                      setEditAlt(item.alt || "");
                    }}
                    className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    title="编辑"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 分页 */}
      {total > 20 && (
        <div className="flex justify-center">
          <Pagination
            page={page}
            pageSize={20}
            total={total}
            onChange={setPage}
          />
        </div>
      )}

      {/* 预览弹窗 */}
      <Modal
        open={!!previewItem}
        onClose={() => setPreviewItem(null)}
        title="图片预览"
        size="xl"
      >
        {previewItem && (
          <div className="space-y-4">
            <div className="relative mx-auto max-h-[60vh] overflow-hidden rounded-lg bg-gray-100">
              <Image
                src={previewItem.url}
                alt={previewItem.alt || previewItem.filename}
                width={previewItem.width || 800}
                height={previewItem.height || 600}
                className="mx-auto max-h-[60vh] w-auto object-contain"
              />
            </div>
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">文件名</span>
                <span>{previewItem.filename}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">大小</span>
                <span>{formatSize(previewItem.size)}</span>
              </div>
              {previewItem.width && previewItem.height && (
                <div className="flex justify-between">
                  <span className="text-gray-500">尺寸</span>
                  <span>{previewItem.width} × {previewItem.height}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">URL</span>
                <span className="truncate max-w-xs">{previewItem.url}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Download className="h-4 w-4" />}
                onClick={() => window.open(previewItem.url, "_blank")}
              >
                下载
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(previewItem.url);
                  success("已复制 URL");
                }}
              >
                复制 URL
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 编辑弹窗 */}
      <Modal
        open={!!editItem}
        onClose={() => setEditItem(null)}
        title="编辑媒体信息"
      >
        {editItem && (
          <div className="space-y-4">
            <div className="relative mx-auto h-32 w-32 overflow-hidden rounded-lg bg-gray-100">
              <Image
                src={editItem.url}
                alt={editItem.alt || editItem.filename}
                fill
                className="object-cover"
              />
            </div>
            <Input
              label="替代文本 (Alt)"
              value={editAlt}
              onChange={(e) => setEditAlt(e.target.value)}
              placeholder="描述图片内容，用于无障碍和 SEO"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditItem(null)}>
                取消
              </Button>
              <Button onClick={handleUpdateMedia}>保存</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 删除确认 */}
      <ConfirmDialog
        open={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        onConfirm={handleBatchDelete}
        title="确认删除"
        description={`确定要删除选中的 ${selectedIds.size} 个文件吗？此操作无法撤销。`}
        confirmText="删除"
        loading={deleting}
        type="danger"
      />
    </div>
  );
}
