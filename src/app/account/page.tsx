/**
 * NIHPLOD 统一用户中心
 * /account
 *
 * Tab: 个人信息 | 安全设置 | 授权管理 | 设备管理 | 登录历史
 * 需要登录才能访问。
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/** 从 Cookie 读取 CSRF Token */
function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)__Host-csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
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

interface Device {
  id: string;
  deviceName: string;
  ipAddress: string;
  createdAt: string;
  lastActiveAt: string;
}

interface LoginRecord {
  id: string;
  identifier: string;
  type: string;
  success: boolean;
  reason: string | null;
  ipAddress: string;
  createdAt: string;
}

type Tab = "profile" | "security" | "authorizations" | "devices" | "history";

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [error, setError] = useState("");

  // 表单状态
  const [nickname, setNickname] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Toast 自动消失
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // 数据状态
  const [sessions, setSessions] = useState<OAuthSession[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loginHistory, setLoginHistory] = useState<LoginRecord[]>([]);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/user/profile");
      if (res.status === 401 || res.status === 403) {
        router.push("/login?return_to=/account");
        return;
      }
      const data = await res.json();
      if (data.success) {
        setUser(data.data.user);
        setNickname(data.data.user.nickname || "");
      } else {
        router.push("/login?return_to=/account");
      }
    } catch {
      setError("获取用户信息失败");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleUpdateProfile = async () => {
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
        setToast({ message: "保存成功", type: "success" });
      } else {
        setError(data.error?.message || "保存失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }
    if (newPassword.length < 8) {
      setError("密码长度不少于8位");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setOldPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setToast({ message: "密码修改成功", type: "success" });
      } else {
        setError(data.error?.message || "修改失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setSaving(false);
    }
  };

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/user/oauth/sessions");
      const data = await res.json();
      if (data.success) {
        setSessions(data.data);
      }
    } catch {
      // 静默失败
    }
  }, []);

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch("/api/user/devices");
      const data = await res.json();
      if (data.success) {
        setDevices(data.data);
      }
    } catch {
      // 静默失败
    }
  }, []);

  const fetchLoginHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/user/login-history");
      const data = await res.json();
      if (data.success) {
        setLoginHistory(data.data);
      }
    } catch {
      // 静默失败
    }
  }, []);

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
      }
    } catch {
      // 静默失败
    }
  };

  const handleLogout = async () => {
    const res = await fetch("/api/auth/logout", { method: "POST", headers: csrfHeaders() });
    if (res.ok) {
      router.push("/");
    }
  };

  // 切换 Tab 时加载对应数据
  useEffect(() => {
    if (activeTab === "authorizations") fetchSessions();
    else if (activeTab === "devices") fetchDevices();
    else if (activeTab === "history") fetchLoginHistory();
  }, [activeTab, fetchSessions, fetchDevices, fetchLoginHistory]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">请先登录</p>
          <Link href="/login?return_to=/account" className="text-blue-600 hover:underline">
            前往登录
          </Link>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "profile", label: "个人信息" },
    { key: "security", label: "安全设置" },
    { key: "authorizations", label: "授权管理" },
    { key: "devices", label: "设备管理" },
    { key: "history", label: "登录历史" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gray-900">NIHPLOD</Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">用户中心</span>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
            >
              退出登录
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-4xl mx-auto px-4 pt-8">
        <div className="flex border-b bg-white rounded-t-xl">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="bg-white rounded-b-xl shadow-sm p-6 mb-8">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-red-600">{error}</p>
              <button onClick={() => setError("")} className="text-xs text-red-500 hover:underline mt-1">关闭</button>
            </div>
          )}

          {/* Profile Tab */}
          {activeTab === "profile" && (
            <div data-testid="account-profile">
              <h2 className="text-lg font-semibold mb-6">个人信息</h2>
              <div className="space-y-4 max-w-md">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">手机号</label>
                  <input
                    type="text"
                    value={user.phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2")}
                    disabled
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">昵称</label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="设置昵称"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">会员等级</label>
                  <p className="text-sm text-gray-900 font-medium">
                    {user.membershipLevel === "DIAMOND" ? "💎 钻石会员" : user.membershipLevel === "GOLD" ? "🥇 金卡会员" : "🥈 银卡会员"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">积分</label>
                  <p className="text-sm text-gray-900">{user.totalPoints} 分</p>
                </div>
                <button
                  onClick={handleUpdateProfile}
                  disabled={saving}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "保存中..." : "保存"}
                </button>
              </div>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === "security" && (
            <div data-testid="account-security">
              <h2 className="text-lg font-semibold mb-6">安全设置</h2>
              <div className="space-y-4 max-w-md">
                <h3 className="text-sm font-medium text-gray-700">修改密码</h3>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">旧密码</label>
                  <input
                    type="password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">新密码</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">确认新密码</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <button
                  onClick={handleChangePassword}
                  disabled={saving}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "修改中..." : "修改密码"}
                </button>
              </div>
            </div>
          )}

          {/* Authorizations Tab */}
          {activeTab === "authorizations" && (
            <div data-testid="account-authorizations">
              <h2 className="text-lg font-semibold mb-6">授权管理</h2>
              <p className="text-sm text-gray-500 mb-4">
                管理已授权的第三方应用。撤销授权后，该应用将无法访问您的账户信息。
              </p>
              {sessions.length === 0 ? (
                <p className="text-sm text-gray-400">暂无已授权应用</p>
              ) : (
                <div className="space-y-3">
                  {sessions.map((s) => (
                    <div key={s.clientId} className="border rounded-lg p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{s.clientName || s.clientId}</p>
                        <p className="text-sm text-gray-500">
                          权限：{s.scopes.join(", ")} · 授权时间：{new Date(s.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          if (window.confirm(`确定要撤销 ${s.clientName || s.clientId} 的授权吗？`)) {
                            handleRevoke(s.clientId);
                          }
                        }}
                        className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                      >
                        撤销授权
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Devices Tab */}
          {activeTab === "devices" && (
            <div data-testid="account-devices">
              <h2 className="text-lg font-semibold mb-6">设备管理</h2>
              <p className="text-sm text-gray-500 mb-4">管理登录设备，可强制下线可疑设备。</p>
              {devices.length === 0 ? (
                <p className="text-sm text-gray-400">暂无设备记录</p>
              ) : (
                <div className="space-y-3">
                  {devices.map((d) => (
                    <div key={d.id} className="border rounded-lg p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{d.deviceName}</p>
                        <p className="text-sm text-gray-500">
                          IP: {d.ipAddress} · 登录时间：{new Date(d.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <button
                        onClick={() => setError("暂不支持该功能，请联系客服")}
                        className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                      >
                        强制下线
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Login History Tab */}
          {activeTab === "history" && (
            <div data-testid="account-login-history">
              <h2 className="text-lg font-semibold mb-6">登录历史</h2>
              <p className="text-sm text-gray-500 mb-4">最近 20 条登录记录。</p>
              {loginHistory.length === 0 ? (
                <p className="text-sm text-gray-400">暂无登录记录</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-2 pr-4 font-medium text-gray-600">时间</th>
                        <th className="py-2 pr-4 font-medium text-gray-600">方式</th>
                        <th className="py-2 pr-4 font-medium text-gray-600">IP</th>
                        <th className="py-2 font-medium text-gray-600">结果</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loginHistory.map((r, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2 pr-4 text-gray-700">{new Date(r.createdAt).toLocaleString()}</td>
                          <td className="py-2 pr-4 text-gray-700">{r.type === "sms" ? "验证码" : r.type === "oauth" ? "OAuth授权" : "密码"}</td>
                          <td className="py-2 pr-4 text-gray-500">{r.ipAddress}</td>
                          <td className="py-2">
                            <span className={`px-2 py-0.5 rounded text-xs ${r.success ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                              {r.success ? "成功" : "失败"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-fade-in"
          style={{ background: toast.type === "success" ? "#065f46" : "#991b1b", color: "#fff" }}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
