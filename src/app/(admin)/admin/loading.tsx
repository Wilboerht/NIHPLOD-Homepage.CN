import { Loader2 } from "lucide-react";

export default function AdminLoading() {
  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center gap-3"
      role="status"
      aria-label="页面加载中"
    >
      <Loader2 className="h-7 w-7 animate-spin text-brand-primary" aria-hidden="true" />
      <p className="text-sm text-brand-charcoal/50">页面加载中...</p>
    </div>
  );
}
