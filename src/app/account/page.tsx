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
import { deferInEffect } from "@/hooks/deferInEffect";
import { levelDisplay } from "@/lib/membership";
import { validatePasswordStrength } from "@/components/website/auth/auth-utils";

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
  expiresAt?: string;
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

  // 密码设置模式：change = 旧密码修改；set = 首次设置（短信验证码，未设过密码的账号）
  const [pwdMode, setPwdMode] = useState<"change" | "set">("change");
  const [setCode, setSetCode] = useState("");
  const [countdown, setCountdown] = useState(0);

  // 短信倒计时
  useEffect(() => {
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [countdown]);

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
    deferInEffect(fetchProfile);
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

  /** 首次设置密码：发送短信验证码（复用 reset 场景） */
  const handleSendSetCode = async () => {
    if (countdown > 0 || !user) return;
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ phone: user.phone, type: "reset" }),
      });
      const data = await res.json();
      if (data.success) {
        setCountdown(60);
        setToast({ message: "验证码已发送", type: "success" });
      } else {
        setError(data.error?.message || "验证码发送失败");
      }
    } catch {
      setError("网络错误");
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }
    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      setError(strength.message || "密码强度不足");
      return;
    }
    setSaving(true);
    try {
      if (pwdMode === "change") {
        // 修改密码：需旧密码验证（成功后撤销其他设备会话）
        const res = await fetch("/api/user/password", {
          method: "PUT",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ oldPassword, newPassword, confirmPassword }),
        });
        const data = await res.json();
        if (data.success) {
          setOldPassword("");
          setNewPassword("");
          setConfirmPassword("");
          setToast({ message: "密码修改成功", type: "success" });
        } else if (data.error?.code === "PASSWORD_NOT_SET") {
          // 未设过密码的账号（如短信注册）：切换到短信验证码设置流程
          setPwdMode("set");
          setError("");
        } else {
          setError(data.error?.message || "修改失败");
        }
      } else {
        // 首次设置密码：短信验证码 + 新密码
        if (!/^\d{6}$/.test(setCode)) {
          setError("请输入 6 位数字验证码");
          setSaving(false);
          return;
        }
        const res = await fetch("/api/user/password/set", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ code: setCode, password: newPassword, confirmPassword }),
        });
        const data = await res.json();
        if (data.success) {
          setPwdMode("change");
          setSetCode("");
          setNewPassword("");
          setConfirmPassword("");
          setToast({ message: "密码设置成功", type: "success" });
        } else {
          setError(data.error?.message || "设置失败");
        }
      }
    } catch {
      setError("网络错误");
    } finally {
      setSaving(false);
    }
  };

  /** 强制下线指定设备（撤销对应会话，不允许撤销当前设备） */
  const handleForceLogoutDevice = async (deviceId: string) => {
    if (!window.confirm("确定要将该设备强制下线吗？")) return;
    try {
      const res = await fetch(`/api/user/devices/${deviceId}`, {
        method: "DELETE",
        headers: csrfHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setDevices((prev) => prev.filter((d) => d.id !== deviceId));
        setToast({ message: "已将该设备强制下线", type: "success" });
      } else {
        setError(data.error?.message || "强制下线失败");
      }
    } catch {
      setError("网络错误");
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

  // 切换 Tab 时加载对应数据（微任务延迟，避免 effect 内同步 setState）
  useEffect(() => {
    deferInEffect(() => {
      if (activeTab === "authorizations") fetchSessions();
      else if (activeTab === "devices") fetchDevices();
      else if (activeTab === "history") fetchLoginHistory();
    });
  }, [activeTab, fetchSessions, fetchDevices, fetchLoginHistory]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="mb-4 text-gray-500">请先登录</p>
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
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-xl font-bold text-gray-900">
            NIHPLOD
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">用户中心</span>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              退出登录
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="mx-auto max-w-4xl px-4 pt-8">
        <div className="flex rounded-t-xl border-b bg-white">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`border-b-2 px-6 py-3 text-sm font-medium transition-colors ${
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
        <div className="mb-8 rounded-b-xl bg-white p-6 shadow-sm">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-600">{error}</p>
              <button
                onClick={() => setError("")}
                className="mt-1 text-xs text-red-500 hover:underline"
              >
                关闭
              </button>
            </div>
          )}

          {/* Profile Tab */}
          {activeTab === "profile" && (
            <div data-testid="account-profile">
              <h2 className="mb-6 text-lg font-semibold">个人信息</h2>
              <div className="max-w-md space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">手机号</label>
                  <input
                    type="text"
                    value={user.phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2")}
                    disabled
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-gray-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">昵称</label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="设置昵称"
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">会员等级</label>
                  <p className="text-sm font-medium text-gray-900">
                    {levelDisplay(user.membershipLevel)}
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">积分</label>
                  <p className="text-sm text-gray-900">{user.totalPoints} 分</p>
                </div>
                <button
                  onClick={handleUpdateProfile}
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-6 py-2.5 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "保存中..." : "保存"}
                </button>
              </div>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === "security" && (
            <div data-testid="account-security">
              <h2 className="mb-6 text-lg font-semibold">安全设置</h2>
              <div className="max-w-md space-y-4">
                <h3 className="text-sm font-medium text-gray-700">
                  {pwdMode === "change" ? "修改密码" : "设置密码（短信验证）"}
                </h3>
                {pwdMode === "set" && (
                  <p className="text-xs text-gray-500">
                    您的账号尚未设置密码，请通过手机验证码设置。
                  </p>
                )}
                {pwdMode === "change" && (
                  <div>
                    <label className="mb-1 block text-sm text-gray-600">旧密码</label>
                    <input
                      type="password"
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
                {pwdMode === "set" && (
                  <div>
                    <label className="mb-1 block text-sm text-gray-600">短信验证码</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={setCode}
                        onChange={(e) => setSetCode(e.target.value.replace(/\D/g, ""))}
                        placeholder="6位验证码"
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={handleSendSetCode}
                        disabled={countdown > 0}
                        className="shrink-0 rounded-lg border border-blue-200 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                      >
                        {countdown > 0 ? `${countdown}s 后重发` : "发送验证码"}
                      </button>
                    </div>
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-sm text-gray-600">
                    {pwdMode === "change" ? "新密码" : "密码"}
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-600">
                    {pwdMode === "change" ? "确认新密码" : "确认密码"}
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={handleChangePassword}
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-6 py-2.5 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "提交中..." : pwdMode === "change" ? "修改密码" : "设置密码"}
                </button>
              </div>
            </div>
          )}

          {/* Authorizations Tab */}
          {activeTab === "authorizations" && (
            <div data-testid="account-authorizations">
              <h2 className="mb-6 text-lg font-semibold">授权管理</h2>
              <p className="mb-4 text-sm text-gray-500">
                管理已授权的第三方应用。撤销授权后，该应用将无法访问您的账户信息。
              </p>
              {sessions.length === 0 ? (
                <p className="text-sm text-gray-400">暂无已授权应用</p>
              ) : (
                <div className="space-y-3">
                  {sessions.map((s) => (
                    <div
                      key={s.clientId}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <div>
                        <p className="font-medium text-gray-900">{s.clientName || s.clientId}</p>
                        <p className="text-sm text-gray-500">
                          权限：{s.scopes.join(", ")} · 授权时间：
                          {new Date(s.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          if (
                            window.confirm(`确定要撤销 ${s.clientName || s.clientId} 的授权吗？`)
                          ) {
                            handleRevoke(s.clientId);
                          }
                        }}
                        className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
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
              <h2 className="mb-6 text-lg font-semibold">设备管理</h2>
              <p className="mb-4 text-sm text-gray-500">管理登录设备，可强制下线可疑设备。</p>
              {devices.length === 0 ? (
                <p className="text-sm text-gray-400">暂无设备记录</p>
              ) : (
                <div className="space-y-3">
                  {devices.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <div>
                        <p className="font-medium text-gray-900">{d.deviceName}</p>
                        <p className="text-sm text-gray-500">
                          IP: {d.ipAddress} · 登录时间：{new Date(d.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleForceLogoutDevice(d.id)}
                        className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
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
              <h2 className="mb-6 text-lg font-semibold">登录历史</h2>
              <p className="mb-4 text-sm text-gray-500">最近 20 条登录记录。</p>
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
                          <td className="py-2 pr-4 text-gray-700">
                            {new Date(r.createdAt).toLocaleString()}
                          </td>
                          <td className="py-2 pr-4 text-gray-700">
                            {r.type === "sms"
                              ? "验证码"
                              : r.type === "oauth"
                                ? "OAuth授权"
                                : "密码"}
                          </td>
                          <td className="py-2 pr-4 text-gray-500">{r.ipAddress}</td>
                          <td className="py-2">
                            <span
                              className={`rounded px-2 py-0.5 text-xs ${r.success ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                            >
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
        <div
          className="fixed bottom-6 right-6 z-50 animate-fade-in rounded-lg px-4 py-3 text-sm font-medium shadow-lg"
          style={{ background: toast.type === "success" ? "#065f46" : "#991b1b", color: "#fff" }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
