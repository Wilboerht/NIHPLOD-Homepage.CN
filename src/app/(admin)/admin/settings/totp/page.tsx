"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import {
  Shield,
  ShieldCheck,
  AlertTriangle,
  Copy,
  Check,
  Loader2,
  Eye,
  EyeOff,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { FormSection } from "@/components/admin/FormSection";
import { PasswordRulesChecklist } from "@/components/ui/PasswordRulesChecklist";
import { useToast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { apiGet, apiPost, apiPut, ApiError } from "@/lib/api-client";
import { validatePasswordStrength } from "@/lib/password";
import { PageHeader } from "@/components/admin/PageHeader";
import { formatDateTimeNumeric } from "@/lib/format";
import { cn } from "@/lib/utils";

interface TOTPSetupData {
  qrCode: string;
  secret: string;
  backupCodes: string[];
}

interface TOTPStatusData {
  totpEnabled: boolean;
  totpEnabledAt: string | null;
  backupCodesRemaining: number;
}

export default function TOTPSettingsPage() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawReturnTo = searchParams.get("return_to") || "";
  // 只允许回到主站管理员 SSO 授权端点，避免开放重定向
  const returnTo = rawReturnTo.startsWith("/admin/sso/authorize") ? rawReturnTo : "";
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpEnabledAt, setTotpEnabledAt] = useState<string | null>(null);
  const [backupCodesRemaining, setBackupCodesRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusError, setStatusError] = useState(false);
  const [statusReloadKey, setStatusReloadKey] = useState(0);
  const [setupData, setSetupData] = useState<TOTPSetupData | null>(null);
  const [setupPassword, setSetupPassword] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [processing, setProcessing] = useState(false);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [showTotpSecret, setShowTotpSecret] = useState(false);
  const [backupSaved, setBackupSaved] = useState(false);
  // 重新生成备用码弹窗
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [regenPassword, setRegenPassword] = useState("");
  const [regenCode, setRegenCode] = useState("");
  const [regenCodes, setRegenCodes] = useState<string[] | null>(null);
  const [regenSaved, setRegenSaved] = useState(false);

  // 管理员自助改密
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordTotpCode, setPasswordTotpCode] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    const fetchStatus = async () => {
      setStatusError(false);
      try {
        const data = await apiGet<TOTPStatusData>("/api/admin/totp/status");
        setTotpEnabled(data.totpEnabled);
        setTotpEnabledAt(data.totpEnabledAt);
        setBackupCodesRemaining(data.backupCodesRemaining);
      } catch {
        setStatusError(true);
        toast.error("获取二次验证状态失败");
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, [toast, statusReloadKey]);

  const startSetup = async () => {
    // 幂等守卫：连按 Enter 不能重复创建密钥（后一次会覆盖前一次，导致二维码与库内不一致）
    if (processing) return;
    if (!setupPassword) {
      toast.error("请输入当前密码以验证身份");
      return;
    }
    setProcessing(true);
    try {
      const data = await apiPost<TOTPSetupData>("/api/admin/totp/setup", {
        password: setupPassword,
      });
      setSetupData(data);
      setSetupPassword("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "初始化失败");
    } finally {
      setProcessing(false);
    }
  };

  const verifySetup = async () => {
    if (!backupSaved) {
      toast.error("请先确认已安全保存备用码");
      return;
    }
    if (verifyCode.length !== 6) {
      toast.error("请输入6位验证码");
      return;
    }
    setProcessing(true);
    try {
      await apiPost("/api/admin/totp/verify-setup", { code: verifyCode });
      toast.success("二次验证已启用");
      setTotpEnabled(true);
      setTotpEnabledAt(new Date().toISOString());
      setBackupCodesRemaining(setupData?.backupCodes.length ?? 0);
      setSetupData(null);
      setVerifyCode("");
      setBackupSaved(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "验证失败");
    } finally {
      setProcessing(false);
    }
  };

  /** 校验输入后打开确认弹窗（关闭二次验证属高风险动作） */
  const requestDisable = () => {
    if (!disablePassword) {
      toast.error("请输入密码");
      return;
    }
    if (disableCode.trim().length < 6) {
      toast.error("请输入 6 位动态验证码或备用码");
      return;
    }
    setShowDisableConfirm(true);
  };

  const disableTOTP = async (): Promise<boolean> => {
    setProcessing(true);
    try {
      await apiPost("/api/admin/totp/disable", {
        password: disablePassword,
        totpCode: disableCode.trim(),
      });
      toast.success("二次验证已关闭");
      setTotpEnabled(false);
      setTotpEnabledAt(null);
      setBackupCodesRemaining(0);
      setDisablePassword("");
      setDisableCode("");
      return true;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "关闭失败");
      return false;
    } finally {
      setProcessing(false);
    }
  };

  /** 打开重新生成备用码弹窗（重置表单状态） */
  const openRegenerate = () => {
    setRegenPassword("");
    setRegenCode("");
    setRegenCodes(null);
    setRegenSaved(false);
    setShowRegenerate(true);
  };

  const closeRegenerate = () => {
    if (processing) return;
    setShowRegenerate(false);
    setRegenCodes(null);
    setRegenSaved(false);
  };

  const regenerateBackupCodes = async () => {
    if (processing) return;
    if (!regenPassword) {
      toast.error("请输入密码");
      return;
    }
    if (regenCode.trim().length < 6) {
      toast.error("请输入 6 位动态验证码或备用码");
      return;
    }
    setProcessing(true);
    try {
      const data = await apiPost<{ backupCodes: string[] }>("/api/admin/totp/backup-codes", {
        password: regenPassword,
        totpCode: regenCode.trim(),
      });
      setRegenCodes(data.backupCodes);
      setBackupCodesRemaining(data.backupCodes.length);
      setRegenPassword("");
      setRegenCode("");
      toast.success("备用码已重新生成，旧备用码已失效");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "重新生成失败");
    } finally {
      setProcessing(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("复制失败");
    }
  };

  /** 管理员自助改密：成功后服务端会递增 tokenVersion 并清除当前 Cookie，强制重新登录 */
  const handleChangePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordError("");

    if (!currentPassword) {
      setPasswordError("请输入当前密码");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("两次输入的新密码不一致");
      return;
    }
    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      setPasswordError(strength.message || "新密码不符合安全要求");
      return;
    }
    if (totpEnabled && passwordTotpCode.trim().length < 6) {
      setPasswordError("请输入当前验证器上的 6 位验证码或备用码");
      return;
    }

    setChangingPassword(true);
    try {
      await apiPut("/api/admin/me", {
        currentPassword,
        newPassword,
        ...(totpEnabled ? { totpCode: passwordTotpCode.trim() } : {}),
      });
      toast.success("密码已修改，请使用新密码重新登录");
      router.replace("/admin-login?passwordChanged=1");
      router.refresh();
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : "密码修改失败，请重试");
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  if (statusError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <p className="text-sm text-red-500">加载二次验证状态失败</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setLoading(true);
            setStatusReloadKey((key) => key + 1);
          }}
        >
          重试
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="二次验证设置" />

      {returnTo && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          {totpEnabled ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>二次验证已开启，可以继续访问测肤子站后台。</span>
              <button
                onClick={() => {
                  window.location.href = returnTo;
                }}
                className="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-800"
              >
                返回测肤子站
              </button>
            </div>
          ) : (
            <span>测肤子站要求开启二次验证，开启后即可返回并继续登录。</span>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-brand-charcoal/10 bg-white p-6">
        <div className="flex items-start gap-4">
          <div className={cn("rounded-full p-3", totpEnabled ? "bg-emerald-100" : "bg-amber-100")}>
            {totpEnabled ? (
              <ShieldCheck className="h-6 w-6 text-emerald-600" />
            ) : (
              <Shield className="h-6 w-6 text-amber-600" />
            )}
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-medium text-brand-charcoal">
              {totpEnabled ? "二次验证已启用" : "二次验证未启用"}
            </h2>
            <p className="mt-1 text-sm text-brand-charcoal/65">
              {totpEnabled
                ? "您的账号已启用基于 TOTP 的二次验证，登录时需要输入动态验证码。"
                : "启用二次验证后，登录时除了密码还需要输入 Authenticator 应用生成的 6 位动态验证码，大幅提升账号安全性。"}
            </p>
            {totpEnabled && (
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-brand-charcoal/70">
                <span>
                  绑定时间：
                  <span className="font-medium text-brand-charcoal">
                    {formatDateTimeNumeric(totpEnabledAt)}
                  </span>
                </span>
                <span>
                  剩余备用码：
                  <span className="font-medium text-brand-charcoal">{backupCodesRemaining}</span>
                  <span className="text-brand-charcoal/65"> 个</span>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <FormSection
        title="修改密码"
        description="修改成功后当前账号的全部会话会失效，需要使用新密码重新登录。"
      >
        <form noValidate onSubmit={handleChangePassword} className="max-w-sm space-y-3">
          <Input
            label="当前密码"
            required
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="请输入当前登录密码"
            autoComplete="current-password"
          />
          <Input
            label="新密码"
            required
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="请输入新密码"
            autoComplete="new-password"
          />
          <PasswordRulesChecklist password={newPassword} />
          <Input
            label="确认新密码"
            required
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="请再次输入新密码"
            autoComplete="new-password"
          />
          {totpEnabled && (
            <Input
              label="动态验证码 / 备用码"
              required
              value={passwordTotpCode}
              onChange={(e) => setPasswordTotpCode(e.target.value.trim())}
              placeholder="6 位验证码或备用码"
              autoComplete="one-time-code"
              hint="改密属于敏感操作，需要二次验证"
              className="font-mono"
            />
          )}
          {passwordError && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
            >
              {passwordError}
            </p>
          )}
          <Button
            type="submit"
            loading={changingPassword}
            disabled={!currentPassword || !newPassword || !confirmPassword}
          >
            修改密码
          </Button>
        </form>
      </FormSection>

      {!totpEnabled && !setupData && (
        <FormSection title="启用二次验证">
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void startSetup();
            }}
            className="max-w-sm space-y-3"
          >
            <Input
              label="当前密码"
              required
              type="password"
              value={setupPassword}
              onChange={(e) => setSetupPassword(e.target.value)}
              placeholder="请输入当前登录密码"
              autoComplete="current-password"
              hint="出于安全考虑，启用前需验证当前密码"
            />
            <Button type="submit" loading={processing} disabled={!setupPassword}>
              启用二次验证
            </Button>
          </form>
        </FormSection>
      )}

      {setupData && (
        <FormSection>
          <div className="mb-4 flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">请妥善保存以下信息</span>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <p className="text-sm font-medium text-brand-charcoal/80">
                1. 使用 Authenticator 应用扫描二维码
              </p>
              <div className="relative inline-block overflow-hidden rounded-lg border border-brand-charcoal/15">
                <Image src={setupData.qrCode} alt="TOTP QR Code" width={200} height={200} />
              </div>
              <div className="flex items-center gap-2">
                <code className="bg-brand-charcoal/8 rounded px-2 py-1 text-xs text-brand-charcoal/80">
                  {showTotpSecret ? setupData.secret : "••••••••••••••••"}
                </code>
                <Tooltip content={showTotpSecret ? "隐藏密钥" : "显示密钥"} side="top">
                  <button
                    type="button"
                    onClick={() => setShowTotpSecret(!showTotpSecret)}
                    aria-label={showTotpSecret ? "隐藏密钥" : "显示密钥"}
                    className="inline-flex text-brand-charcoal/65 hover:text-brand-charcoal"
                  >
                    {showTotpSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </Tooltip>
                <Tooltip content="复制密钥" side="top">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(setupData.secret, "secret")}
                    aria-label="复制密钥"
                    className="inline-flex text-brand-charcoal/65 hover:text-brand-charcoal"
                  >
                    {copied === "secret" ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </Tooltip>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-brand-charcoal/80">
                2. 备用码（仅显示一次，请保存）
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {setupData.backupCodes.map((code, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => copyToClipboard(code, `backup-${index}`)}
                    aria-label={`复制备用码 ${code}`}
                    className="hover:bg-brand-charcoal/8 flex cursor-pointer items-center justify-between rounded bg-brand-charcoal/[0.03] px-3 py-2 text-left font-mono text-xs text-brand-charcoal/80"
                  >
                    <span>{code}</span>
                    {copied === `backup-${index}` ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3 text-brand-charcoal/65" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void verifySetup();
            }}
            className="mt-6 space-y-4"
          >
            <label className="flex cursor-pointer items-start gap-2 text-sm text-brand-charcoal/80">
              <input
                type="checkbox"
                checked={backupSaved}
                onChange={(e) => setBackupSaved(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-brand-primary"
              />
              <span>
                我已安全保存以上备用码（备用码仅显示一次，丢失后无法找回，未保存将无法在验证器不可用时登录）
              </span>
            </label>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[12rem] flex-1">
                <Input
                  label="输入 6 位验证码完成绑定"
                  inputMode="numeric"
                  maxLength={6}
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                />
              </div>
              <Button
                type="submit"
                loading={processing}
                disabled={verifyCode.length !== 6 || !backupSaved}
              >
                确认启用
              </Button>
            </div>
          </form>
        </FormSection>
      )}

      {totpEnabled && (
        <FormSection
          title="备用码"
          description="备用码用于验证器不可用时登录，每个仅可使用一次。重新生成后旧备用码立即失效。"
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              leftIcon={<RefreshCw className="h-4 w-4" />}
              onClick={openRegenerate}
            >
              重新生成备用码
            </Button>
            <span className="text-sm text-brand-charcoal/65">
              当前剩余 {backupCodesRemaining} 个备用码
            </span>
          </div>
        </FormSection>
      )}

      {totpEnabled && (
        <FormSection
          title="关闭二次验证"
          description="关闭后登录不再需要动态验证码，账号安全性将降低。"
        >
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              requestDisable();
            }}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="min-w-[12rem] flex-1">
              <Input
                label="当前密码"
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                placeholder="请输入当前密码"
                autoComplete="current-password"
              />
            </div>
            <div className="min-w-[12rem] flex-1">
              <Input
                label="动态验证码 / 备用码"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
                placeholder="6 位验证码或备用码"
                autoComplete="one-time-code"
                className="font-mono"
              />
            </div>
            <Button
              type="submit"
              variant="danger"
              loading={processing}
              disabled={!disablePassword || disableCode.trim().length < 6}
            >
              关闭二次验证
            </Button>
          </form>
        </FormSection>
      )}

      {/* 重新生成备用码（一次性密钥弹窗：展示期间禁止遮罩/Esc/X 关闭） */}
      <Modal
        open={showRegenerate}
        onClose={closeRegenerate}
        title="重新生成备用码"
        size="lg"
        closeOnBackdrop={false}
        closeOnEscape={!regenCodes}
        showCloseButton={!regenCodes}
        footer={
          regenCodes ? (
            <div className="flex justify-end">
              <Button disabled={!regenSaved} onClick={closeRegenerate}>
                关闭
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="outline" onClick={closeRegenerate} disabled={processing}>
                取消
              </Button>
              <Button
                onClick={() => void regenerateBackupCodes()}
                loading={processing}
                disabled={!regenPassword || regenCode.trim().length < 6}
              >
                确认重新生成
              </Button>
            </div>
          )
        }
      >
        {regenCodes ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-medium">新备用码仅显示一次，旧备用码已失效</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {regenCodes.map((code, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => copyToClipboard(code, `regen-${index}`)}
                  aria-label={`复制备用码 ${code}`}
                  className="hover:bg-brand-charcoal/8 flex cursor-pointer items-center justify-between rounded bg-brand-charcoal/[0.03] px-3 py-2 text-left font-mono text-xs text-brand-charcoal/80"
                >
                  <span>{code}</span>
                  {copied === `regen-${index}` ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-3 w-3 text-brand-charcoal/65" />
                  )}
                </button>
              ))}
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={regenSaved}
                  onChange={(e) => setRegenSaved(e.target.checked)}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-amber-800">我已安全保存以上备用码</p>
                  <p className="mt-0.5 text-xs text-amber-600">
                    备用码仅显示一次，关闭后无法再次查看。未完成保存前请勿关闭。
                  </p>
                </div>
              </label>
            </div>
          </div>
        ) : (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void regenerateBackupCodes();
            }}
            className="space-y-3"
          >
            <Input
              label="当前密码"
              required
              type="password"
              value={regenPassword}
              onChange={(e) => setRegenPassword(e.target.value)}
              placeholder="请输入当前密码"
              autoComplete="current-password"
              data-autofocus
            />
            <Input
              label="动态验证码 / 备用码"
              required
              value={regenCode}
              onChange={(e) => setRegenCode(e.target.value)}
              placeholder="6 位验证码或备用码"
              autoComplete="one-time-code"
              className="font-mono"
              hint="重新生成后旧备用码立即失效，请谨慎操作"
            />
          </form>
        )}
      </Modal>

      {/* 关闭二次验证确认 */}
      <ConfirmDialog
        open={showDisableConfirm}
        onClose={() => setShowDisableConfirm(false)}
        onConfirm={async () => {
          const ok = await disableTOTP();
          if (ok) setShowDisableConfirm(false);
        }}
        title="关闭二次验证"
        description="关闭后登录不再需要动态验证码，账号安全性将降低。确定要关闭吗？"
        type="danger"
        confirmText="确认关闭"
        loading={processing}
      />
    </div>
  );
}
