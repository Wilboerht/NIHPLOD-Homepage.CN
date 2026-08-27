/**
 * 嵌入式用户中心（精简版）
 * /account/embed
 *
 * 适合 iframe 嵌入到子项目中。
 * 去除导航头/尾，仅保留内容区（裸面板，无弹窗遮罩/动画/焦点陷阱）。
 * 通过 postMessage 与父窗口通信。
 *
 * 通信协议（子项目依赖，不可变更）：
 * - NIHPLOD_SSO_READY: iframe 加载完成
 * - NIHPLOD_SSO_LOGOUT: 用户在主站登出
 * - NIHPLOD_SSO_REVOKE: 用户撤销授权
 *
 * 授权管理复用共享面板 AuthorizationsPanel（撤销成功后经 onRevoked
 * 回调向父窗口发 NIHPLOD_SSO_REVOKE）；个人信息保持 embed 原有行为：
 * 资料显示为主 + 昵称行内编辑 + 退出登录。
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { deferInEffect } from "@/hooks/deferInEffect";
import { levelDisplay } from "@/lib/membership";
import { apiGet, apiPost, apiPut } from "@/lib/api-client";
import { AuthorizationsPanel } from "@/components/website/user-center/panels/AuthorizationsPanel";
import { getParentTargetOrigin } from "./parent-origin";

/** 可选白名单：逗号分隔的允许父窗口 origin（未配置则不做白名单校验） */
const EMBED_ALLOWED_ORIGINS = process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS || "";

/**
 * 向父窗口发送 postMessage。
 * targetOrigin 从 document.referrer 推导（父窗口 origin），
 * 配置 NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS 时做白名单校验；
 * 校验失败不发送消息并 console.warn。
 */
function postToParent(message: Record<string, unknown>): void {
  if (typeof window === "undefined" || window.parent === window) return;
  // ancestorOrigins[0] 是直接父框架 origin，比 document.referrer 更可靠
  // （referrer 受 Referrer-Policy 与页面内部跳转影响，可能为空或变成自身 URL）
  const ancestorOrigin = window.location.ancestorOrigins?.[0] || "";
  const targetOrigin = getParentTargetOrigin(document.referrer, EMBED_ALLOWED_ORIGINS, ancestorOrigin);
  if (!targetOrigin) {
    console.warn("[SSO Embed] 父窗口 origin 无法推导或未通过白名单校验，跳过 postMessage", {
      referrer: document.referrer,
    });
    return;
  }
  window.parent.postMessage(message, targetOrigin);
}

interface UserProfile {
  id: string;
  phone: string;
  nickname: string | null;
  avatar: string | null;
  membershipLevel: string;
  totalPoints: number;
}

type Tab = "profile" | "authorizations";

export default function EmbedAccountPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [error, setError] = useState("");
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveHint, setSaveHint] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const data = await apiGet<{ user: UserProfile }>("/api/user/profile");
      setUser(data.user);
      setNickname(data.user.nickname || "");
    } catch {
      setError("请先登录");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    deferInEffect(fetchProfile);
    // 预获取 CSRF Token，确保写操作可用
    fetch("/api/auth/csrf").catch(() => {});

    // 通知父窗口 iframe 已加载完成
    postToParent({ type: "NIHPLOD_SSO_READY" });
  }, [fetchProfile]);

  const handleSaveNickname = async () => {
    setSaving(true);
    try {
      await apiPut("/api/user/profile", { nickname });
      setUser((prev) => (prev ? { ...prev, nickname } : prev));
      setError("");
      // 保存成功提示（2 秒后自动消失）
      setSaveHint("已保存");
      setTimeout(() => setSaveHint(""), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await apiPost("/api/auth/logout");
      // 刷新本地用户状态：登出后立即切换为未登录视图
      setUser(null);
      // 通知父窗口用户已登出
      postToParent({ type: "NIHPLOD_SSO_LOGOUT" });
    } catch {
      // 登出失败保持现状，不通知父窗口
    } finally {
      setLoggingOut(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-gray-500">{error || "请先登录"}</p>
        <a
          href="/login"
          target="_top"
          className="mt-2 inline-block text-sm text-blue-600 hover:underline"
        >
          前往登录
        </a>
      </div>
    );
  }

  return (
    <div className="p-4">
      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2">
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-4 flex border-b">
        <button
          onClick={() => setActiveTab("profile")}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "profile"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          个人信息
        </button>
        <button
          onClick={() => setActiveTab("authorizations")}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "authorizations"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          授权管理
        </button>
      </div>

      {/* Profile Tab（embed 保持原有行为：显示为主 + 昵称行内编辑 + 退出登录） */}
      {activeTab === "profile" && (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-gray-500">手机号</label>
            <p className="text-sm text-gray-900">
              {user.phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2")}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">昵称</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={handleSaveNickname}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "保存中" : "保存"}
              </button>
            </div>
            {saveHint && <p className="mt-1 text-xs text-green-600">{saveHint}</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">会员等级</label>
            <p className="text-sm text-gray-900">
              {levelDisplay(user.membershipLevel)}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">积分</label>
            <p className="text-sm text-gray-900">{user.totalPoints} 分</p>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full rounded-lg border border-red-200 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {loggingOut ? "退出中..." : "退出登录"}
          </button>
        </div>
      )}

      {/* Authorizations Tab：共享面板，撤销成功通知父窗口 */}
      {activeTab === "authorizations" && (
        <AuthorizationsPanel
          hideTitle
          onRevoked={(clientId) => postToParent({ type: "NIHPLOD_SSO_REVOKE", clientId })}
        />
      )}
    </div>
  );
}
