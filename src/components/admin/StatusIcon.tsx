import { CircleCheck, CircleX, ShieldAlert, ShieldCheck, ShieldOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminStatusIconProps {
  status: string;
  /** 移动端没有表头时显示短文字 */
  showLabel?: boolean;
  className?: string;
}

/**
 * 管理员账号状态：
 * - 桌面表格：纯图标（表头提供语义）
 * - 移动卡片：图标 + 短文字
 */
export function AdminStatusIcon({ status, showLabel = false, className }: AdminStatusIconProps) {
  const enabled = status === "ACTIVE";
  const Icon = enabled ? CircleCheck : CircleX;
  const label = enabled ? "已启用" : "已禁用";
  const shortLabel = enabled ? "启用" : "禁用";

  return (
    <span
      title={label}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap",
        enabled ? "text-status-success-fg" : "text-status-danger-fg",
        className
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      {showLabel ? <span className="text-xs">{shortLabel}</span> : <span className="sr-only">{label}</span>}
    </span>
  );
}

interface TotpStatusIconProps {
  enabled: boolean;
  resetRequired: boolean;
  /** 移动端没有表头时显示短文字 */
  showLabel?: boolean;
  className?: string;
}

/**
 * 二次验证状态：
 * - 已绑定 / 未绑定：桌面纯图标
 * - 待重绑：始终保留文字（需要处理的异常状态）
 */
export function TotpStatusIcon({
  enabled,
  resetRequired,
  showLabel = false,
  className,
}: TotpStatusIconProps) {
  if (resetRequired) {
    return (
      <span
        title="待重新绑定"
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap text-status-warning-fg",
          className
        )}
      >
        <ShieldAlert className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
        <span className="text-xs">待重绑</span>
      </span>
    );
  }

  const label = enabled ? "已绑定" : "未绑定";
  const shortLabel = enabled ? "已绑定" : "未绑定";
  const Icon = enabled ? ShieldCheck : ShieldOff;

  return (
    <span
      title={label}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap",
        enabled ? "text-status-success-fg" : "text-status-danger-fg",
        className
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      {showLabel ? (
        <span className="text-xs">{shortLabel}</span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </span>
  );
}
