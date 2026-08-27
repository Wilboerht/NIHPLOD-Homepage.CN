"use client";

/**
 * NIHPLOD 统一登录页
 * /login
 *
 * 作为官网唯一的登录/注册/找回密码/授权确认/微信绑定入口。
 * 视觉与动效完全对齐旧版 AuthModal 弹窗：
 * - PC：右侧固定白色面板，从右侧滑入。
 * - 移动端：全屏米色面板，从右侧滑入。
 */
import { useState, useEffect, Suspense, useCallback } from "react";
import { useMounted } from "@/hooks/useMounted";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { m, AnimatePresence } from "framer-motion";
import { ArrowLeft, ChevronLeft } from "lucide-react";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { apiPost, ApiError } from "@/lib/api-client";
import { maskPhone } from "@/lib/mask-phone";
import { validatePasswordStrength, getErrorMessage } from "@/components/website/auth/auth-utils";
import { LoginForm } from "@/components/website/auth/LoginForm";
import { RegisterForm } from "@/components/website/auth/RegisterForm";
import { ForgotPasswordForm } from "@/components/website/auth/ForgotPasswordForm";
import { WechatBindForm } from "@/components/website/auth/WechatBindForm";

type AuthMode = "login" | "register" | "reset" | "consent" | "wechat-bind";

const VALID_MODES: AuthMode[] = ["login", "register", "reset", "consent", "wechat-bind"];

/**
 * consent 提交失败时的用户友好文案映射（按 error code）。
 * error_description 仅作兜底，且过滤纯英文技术文案，避免暴露实现细节。
 */
const CONSENT_ERROR_MESSAGES: Record<string, string> = {
  invalid_request: "授权请求参数有误，请返回应用重新发起授权",
  unauthorized: "登录状态已过期，请刷新页面后重试",
  account_disabled: "账户不可用，请联系客服",
  rate_limited: "操作过于频繁，请稍后重试",
  server_error: "服务器繁忙，请稍后重试",
  csrf_forbidden: "安全校验失败，请刷新页面后重试",
};

/**
 * 短信服务不可用（生产环境 mock 短信时 send-code 返回 503 + SMS_UNAVAILABLE）的统一提示。
 * 命中该错误码时不得提示"验证码已发送"，也不进入重发倒计时。
 */
const SMS_UNAVAILABLE_MESSAGE =
  "短信服务暂不可用，请使用密码登录或联系客服（service@nihplod.cn）";

function isSmsUnavailable(error: unknown): boolean {
  return error instanceof ApiError && error.code === "SMS_UNAVAILABLE";
}

function friendlyConsentError(data: { error?: string; error_description?: string }): string {
  if (data.error && CONSENT_ERROR_MESSAGES[data.error]) {
    return CONSENT_ERROR_MESSAGES[data.error];
  }
  const desc = data.error_description || "";
  // 仅当描述包含中文时才直接展示（服务端面向用户的文案已中文化）
  if (desc && /[一-龥]/.test(desc)) return desc;
  return "操作失败，请稍后重试";
}

