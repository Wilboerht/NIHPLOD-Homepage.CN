"use client";

import { useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  ImageIcon,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { apiRequest, getApiErrorMessage } from "@/lib/api-client";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const DEFAULT_SEAL_URL = "/api/admin/subsites/ba/certificates/seal/default";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

export interface BaCertificateSealFieldProps {
  value: string;
  onChange: (url: string) => void;
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function BaCertificateSealField({
  value,
  onChange,
  onUploadingChange,
  disabled = false,
  className,
}: BaCertificateSealFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [defaultSealFailed, setDefaultSealFailed] = useState(false);
  const [defaultSealVersion, setDefaultSealVersion] = useState(0);

  const hasCustomSeal = Boolean(value);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const setUploadingState = (next: boolean) => {
    setUploading(next);
    onUploadingChange?.(next);
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("签章仅支持 PNG/JPEG/WebP 图片");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("签章图片不能超过 5MB");
      return;
    }

    setUploadingState(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const data = await apiRequest<{ url: string }>(
        "/api/admin/subsites/ba/certificates/seal",
        { method: "POST", body: formData, timeoutMs: 60000 }
      );
      if (!mountedRef.current) return;
      if (!data.url || !data.url.startsWith("/uploads/")) {
        throw new Error("签章上传返回地址异常");
      }

      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const nextPreview = URL.createObjectURL(file);
      previewUrlRef.current = nextPreview;
      setPreviewUrl(nextPreview);
      setFileName(file.name);
      onChange(data.url);
    } catch (err) {
      if (mountedRef.current) {
        setError(getApiErrorMessage(err, "签章上传失败，请重试"));
      }
    } finally {
      if (mountedRef.current) {
        setUploadingState(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    }
  };

  const revertToDefault = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
    setFileName(null);
    setError(null);
    onChange("");
  };

  const retryDefaultSeal = () => {
    setDefaultSealFailed(false);
    setDefaultSealVersion((version) => version + 1);
  };

  const openFilePicker = () => {
    if (disabled || uploading) return;
    inputRef.current?.click();
  };

  return (
    <section
      className={cn("rounded-xl border border-brand-charcoal/10 bg-white p-4", className)}
      aria-label="证书签章"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-brand-charcoal">证书签章</h3>
          <p className="mt-0.5 text-xs text-ink-muted">
            {hasCustomSeal
              ? "当前证书将使用你上传的自定义签章。"
              : "未上传自定义签章时，证书将自动加盖系统默认公章。"}
          </p>
        </div>
        <Badge variant={hasCustomSeal ? "info" : "success"}>
          {hasCustomSeal ? "自定义" : "默认使用"}
        </Badge>
      </div>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-brand-charcoal/10 bg-white">
          {hasCustomSeal ? (
            previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="自定义签章预览"
                className="h-full w-full object-contain p-1"
              />
            ) : (
              <div className="flex flex-col items-center gap-1 text-ink-faint">
                <ImageIcon className="h-7 w-7" />
                <span className="text-2xs">已上传</span>
              </div>
            )
          ) : defaultSealFailed ? (
            <div className="flex flex-col items-center gap-1 text-ink-faint">
              <ShieldCheck className="h-7 w-7" />
              <span className="text-2xs">默认公章</span>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={defaultSealVersion}
              src={`${DEFAULT_SEAL_URL}?v=${defaultSealVersion}`}
              alt="系统默认公章预览"
              className="h-full w-full object-contain p-1"
              decoding="async"
              onError={() => setDefaultSealFailed(true)}
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          {hasCustomSeal ? (
            <>
              <p className="text-sm font-medium text-brand-charcoal">自定义签章</p>
              <p className="mt-0.5 truncate text-xs text-ink-muted">
                {fileName ?? "已保存的自定义签章"}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-brand-charcoal">系统默认公章</p>
              <p className="mt-0.5 text-xs text-ink-muted">
                旎柏（上海）商贸有限公司
              </p>
            </>
          )}

          {uploading && (
            <p
              className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted"
              aria-live="polite"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              签章上传中…
            </p>
          )}
          {error && (
            <p className="mt-1 text-xs text-status-danger-fg" role="alert">
              {error}
            </p>
          )}
          {!hasCustomSeal && defaultSealFailed && (
            <p className="mt-1 text-xs text-status-warning-fg">
              默认签章预览暂不可用，签发时仍会使用系统默认章。
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {hasCustomSeal ? (
          <>
            {previewUrl && (
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-brand-charcoal/70 transition-colors hover:bg-surface-hover hover:text-brand-charcoal"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                查看大图
              </a>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openFilePicker}
              disabled={disabled || uploading}
              loading={uploading}
              leftIcon={!uploading ? <Upload className="h-3.5 w-3.5" /> : undefined}
            >
              重新上传
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={revertToDefault}
              disabled={disabled || uploading}
              leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
            >
              恢复默认签章
            </Button>
          </>
        ) : (
          <>
            {!defaultSealFailed && (
              <a
                href={DEFAULT_SEAL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-brand-charcoal/70 transition-colors hover:bg-surface-hover hover:text-brand-charcoal"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                查看大图
              </a>
            )}
            {defaultSealFailed && (
              <Button type="button" variant="ghost" size="sm" onClick={retryDefaultSeal}>
                重试
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openFilePicker}
              disabled={disabled || uploading}
              loading={uploading}
              leftIcon={!uploading ? <Upload className="h-3.5 w-3.5" /> : undefined}
            >
              上传自定义签章
            </Button>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label="选择自定义签章图片"
        onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
        disabled={disabled || uploading}
      />
    </section>
  );
}
