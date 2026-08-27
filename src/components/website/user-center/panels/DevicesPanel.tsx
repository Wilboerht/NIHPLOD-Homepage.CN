"use client";

/**
 * 设备管理面板（共享）
 * 登录设备列表 + 强制下线（撤销对应会话，服务端不允许撤销当前设备）
 *
 * 抽取自原 /account 页面的设备管理 Tab，弹窗等外壳共用。
 * 取数统一走 fetchWithAuth：写操作自动附带 CSRF Token，401 自动刷新重试；
 * 刷新最终失败（UnauthorizedError）时静默交给 AuthContext 的登录态管理处理。
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, MonitorSmartphone } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { fetchWithAuth, UnauthorizedError } from "@/lib/fetch-with-auth";
import { deferInEffect } from "@/hooks/deferInEffect";

interface Device {
  id: string;
  deviceName: string;
  ipAddress: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt?: string;
}

export function DevicesPanel() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const { success: showSuccess, error: showError } = useToast();

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetchWithAuth("/api/user/devices");
      const data = await res.json();
      if (data.success) {
        setDevices(data.data);
      }
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      showError("加载设备列表失败");
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    deferInEffect(fetchDevices);
  }, [fetchDevices]);

  /** 强制下线指定设备（撤销对应会话，不允许撤销当前设备） */
  const handleForceLogout = async (deviceId: string) => {
    if (!window.confirm("确定要将该设备强制下线吗？")) return;
    try {
      const res = await fetchWithAuth(`/api/user/devices/${deviceId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setDevices((prev) => prev.filter((d) => d.id !== deviceId));
        showSuccess("已将该设备强制下线");
      } else {
        showError(data.error?.message || "强制下线失败");
      }
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      showError("网络错误");
    }
  };

  return (
    <div className="flex h-full flex-col pt-4 md:pt-10" data-testid="panel-devices">
      {/* 标题 - 移动端由弹窗全局 Header 管理 */}
      <div className="hidden flex-shrink-0 border-b border-stone-200/60 px-6 pb-6 md:flex md:px-16">
        <h2 className="text-xl font-medium tracking-wide text-stone-800">设备管理</h2>
      </div>

      <div className="scrollbar-hide flex-1 overflow-y-auto px-6 py-6 md:px-16">
        <p className="mb-4 text-sm text-stone-400">管理登录设备，可强制下线可疑设备。</p>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-stone-300" />
          </div>
        ) : devices.length === 0 ? (
          <p className="py-10 text-center text-sm text-stone-400">暂无设备记录</p>
        ) : (
          <div className="space-y-3">
            {devices.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-stone-200/60 bg-white/40 p-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <MonitorSmartphone className="h-5 w-5 shrink-0 text-stone-400" strokeWidth={1.5} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-stone-800">{d.deviceName}</p>
                    <p className="mt-0.5 truncate text-xs text-stone-400">
                      IP: {d.ipAddress} · 登录时间：{new Date(d.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleForceLogout(d.id)}
                  className="shrink-0 rounded-full border border-red-200 px-4 py-1.5 text-xs text-red-500 transition-colors hover:bg-red-50"
                >
                  强制下线
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