function buildLoginUrl(
  mode: AuthMode,
  returnTo: string | null,
  extra: Record<string, string> = {}
) {
  const params = new URLSearchParams();
  if (mode !== "login") params.set("mode", mode);
  if (returnTo) params.set("return_to", returnTo);
  Object.entries(extra).forEach(([k, v]) => params.set(k, v));
  const query = params.toString();
  return `/login${query ? `?${query}` : ""}`;
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const toast = useToast();
  const { user, isLoading: authLoading, refreshUser } = useAuth();

  const returnTo = searchParams.get("return_to");
  const rawMode = searchParams.get("mode");
  const mode: AuthMode = VALID_MODES.includes(rawMode as AuthMode)
    ? (rawMode as AuthMode)
    : "login";
  const clientNameParam = searchParams.get("client_name");
  const clientName = (clientNameParam || "第三方应用")
    .replace(/[<>"'&`\/\\;]/g, "")
    .slice(0, 50);
  const oauthId = searchParams.get("oauth_id") || "";
  const oauthParamsFromUrl = searchParams.get("oauth_params") || "";
  // SSO 登录上下文：authorize 重定向登录页时透传 reauth / login_hint
  const reauth = searchParams.get("reauth") === "1";
  const loginHint = (searchParams.get("login_hint") || "").replace(/\D/g, "").slice(0, 11);
  const isSsoLogin = !!returnTo?.startsWith("/api/oauth/authorize");

  const mounted = useMounted();
  const [oauthParams, setOauthParams] = useState(oauthParamsFromUrl);
  const [oauthParamsError, setOauthParamsError] = useState(false);

  // 新格式（oauth_id）：从服务端取回 OAuth 参数；旧格式（oauth_params）：直接使用 URL 值
  useEffect(() => {
    if (oauthParams) return;
    if (!oauthId) return;
    fetch(`/api/oauth/authorize?oauth_id=${encodeURIComponent(oauthId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data?.params) setOauthParams(d.data.params as string);
        else setOauthParamsError(true);
      })
      .catch(() => setOauthParamsError(true));
  }, [oauthId, oauthParams]);
  // 确保 CSRF Cookie 已设置（首次访问 consent 页时可能缺失）
  useEffect(() => {
    fetch("/api/auth/csrf").catch(() => {});
  }, []);

  // consent 模式：拉取当前登录用户（authorize GET 已验证登录态，此处走会话接口取展示信息）
  const [consentUser, setConsentUser] = useState<{
    nickname: string | null;
    phone: string;
  } | null>(null);
  useEffect(() => {
    if (mode !== "consent") return;
    fetch("/api/user/profile")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data?.user) {
          setConsentUser({
            nickname: d.data.user.nickname ?? null,
            phone: d.data.user.phone || "",
          });
        }
      })
      .catch(() => {});
  }, [mode]);

  // Login Fields
  // login_hint 预填手机号（仅当它是合法手机号格式时）
  const [loginPhone, setLoginPhone] = useState(() =>
    /^1[3-9]\d{9}$/.test(loginHint) ? loginHint : ""
  );
  const [loginPassword, setLoginPassword] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [loginMethod, setLoginMethod] = useState<"password" | "code">("password");
  const [loginCodeCountdown, setLoginCodeCountdown] = useState(0);
  const [loginCodeSending, setLoginCodeSending] = useState(false);

  const [loading, setLoading] = useState(false);

  // Register Fields
  const [regName, setRegName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regCode, setRegCode] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [regCodeSending, setRegCodeSending] = useState(false);
  const [regCountdown, setRegCountdown] = useState(0);

  // Forgot Password Fields
  const [forgotPhone, setForgotPhone] = useState("");
  const [forgotSubmitted, setForgotSubmitted] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetCountdown, setResetCountdown] = useState(0);

  const [showPassword, setShowPassword] = useState(false);
  const [mobileAgreed, setMobileAgreed] = useState(false);
  const [agreementShake, setAgreementShake] = useState(0);
  const [mobileForgotStep, setMobileForgotStep] = useState<
    "phone" | "code" | "password" | "success"
  >("phone");

  const [consentLoading, setConsentLoading] = useState(false);
  const [consentError, setConsentError] = useState("");

  const isSafeReturnTo = useCallback((url: string): boolean => {
    if (!url) return false;
    // 相对路径
    if (url.startsWith("/") && !url.startsWith("//")) return true;

    try {
      const parsed = new URL(url, window.location.href);
      // 拒绝危险 scheme
      if (!["http:", "https:"].includes(parsed.protocol)) return false;
      // 只允许同 origin
      return parsed.origin === window.location.origin;
    } catch {
      return false;
    }
  }, []);

  const navigateToReturnTo = useCallback(
    (rawReturnTo?: string | null) => {
      if (!rawReturnTo) {
        router.push("/");
        return;
      }
      let decoded: string;
      try {
        decoded = decodeURIComponent(rawReturnTo);
      } catch {
        router.push("/");
        return;
      }
      if (!isSafeReturnTo(decoded)) {
        router.push("/");
        return;
      }
      // 授权端点必须使用完整页面导航，确保 Cookie / middleware 状态正确切换
      if (decoded.startsWith("/api/oauth/authorize")) {
        window.location.assign(decoded);
        return;
      }
      router.push(decoded);
    },
    [router, isSafeReturnTo]
  );

  // 已登录用户直接访问 /login：重定向到 return_to（经安全校验）或首页。
  // 豁免 SSO 授权场景（return_to 指向 /api/oauth/authorize，或 URL 携带 oauth_id /
  // oauth_params / client_id / reauth）：这些场景往往是授权方要求重新认证或切换账号，
  // 重定向会打断 SSO reauth 流程。consent / wechat-bind 模式同样依赖登录态，一并豁免。
  useEffect(() => {
    if (authLoading || !user) return;
    if (mode === "consent" || mode === "wechat-bind") return;
    const isSsoContext =
      isSsoLogin || !!oauthId || !!oauthParamsFromUrl || reauth || !!searchParams.get("client_id");
    if (isSsoContext) return;
    navigateToReturnTo(returnTo);
  }, [
    authLoading,
    user,
    mode,
    isSsoLogin,
    oauthId,
    oauthParamsFromUrl,
    reauth,
    searchParams,
    returnTo,
    navigateToReturnTo,
  ]);

  const handleClose = useCallback(() => {
    // 返回时目标页抽屉保持收起
    try {
      sessionStorage.setItem("nihplod_drawer_return_collapsed", "1");
    } catch {
      /* sessionStorage 不可用时忽略 */
    }
    // SSO 授权场景：返回 = 取消授权。从 return_to 解析原 authorize 参数，
    // 经 /api/oauth/cancel 服务端校验 redirect_uri 归属后 302 回子项目 callback
    // （error=access_denied）。避免直接跳回 authorize 死循环或错误回到主站首页。
    if (returnTo?.startsWith("/api/oauth/authorize")) {
      try {
        const authorizeUrl = new URL(returnTo, window.location.origin);
        const clientId = authorizeUrl.searchParams.get("client_id");
        const redirectUri = authorizeUrl.searchParams.get("redirect_uri");
        const state = authorizeUrl.searchParams.get("state");
        if (clientId && redirectUri && state) {
          const cancelParams = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            state,
          });
          const popupNonce = authorizeUrl.searchParams.get("popup_nonce");
          if (popupNonce) cancelParams.set("popup_nonce", popupNonce);
          // 必须完整页面导航：cancel 端点 302 重定向到跨域子项目回调
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign(`/api/oauth/cancel?${cancelParams.toString()}`);
          return;
        }
      } catch {
        // 解析失败：回退到原有返回逻辑
      }
    }
    navigateToReturnTo(returnTo);
  }, [navigateToReturnTo, returnTo]);

  const switchMode = useCallback(
    (nextMode: AuthMode) => {
      // 模式切换只保留 oauth_id（新格式），不再把完整 oauth_params 写回 URL
      const extra: Record<string, string> = {};
      if (mode === "consent" && oauthId) {
        extra.oauth_id = oauthId;
      }
      router.replace(buildLoginUrl(nextMode, returnTo, extra));
    },
    [mode, oauthId, returnTo, router]
  );

  // 模式切换时重置表单状态与字段数据（渲染阶段同步，避免 effect 内 setState）
  const [prevMode, setPrevMode] = useState(mode);
  if (prevMode !== mode) {
    setPrevMode(mode);
    setLoading(false);
    setForgotSubmitted(false);
    setRegCodeSending(false);
    setRegCountdown(0);
    setResetCountdown(0);
    setMobileAgreed(false);
    setMobileForgotStep("phone");
    setLoginMethod("password");
    setLoginCode("");
    setLoginCodeCountdown(0);
    setLoginCodeSending(false);
    setConsentError("");
    setShowPassword(false);
    setLoginPhone("");
    setLoginPassword("");
    setRegName("");
    setRegPhone("");
    setRegCode("");
    setRegPassword("");
    setRegConfirmPassword("");
    setForgotPhone("");
    setResetCode("");
    setResetNewPassword("");
    setResetConfirmPassword("");
  }

  // Countdown timers
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (regCountdown > 0) {
      timer = setTimeout(() => setRegCountdown((prev) => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [regCountdown]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resetCountdown > 0) {
      timer = setTimeout(() => setResetCountdown((prev) => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resetCountdown]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (loginCodeCountdown > 0) {
      timer = setTimeout(() => setLoginCodeCountdown((prev) => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [loginCodeCountdown]);

  // Lock body scroll on mobile (same as modal)
  useEffect(() => {
    document.body.style.overflow = "hidden";
    if (isMobile) {
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.width = "100%";
      document.body.style.top = `-${scrollY}px`;
    }
    return () => {
      document.body.style.overflow = "unset";
      if (isMobile) {
        const scrollY = document.body.style.top;
        document.body.style.position = "";
        document.body.style.width = "";
        document.body.style.top = "";
        if (scrollY) {
          window.scrollTo(0, parseInt(scrollY) * -1);
        }
      }
    };
  }, [isMobile]);

  const handleAuthSuccess = async () => {
    try {
      await refreshUser(true);
    } catch {
      // refreshUser 失败时仍然继续导航——认证 Cookie 已由服务端设置
    }
    navigateToReturnTo(returnTo);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mobileAgreed) {
      setAgreementShake((n) => n + 1);
      toast.error("请先阅读并同意《用户协议》和《隐私政策》");
      return;
    }
    setLoading(true);
    try {
      if (loginMethod === "code") {
        await apiPost("/api/auth/login", { phone: loginPhone, code: loginCode });
      } else {
        await apiPost("/api/auth/login-password", { phone: loginPhone, password: loginPassword });
      }
      toast.success("欢迎回来！");
      await handleAuthSuccess();
    } catch (error) {
      // 密码过期（密码登录/短信登录均可能）：引导进入"忘记密码"短信重置闭环。
      // 同时提示短信不可用时的兜底渠道（生产 mock 短信场景下短信重置走不通）。
      if (error instanceof ApiError && error.code === "PASSWORD_EXPIRED") {
        toast.error(
          "密码已过期，请通过短信验证码重置密码；如无法接收短信验证码，请联系客服 service@nihplod.cn 人工处理"
        );
        handleForgotPassword();
      } else {
        toast.error(getErrorMessage(error, "登录失败，请检查账号密码"));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regPassword !== regConfirmPassword) {
      toast.error("两次密码输入不一致，请重新输入");
      return;
    }
    const passwordCheck = validatePasswordStrength(regPassword);
    if (!passwordCheck.valid) {
      toast.error(passwordCheck.message || "密码不符合要求");
      return;
    }
    if (!mobileAgreed) {
      setAgreementShake((n) => n + 1);
      toast.error("请先阅读并同意《用户协议》和《隐私政策》");
      return;
    }
    setLoading(true);
    try {
      await apiPost("/api/auth/register", {
        name: regName,
        phone: regPhone,
        code: regCode,
        password: regPassword,
        confirmPassword: regConfirmPassword,
      });
      toast.success("注册成功！");
      await handleAuthSuccess();
    } catch (error) {
      toast.error(getErrorMessage(error, "注册失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  };

  const handleWechatBind = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regPassword || regPassword.length === 0) {
      toast.error("请设置登录密码");
      return;
    }
    const passwordCheck = validatePasswordStrength(regPassword);
    if (!passwordCheck.valid) {
      toast.error(passwordCheck.message || "密码不符合要求");
      return;
    }
    setLoading(true);
    try {
      await apiPost("/api/auth/wechat/bind", {
        phone: regPhone,
        code: regCode,
        password: regPassword,
      });
      toast.success("绑定成功！");
      await handleAuthSuccess();
    } catch (error) {
      toast.error(getErrorMessage(error, "绑定失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  };

  const handleSendRegCode = async () => {
    if (!/^1[3-9]\d{9}$/.test(regPhone)) {
      toast.error("请输入正确的手机号");
      return;
    }
    setRegCodeSending(true);
    try {
      await apiPost("/api/auth/send-code", { phone: regPhone, type: "register" });
      toast.success("验证码已发送");
      setRegCountdown(60);
    } catch (error) {
      // SMS_UNAVAILABLE：生产环境 mock 短信，未真实发送，不能提示"已发送"也不进倒计时
      toast.error(
        isSmsUnavailable(error)
          ? SMS_UNAVAILABLE_MESSAGE
          : getErrorMessage(error, "发送失败，请稍后重试")
      );
    } finally {
      setRegCodeSending(false);
    }
  };

  const handleSendResetLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiPost("/api/auth/send-code", { phone: forgotPhone, type: "reset" });
      setForgotSubmitted(true);
      setResetCountdown(60);
      toast.success("重置验证码已发送");
    } catch (error) {
      toast.error(
        isSmsUnavailable(error)
          ? SMS_UNAVAILABLE_MESSAGE
          : getErrorMessage(error, "发送失败，请稍后重试")
      );
    } finally {
      setLoading(false);
    }
  };

  const handleMobileSendResetCode = async () => {
    if (!/^1[3-9]\d{9}$/.test(forgotPhone)) {
      toast.error("请输入正确的手机号");
      return;
    }
    setLoading(true);
    try {
      await apiPost("/api/auth/send-code", { phone: forgotPhone, type: "reset" });
      setResetCountdown(60);
      setMobileForgotStep("code");
      toast.success("重置验证码已发送");
    } catch (error) {
      toast.error(
        isSmsUnavailable(error)
          ? SMS_UNAVAILABLE_MESSAGE
          : getErrorMessage(error, "发送失败，请稍后重试")
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetNewPassword !== resetConfirmPassword) {
      toast.error("两次密码输入不一致，请重新输入");
      return;
    }
    const passwordCheck = validatePasswordStrength(resetNewPassword);
    if (!passwordCheck.valid) {
      toast.error(passwordCheck.message || "密码不符合要求");
      return;
    }
    setLoading(true);
    try {
      await apiPost("/api/auth/reset-password", {
        phone: forgotPhone,
        code: resetCode,
        password: resetNewPassword,
        confirmPassword: resetConfirmPassword,
      });
      toast.success("密码已重置，请登录");
      switchMode("login");
      setLoginPhone(forgotPhone);
      setResetCode("");
      setResetNewPassword("");
      setResetConfirmPassword("");
      setForgotSubmitted(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "重置失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  };

  const handleMobileResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetNewPassword !== resetConfirmPassword) {
      toast.error("两次密码输入不一致，请重新输入");
      return;
    }
    const passwordCheck = validatePasswordStrength(resetNewPassword);
    if (!passwordCheck.valid) {
      toast.error(passwordCheck.message || "密码不符合要求");
      return;
    }
    setLoading(true);
    try {
      await apiPost("/api/auth/reset-password", {
        phone: forgotPhone,
        code: resetCode,
        password: resetNewPassword,
        confirmPassword: resetConfirmPassword,
      });
      toast.success("密码已重置，请登录");
      setResetCode("");
      setResetNewPassword("");
      setResetConfirmPassword("");
      setMobileForgotStep("success");
    } catch (error) {
      toast.error(getErrorMessage(error, "重置失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  };

  const handleSendLoginCode = async () => {
    if (!/^1[3-9]\d{9}$/.test(loginPhone)) {
      toast.error("请输入正确的手机号");
      return;
    }
    setLoginCodeSending(true);
    try {
      await apiPost("/api/auth/send-code", { phone: loginPhone, type: "login" });
      setLoginCodeCountdown(60);
      toast.success("验证码已发送");
    } catch (error) {
      toast.error(
        isSmsUnavailable(error)
          ? SMS_UNAVAILABLE_MESSAGE
          : getErrorMessage(error, "发送失败，请稍后重试")
      );
    } finally {
      setLoginCodeSending(false);
    }
  };

  const handleForgotPassword = () => {
    switchMode("reset");
    setForgotSubmitted(false);
    setResetCode("");
    setResetNewPassword("");
    setResetConfirmPassword("");
    setMobileForgotStep("phone");
  };

  const handleConsent = async (action: "approve" | "deny") => {
    setConsentLoading(true);
    setConsentError("");
    try {
      const params = new URLSearchParams(oauthParams);
      const csrfMatch =
        typeof document !== "undefined"
          ? document.cookie.match(/(?:^|;\s*)__Host-csrf_token=([^;]*)/)
          : null;
      const csrfToken = csrfMatch ? decodeURIComponent(csrfMatch[1]) : "";
      const res = await fetch("/api/oauth/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // 标识 AJAX 请求：服务端将以 200 JSON 返回 redirectUrl（fetch 读不到 302 的 Location）
          "X-Requested-With": "XMLHttpRequest",
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        },
        body: JSON.stringify({
          action,
          // 携带 oauth_id 使服务端可校验参数与 GET 阶段存储值一致，并补齐 popup_nonce
          ...(oauthId ? { oauth_id: oauthId } : {}),
          client_id: params.get("client_id"),
          redirect_uri: params.get("redirect_uri"),
          scope: params.get("scope"),
          state: params.get("state"),
          code_challenge: params.get("code_challenge"),
          code_challenge_method: params.get("code_challenge_method"),
          nonce: params.get("nonce"),
          popup_nonce: params.get("popup_nonce"),
        }),
        redirect: "manual",
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("Location");
        if (location) {
          window.location.href = location;
          return;
        }
      }

      const data = await res.json();
      // AJAX 模式下服务端以 200 JSON 返回 redirectUrl（approve/deny 均是）
      if (data.success && data.data?.redirectUrl) {
        window.location.href = data.data.redirectUrl;
        return;
      }
      setConsentError(friendlyConsentError(data));
    } catch {
      setConsentError("网络错误");
    } finally {
      setConsentLoading(false);
    }
  };

  // consent 页"切换账号"：回到登录模式，登录成功后经 return_to 重新走 authorize（会生成新的 oauth_id）
  const handleSwitchAccount = () => {
    const authorizeReturnTo = oauthParams ? `/api/oauth/authorize?${oauthParams}` : returnTo;
    router.push(buildLoginUrl("login", authorizeReturnTo, { client_name: clientName }));
  };

  // consent 参数过期错误态"取消并返回应用"：oauth_id 已过期无法取回参数，
  // 利用 authorize 透传的 client_id/redirect_uri/state 走 cancel 端点（服务端重新校验归属）
  const handleCancelExpired = () => {
    const clientId = searchParams.get("client_id");
    const redirectUri = searchParams.get("redirect_uri");
    const stateParam = searchParams.get("state");
    if (clientId && redirectUri && stateParam) {
      const cancelParams = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        state: stateParam,
      });
      // 必须完整页面导航：cancel 端点 302 重定向到跨域子项目回调
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/api/oauth/cancel?${cancelParams.toString()}`);
      return;
    }
    router.push("/");
  };

  const handleSwitchToLogin = () => switchMode("login");
  const handleSwitchToRegister = () => switchMode("register");

  const renderForm = (variant: "pc" | "mobile") => {
    switch (mode) {
      case "login":
        return (
          <LoginForm
            variant={variant}
            loginPhone={loginPhone}
            loginPassword={loginPassword}
            loginCode={loginCode}
            loginMethod={loginMethod}
            showPassword={showPassword}
            loginCodeCountdown={loginCodeCountdown}
            loginCodeSending={loginCodeSending}
            mobileAgreed={mobileAgreed}
            agreementShake={agreementShake}
            loading={loading}
            onLoginPhoneChange={setLoginPhone}
            onLoginPasswordChange={setLoginPassword}
            onLoginCodeChange={setLoginCode}
            onShowPasswordToggle={() => setShowPassword(!showPassword)}
            onLoginMethodToggle={() => {
              setLoginMethod(loginMethod === "password" ? "code" : "password");
              setLoginCode("");
              setLoginPassword("");
            }}
            onMobileAgreedChange={setMobileAgreed}
            onSubmit={handleLogin}
            onSendLoginCode={handleSendLoginCode}
            onSwitchToRegister={handleSwitchToRegister}
            onForgotPassword={handleForgotPassword}
            // 第三方登录（微信/抖音）按钮暂不对用户开放，后端 OAuth 通道保留，留待后续拓展（传 onWechatLogin/onDouyinLogin 即可恢复）
          />
        );
      case "register":
        return (
          <RegisterForm
            variant={variant}
            regName={regName}
            regPhone={regPhone}
            regCode={regCode}
            regPassword={regPassword}
            regConfirmPassword={regConfirmPassword}
            showPassword={showPassword}
            regCodeSending={regCodeSending}
            regCountdown={regCountdown}
            mobileAgreed={mobileAgreed}
            agreementShake={agreementShake}
            loading={loading}
            onRegNameChange={setRegName}
            onRegPhoneChange={setRegPhone}
            onRegCodeChange={setRegCode}
            onRegPasswordChange={setRegPassword}
            onRegConfirmPasswordChange={setRegConfirmPassword}
            onShowPasswordToggle={() => setShowPassword(!showPassword)}
            onMobileAgreedChange={setMobileAgreed}
            onSubmit={handleRegister}
            onSendRegCode={handleSendRegCode}
            onSwitchToLogin={handleSwitchToLogin}
          />
        );
      case "reset":
        return (
          <ForgotPasswordForm
            variant={variant}
            forgotPhone={forgotPhone}
            forgotSubmitted={forgotSubmitted}
            resetCode={resetCode}
            resetNewPassword={resetNewPassword}
            resetConfirmPassword={resetConfirmPassword}
            showPassword={showPassword}
            resetCountdown={resetCountdown}
            mobileForgotStep={mobileForgotStep}
            loading={loading}
            onForgotPhoneChange={setForgotPhone}
            onResetCodeChange={setResetCode}
            onResetNewPasswordChange={setResetNewPassword}
            onResetConfirmPasswordChange={setResetConfirmPassword}
            onShowPasswordToggle={() => setShowPassword(!showPassword)}
            onSendResetLink={handleSendResetLink}
            onMobileSendResetCode={handleMobileSendResetCode}
            onResetPassword={handleResetPassword}
            onMobileResetPassword={handleMobileResetPassword}
            onSwitchToLogin={handleSwitchToLogin}
            onMobileForgotStepChange={setMobileForgotStep}
            toast={toast}
            setLoginPhone={setLoginPhone}
          />
        );
      case "wechat-bind":
        return (
          <WechatBindForm
            variant={variant}
            regPhone={regPhone}
            regCode={regCode}
            regPassword={regPassword}
            showPassword={showPassword}
            regCodeSending={regCodeSending}
            regCountdown={regCountdown}
            loading={loading}
            onRegPhoneChange={setRegPhone}
            onRegCodeChange={setRegCode}
            onRegPasswordChange={setRegPassword}
            onShowPasswordToggle={() => setShowPassword(!showPassword)}
            onSubmit={handleWechatBind}
            onSendRegCode={handleSendRegCode}
          />
        );
      case "consent":
      default:
        return null;
    }
  };

  const scopeDescriptions: Record<string, string> = {
    openid: "唯一用户标识（sub）",
    profile: "昵称、头像",
    phone: "手机号（脱敏后）",
    membership: "会员等级、积分",
    birthday: "生日",
  };

  const renderConsent = (variant: "pc" | "mobile") => {
    // 直接访问 /login?mode=consent（无 oauth_id / oauth_params）：参数缺失，显示错误态而非假 consent 页
    if (!oauthId && !oauthParams) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <p className="text-sm text-red-500">授权链接无效，请返回应用重新发起授权</p>
          <button
            onClick={() => router.push("/")}
            className="border border-brand-charcoal/25 px-6 py-2 text-sm font-light tracking-[0.12em] text-brand-charcoal transition-all hover:bg-brand-charcoal/[0.03]"
          >
            返回首页
          </button>
        </div>
      );
    }

    // oauth_id 参数仍在加载中或已失效
    if (oauthId && !oauthParams) {
      if (oauthParamsError) {
        return (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <p className="text-sm text-red-500">授权参数已过期或不存在，请返回应用重新发起授权</p>
            <div className="flex w-full max-w-[280px] flex-col gap-3">
              <button
                onClick={handleCancelExpired}
                className="bg-brand-charcoal py-3 text-sm font-light tracking-[0.12em] text-white transition-all hover:bg-brand-charcoal/90"
              >
                取消并返回应用
              </button>
              <button
                onClick={() => router.push("/")}
                className="border border-brand-charcoal/25 py-3 text-sm font-light tracking-[0.12em] text-brand-charcoal transition-all hover:bg-brand-charcoal/[0.03]"
              >
                返回首页
              </button>
            </div>
          </div>
        );
      }
      return (
        <div
          className={
            variant === "mobile"
              ? "flex flex-col items-center justify-center py-20"
              : "flex items-center justify-center py-20"
          }
        >
          <p className="text-gray-400">正在加载授权信息...</p>
        </div>
      );
    }

    const params = new URLSearchParams(oauthParams);
    const requestedScopes = (params.get("scope") || "openid")
      .split(" ")
      .map((s) => s.trim())
      .filter(Boolean);

    return (
      <div className={variant === "mobile" ? "flex flex-col gap-14" : ""}>
        {variant === "pc" && (
          <h1 className="mb-14 text-center text-[2rem] font-light tracking-[0.15em] text-brand-charcoal">
            授权登录
          </h1>
        )}
        {variant === "mobile" && (
          <div className="pb-4 pt-[6px] text-center">
            <h2 className="text-[24px] font-light tracking-[0.15em] text-brand-charcoal">
              授权登录
            </h2>
            <div className="mx-auto mt-2 w-[70px] border-b border-brand-charcoal" />
          </div>
        )}

        <div className="space-y-10">
          {/* 当前登录用户身份 + 切换账号 */}
          {consentUser && (
            <div className="flex items-center justify-between rounded-lg border border-brand-charcoal/10 px-4 py-3">
              <p className="text-sm text-brand-charcoal/80">
                当前账号：
                <strong>{consentUser.nickname || maskPhone(consentUser.phone)}</strong>
                {consentUser.nickname && consentUser.phone && (
                  <span className="ml-1 text-xs text-brand-charcoal/40">
                    {maskPhone(consentUser.phone)}
                  </span>
                )}
              </p>
              <button
                onClick={handleSwitchAccount}
                className="text-xs text-blue-600 hover:underline"
              >
                切换账号
              </button>
            </div>
          )}

          <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4">
            <p className="text-sm text-brand-charcoal/80">
              <strong>{clientName}</strong> 请求访问您的账户信息
            </p>
            {params.get("client_id") && (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-brand-charcoal/40">
                  查看应用 ID
                </summary>
                <p className="mt-1 text-xs text-brand-charcoal/40">
                  应用 ID: <code className="text-brand-charcoal/50">{params.get("client_id")}</code>
                </p>
              </details>
            )}
            <ul className="mt-2 space-y-1">
              {requestedScopes.map((scope) => (
                <li key={scope} className="flex items-start gap-2 text-xs text-brand-charcoal/70">
                  <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
                  <span>
                    <code className="rounded bg-blue-100 px-1 py-0.5 text-blue-700">{scope}</code>
                    {scopeDescriptions[scope] ? ` — ${scopeDescriptions[scope]}` : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {consentError && (
            <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-600">
              {consentError}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => handleConsent("deny")}
              disabled={consentLoading}
              aria-busy={consentLoading}
              className="flex-1 border border-brand-charcoal/25 py-3 text-sm font-light tracking-[0.12em] text-brand-charcoal transition-all hover:bg-brand-charcoal/[0.03] disabled:opacity-40"
            >
              拒绝
            </button>
            <button
              onClick={() => handleConsent("approve")}
              disabled={consentLoading}
              aria-busy={consentLoading}
              className="flex-1 bg-brand-charcoal py-3 text-sm font-light tracking-[0.12em] text-white transition-all hover:bg-brand-charcoal/90 disabled:opacity-40"
            >
              {consentLoading ? "处理中..." : "授权登录"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      {mounted && (
        <>
          {/* Backdrop (PC only) */}
          {!isMobile && (
            <m.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="fixed inset-0 z-[99998] bg-black/20 backdrop-blur-md"
            />
          )}

          {/* PC Panel */}
          {!isMobile && (
            <m.div
              key="pc-panel"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="fixed inset-y-0 right-0 z-[99999] hidden w-full flex-col bg-white lg:flex"
            >
              {/* Back button：login 模式返回 return_to（默认首页）；SSO 授权场景走取消授权（access_denied）；reset/register 返回登录 */}
              {mode !== "wechat-bind" && mode !== "consent" && (
                <button
                  onClick={mode === "login" ? handleClose : handleSwitchToLogin}
                  disabled={loading}
                  aria-label={
                    mode === "login"
                      ? returnTo?.startsWith("/api/oauth/authorize")
                        ? "取消登录"
                        : "返回首页"
                      : "返回登录"
                  }
                  className="absolute left-8 top-8 z-20 flex h-10 items-center gap-1.5 text-brand-charcoal/70 transition-colors hover:text-brand-charcoal/90"
                >
                  <ArrowLeft size={20} strokeWidth={1.5} />
                  <span className="text-[14px] font-light tracking-[0.15em]">返回</span>
                </button>
              )}

              {/* Content area */}
              <div className="flex flex-1 flex-col overflow-y-auto px-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="m-auto w-full max-w-[480px] py-12">
                  {/* Logo */}
                  <div className="mb-14 flex justify-center">
                    <Image
                      src="/images/NIHPLOD-logo.svg"
                      alt="NIHPLOD"
                      width={180}
                      height={52}
                      className="h-[52px] w-auto object-contain"
                      priority
                    />
                  </div>

                  <AnimatePresence mode="wait">
                    <m.div
                      key={mode}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                    >
                      {mode === "login" && isSsoLogin && clientNameParam && (
                        <div className="mb-8 rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-center">
                          <p className="text-sm text-brand-charcoal/80">
                            登录以继续使用 <strong>{clientName}</strong>
                          </p>
                          {reauth && (
                            <p className="mt-1 text-xs text-brand-charcoal/60">
                              应用要求重新验证身份，请重新登录
                            </p>
                          )}
                        </div>
                      )}
                      {mode === "consent" ? renderConsent("pc") : renderForm("pc")}
                    </m.div>
                  </AnimatePresence>
                </div>
              </div>
            </m.div>
          )}

          {/* Mobile Panel */}
          {isMobile && (
            <m.div
              key="mobile-panel"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="fixed inset-0 z-[99999] flex flex-col bg-[#F8F7F3] pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pl-4 pr-4 pt-[calc(1rem+env(safe-area-inset-top,0px))] lg:hidden"
            >
              {/* Mobile top bar */}
              <div className="relative flex h-[56px] w-full flex-shrink-0 items-center justify-center">
                {/* consent 模式隐藏返回箭头（与 PC 对齐），避免误触抛弃授权流程 */}
                {mode !== "consent" && (
                  <button
                    type="button"
                    aria-label={
                      mode === "reset"
                        ? "返回登录"
                        : returnTo?.startsWith("/api/oauth/authorize")
                          ? "取消登录"
                          : "返回"
                    }
                    onClick={
                      mode === "wechat-bind"
                        ? handleClose
                        : mode === "reset"
                          ? () => {
                              handleSwitchToLogin();
                              setMobileForgotStep("phone");
                            }
                          : handleClose
                    }
                    className="absolute bottom-0 left-0 top-0 flex items-center justify-center px-4 py-[10px]"
                  >
                    <ChevronLeft className="h-6 w-6 text-brand-charcoal" />
                  </button>
                )}
                {mode !== "login" && (
                  <Image
                    src="/images/NIHPLOD-logo.svg"
                    alt="NIHPLOD"
                    width={110}
                    height={28}
                    className="h-auto w-[110px] object-contain"
                  />
                )}
              </div>

              <div className="scrollbar-hide flex flex-1 flex-col overflow-y-auto">
                <div className="flex min-h-full flex-col px-6 before:flex-[1_0_0] before:content-[''] after:flex-[1_0_0] after:content-['']">
                  <AnimatePresence mode="wait">
                    <m.div
                      key={mode}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                    >
                      {mode === "login" && isSsoLogin && clientNameParam && (
                        <div className="mb-8 rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-center">
                          <p className="text-sm text-brand-charcoal/80">
                            登录以继续使用 <strong>{clientName}</strong>
                          </p>
                          {reauth && (
                            <p className="mt-1 text-xs text-brand-charcoal/60">
                              应用要求重新验证身份，请重新登录
                            </p>
                          )}
                        </div>
                      )}
                      {mode === "consent" ? renderConsent("mobile") : renderForm("mobile")}
                    </m.div>
                  </AnimatePresence>
                </div>
              </div>

              {/* Mobile footer */}
              <div className="mx-6 flex-shrink-0 pb-4 pt-4 text-center">
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[rgba(123,114,108,0.3)]">
                  &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
                </p>
              </div>
            </m.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-[#F8F7F3]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-charcoal/20 border-t-brand-charcoal" />
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
