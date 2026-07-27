/**
 * 嵌入式用户中心（精简版）
 * /account/embed
 *
 * 适合 iframe 嵌入到子项目中。
 * 去除导航头/尾，仅保留内容区。
 * 通过 postMessage 与父窗口通信。
 *
 * 通信协议：
 * - NIHPLOD_SSO_READY: iframe 加载完成
 * - NIHPLOD_SSO_LOGOUT: 用户在主站登出
 * - NIHPLOD_SSO_REVOKE: 用户撤销授权
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

/** 主站 URL，用于 postMessage targetOrigin 校验 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://nihplod.cn";

/** 从 Cookie 读取 CSRF Token */
function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)__Host-csrf_token=([^;]*)/);
  return match ? match[1] : "";
}

/** 生成带 CSRF header 的请求头 */
function csrfHeaders(extra?: Record<string, string>): Record<string, string> {
  return { "X-CSRF-Token": getCsrfToken(), ...extra };
}

interface UserProfile {
  id: string;
  phone: string;
  nickname: string | null;
  avatar: string | null;
  membershipLevel: string;
  totalPoints: number;
}

interface OAuthSession {
  clientId: string;
  clientName: string;
  scopes: string[];
  createdAt: string;
}

type Tab = "profile" | "authorizations";

export default function EmbedAccountPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [error, setError] = useState("");
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);
  const [sessions, setSessions] = useState<OAuthSession[]>([]);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/user/profile");
      const data = await res.json();
      if (data.success) {
        setUser(data.data.user);
        setNickname(data.data.user.nickname || "");
      } else {
        setError("请先登录");
      }
    } catch {
      setError("获取用户信息失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/user/oauth/sessions");
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setSessions(data.data);
      }
    } catch {
      // 授权列表加载失败不阻断主流程
    }
  }, []);

  useEffect(() => {
    fetchProfile();
    fetchSessions();

    // 通知父窗口 iframe 已加载完成
    if (window.parent !== window) {
      window.parent.postMessage({ type: "NIHPLOD_SSO_READY" }, APP_URL);
    }
  }, [fetchProfile, fetchSessions]);

  const handleSaveNickname = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ nickname }),
      });
      const data = await res.json();
      if (data.success) {
        setUser((prev) => (prev ? { ...prev, nickname } : prev));
        setError("");
      } else {
        setError(data.error?.message || "保存失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (clientId: string) => {
    try {
      const res = await fetch("/api/user/oauth/revoke", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      if (data.success) {
        setSessions((prev) => prev.filter((s) => s.clientId !== clientId));
        // 通知父窗口用户撤销了授权
        if (window.parent !== window) {
          window.parent.postMessage({ type: "NIHPLOD_SSO_REVOKE", clientId }, APP_URL);
        }
      }
    } catch {
      setError("撤销失败");
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", headers: csrfHeaders() });
    // 通知父窗口用户已登出
    if (window.parent !== window) {
      window.parent.postMessage({ type: "NIHPLOD_SSO_LOGOUT" }, APP_URL);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500 text-sm">{error || "请先登录"}</p>
        <a href="/login" target="_top" className="text-blue-600 text-sm hover:underline mt-2 inline-block">
          前往登录
        </a>
      </div>
    );
  }

  return (
    <div className="p-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-2 mb-3">
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b mb-4">
        <button
          onClick={() => setActiveTab("profile")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "profile"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          个人信息
        </button>
        <button
          onClick={() => setActiveTab("authorizations")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "authorizations"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          授权管理
        </button>
      </div>

      {/* Profile Tab */}
      {activeTab === "profile" && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">手机号</label>
            <p className="text-sm text-gray-900">
              {user.phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2")}
            </p>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">昵称</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 outline-none"
              />
              <button
                onClick={handleSaveNickname}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "保存中" : "保存"}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">会员等级</label>
            <p className="text-sm text-gray-900">
              {user.membershipLevel === "DIAMOND" ? "💎 钻石会员" : user.membershipLevel === "GOLD" ? "🥇 金卡会员" : "🥈 银卡会员"}
            </p>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">积分</label>
            <p className="text-sm text-gray-900">{user.totalPoints} 分</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
          >
            退出登录
          </button>
        </div>
      )}

      {/* Authorizations Tab */}
      {activeTab === "authorizations" && (
        <div>
          {sessions.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">暂无授权记录</p>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => (
                <div key={s.clientId} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{s.clientName}</p>
                    <p className="text-xs text-gray-500">
                      授权时间: {new Date(s.createdAt).toLocaleDateString("zh-CN")}
                    </p>
                    <p className="text-xs text-gray-400">
                      权限: {s.scopes.join(", ")}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRevoke(s.clientId)}
                    className="px-3 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50"
                  >
                    撤销
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
