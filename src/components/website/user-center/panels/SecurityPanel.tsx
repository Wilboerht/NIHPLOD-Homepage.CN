"use client";

/**
 * 密码管理表单（共享）
 * 修改密码（旧密码验证）+ 首次设置密码（短信验证码，未设过密码的账号）
 *
 * 纯表单组件，不含面板外壳：由个人信息面板（ProfilePanel）以行内展开方式
 * 承载，供弹窗等外壳复用。
 * 取数统一走 fetchWithAuth：写操作自动附带 CSRF Token，401 自动刷新重试；
 * 刷新最终失败（UnauthorizedError）时静默交给 AuthContext 的登录态管理处理。
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { fetchWithAuth, UnauthorizedError } from "@/lib/fetch-with-auth";
import { validatePasswordStrength } from "@/components/website/auth/auth-utils";

const inputClass =
  "w-full rounded-xl border border-stone-200 bg-white/60 px-4 py-3 text-sm text-stone-800 outline-none transition-colors placeholder:text-stone-300 focus:border-stone-400";

interface SecurityPanelProps {
  /** 初始模式：change = 旧密码修改；set = 首次设置（未设过密码的账号） */
  initialMode?: "change" | "set";
}

export function SecurityPanel({ initialMode = "change" }: SecurityPanelProps) {
  const { user, refreshUser } = useAuth();
  const { success: showSuccess, error: showError } = useToast();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // 密码设置模式：change = 旧密码修改；set = 首次设置（短信验证码，未设过密码的账号）
  const [pwdMode, setPwdMode] = useState<"change" | "set">(initialMode);
  const [setCode, setSetCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [saving, setSaving] = useState(false);

  // 短信倒计时
  useEffect(() => {
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [countdown]);

  /** 首次设置密码：发送短信验证码（复用 reset 场景） */
  const handleSendSetCode = async () => {
    if (countdown > 0 || !user?.phone) return;
    try {
      const res = await fetchWithAuth("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: user.phone, type: "reset" }),
      });
      const data = await res.json();
      if (data.success) {
        setCountdown(60);
        showSuccess("验证码已发送");
      } else {
        showError(data.error?.message || "验证码发送失败");
      }
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      showError("网络错误");
    }
  };

  const handleSubmit = async () => {
    if (newPassword !== confirmPassword) {
      showError("两次输入的密码不一致");
      return;
    }
    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      showError(strength.message || "密码强度不足");
      return;
    }
    setSaving(true);
    try {
      if (pwdMode === "change") {
        // 修改密码：需旧密码验证（成功后服务端撤销其他设备会话）
        const res = await fetchWithAuth("/api/user/password", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oldPassword, newPassword, confirmPassword }),
        });
        const data = await res.json();
        if (data.success) {
          setOldPassword("");
          setNewPassword("");
          setConfirmPassword("");
          showSuccess("密码修改成功");
          // 同步最新资料（hasPassword 等）
          void refreshUser?.();
        } else if (data.error?.code === "PASSWORD_NOT_SET") {
          // 未设过密码的账号（如短信注册）：切换到短信验证码设置流程
          setPwdMode("set");
        } else {
          showError(data.error?.message || "修改失败");
        }
      } else {
        // 首次设置密码：短信验证码 + 新密码
        if (!/^\d{6}$/.test(setCode)) {
          showError("请输入 6 位数字验证码");
          return;
        }
        const res = await fetchWithAuth("/api/user/password/set", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: setCode, password: newPassword, confirmPassword }),
        });
        const data = await res.json();
        if (data.success) {
          setPwdMode("change");
          setSetCode("");
          setNewPassword("");
          setConfirmPassword("");
          showSuccess("密码设置成功");
          // 同步最新资料（hasPassword 等）
          void refreshUser?.();
        } else {
          showError(data.error?.message || "设置失败");
        }
      }
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      showError("网络错误");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-md space-y-4">
      <h3 className="text-sm font-medium text-stone-700">
        {pwdMode === "change" ? "修改密码" : "设置密码（短信验证）"}
      </h3>
      {pwdMode === "set" && (
        <p className="text-xs text-stone-400">您的账号尚未设置密码，请通过手机验证码设置。</p>
      )}
      {pwdMode === "change" && (
        <div>
          <label htmlFor="old-password" className="mb-1 block text-xs text-stone-400">
            旧密码
          </label>
          <input
            id="old-password"
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            className={inputClass}
          />
        </div>
      )}
      {pwdMode === "set" && (
        <div>
          <label htmlFor="set-code" className="mb-1 block text-xs text-stone-400">
            短信验证码
          </label>
          <div className="flex gap-2">
            <input
              id="set-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={setCode}
              onChange={(e) => setSetCode(e.target.value.replace(/\D/g, ""))}
              placeholder="6位验证码"
              className={inputClass}
            />
            <button
              onClick={handleSendSetCode}
              disabled={countdown > 0}
              className="shrink-0 rounded-xl border border-stone-200 px-4 py-2 text-sm text-stone-600 transition-colors hover:bg-white/60 disabled:opacity-50"
            >
              {countdown > 0 ? `${countdown}s 后重发` : "发送验证码"}
            </button>
          </div>
        </div>
      )}
      <div>
        <label htmlFor="new-password" className="mb-1 block text-xs text-stone-400">
          {pwdMode === "change" ? "新密码" : "密码"}
        </label>
        <input
          id="new-password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="confirm-password" className="mb-1 block text-xs text-stone-400">
          {pwdMode === "change" ? "确认新密码" : "确认密码"}
        </label>
        <input
          id="confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={inputClass}
        />
      </div>
      <button
        onClick={handleSubmit}
        disabled={saving}
        className="rounded-full bg-stone-800 px-6 py-2.5 text-sm text-white transition-colors hover:bg-stone-700 disabled:opacity-50"
      >
        {saving ? "提交中..." : pwdMode === "change" ? "修改密码" : "设置密码"}
      </button>
    </div>
  );
}
