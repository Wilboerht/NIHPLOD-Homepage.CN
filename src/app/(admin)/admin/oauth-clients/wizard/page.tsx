/**
 * 接入向导页面
 * /admin/oauth-clients/wizard
 *
 * 分步向导帮助子项目管理员完成 SSO 接入：
 * ① 填写应用名称和回调 URL
 * ② 选择数据权限（scopes）
 * ③ 生成 clientId + clientSecret
 * ④ 展示接入代码片段（Node.js / React / 通用 HTTP）
 * ⑤ 在线测试（模拟完整 SSO 流程）
 */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/admin/PageHeader";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { apiPost, apiGet, ApiError, getApiErrorMessage } from "@/lib/api-client";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  RefreshCw,
  Eye,
  EyeOff,
} from "lucide-react";

const STEP_TITLES = ["应用信息", "数据权限", "确认创建", "接入凭据", "连接测试"] as const;

/** 校验回调 URL（https、无 hash）；通过返回 null，否则返回错误文案 */
function validateRedirectUri(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "请输入回调 URL";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return "回调 URL 必须使用 https:// 协议";
    if (url.hash) return "回调 URL 不能包含 hash 片段";
  } catch {
    return "回调 URL 格式不正确";
  }
  return null;
}

interface ScopeDef {
  value: string;
  label: string;
  desc: string;
}

interface StepResult {
  clientId?: string;
  plainSecret?: string;
  client?: { name: string; redirectUris: string[]; scopes: string[] };
}

interface CreateClientWizardResponse {
  client: { clientId: string; name: string; redirectUris: string[]; scopes: string[] };
  plainSecret: string;
}

interface TestResultData {
  allPassed: boolean;
  steps: Array<{ step: string; status: string; durationMs: number; detail?: string }>;
  summary: string;
  totalDurationMs: number;
}

export default function OAuthWizardPage() {
  // 除 sso:clients:write（创建 Client）外还需 sso:clients:read：
  // 第②步调用的 /api/admin/oauth/scopes 要求 read 权限，
  // 仅有 write 无 read 的管理员会卡在第②步，嵌套门禁直接给出缺权限提示
  return (
    <RequirePermission permission="sso:clients:write">
      <RequirePermission permission="sso:clients:read">
        <OAuthWizardContent />
      </RequirePermission>
    </RequirePermission>
  );
}

function OAuthWizardContent() {
  const toast = useToast();
  const { requireTotp, totpModal } = useTotpConfirm();
  const router = useRouter();

  const withStepUp = async <T,>(action: () => Promise<T>): Promise<T | null> => {
    try {
      return await action();
    } catch (err) {
      if (!isTotpRequired(err)) throw err;
      const verified = await requireTotp(err instanceof ApiError ? err.code : undefined);
      if (!verified) return null;
      return await action();
    }
  };
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [appNameError, setAppNameError] = useState("");
  const [redirectUriError, setRedirectUriError] = useState("");
  const [createError, setCreateError] = useState("");
  const [testError, setTestError] = useState("");
  const appNameRef = useRef<HTMLInputElement>(null);
  const redirectUriRef = useRef<HTMLInputElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const initialStepRef = useRef(true);

  useEffect(() => {
    if (initialStepRef.current) {
      initialStepRef.current = false;
      return;
    }
    stepHeadingRef.current?.focus();
  }, [step]);

  // Step 1: App Info
  const [appName, setAppName] = useState("");
  const [redirectUri, setRedirectUri] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const wizardDirty = step < 4 && Boolean(appName.trim() || redirectUri.trim() || step > 1);
  const { confirmClose } = useUnsavedChanges(wizardDirty);

  // Step 2: Scopes
  const [selectedScopes, setSelectedScopes] = useState<string[]>(["openid", "profile"]);
  const [availableScopes, setAvailableScopes] = useState<ScopeDef[]>([]);
  const [scopesLoadFailed, setScopesLoadFailed] = useState(false);

  const loadScopes = useCallback(() => {
    apiGet<{ scopes: ScopeDef[] }>("/api/admin/oauth/scopes")
      .then((d) => {
        if (d.scopes) setAvailableScopes(d.scopes);
        setScopesLoadFailed(false);
      })
      .catch(() => {
        setScopesLoadFailed(true);
      });
  }, []);

  useEffect(() => {
    loadScopes();
  }, [loadScopes]);

  // Step 3: Result
  const [result, setResult] = useState<StepResult>({});

  // Step 4: Secret saved confirmation
  const [secretSaved, setSecretSaved] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  // Step 5: Test
  const [testResult, setTestResult] = useState<TestResultData | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  // 已生成 Secret 但未确认保存时，阻止意外关闭/刷新导致密钥丢失
  useEffect(() => {
    if (!result.plainSecret || secretSaved) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [result.plainSecret, secretSaved]);

  const toggleScope = (scope: string) => {
    if (scope === "openid") return; // openid 必选
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const validateStepOne = () => {
    const nameError = appName.trim() ? "" : "请输入应用名称";
    const uriError = validateRedirectUri(redirectUri) ?? "";
    setAppNameError(nameError);
    setRedirectUriError(uriError);
    if (nameError) {
      appNameRef.current?.focus();
      return false;
    }
    if (uriError) {
      redirectUriRef.current?.focus();
      return false;
    }
    return true;
  };

  const handleCreate = async () => {
    if (!validateStepOne() || loading) return;
    setCreateError("");

    setLoading(true);
    try {
      const data = await withStepUp(() =>
        apiPost<CreateClientWizardResponse>("/api/admin/oauth-clients", {
          name: appName.trim(),
          redirectUris: [redirectUri.trim()],
          scopes: selectedScopes,
          isPublic,
        })
      );
      if (data === null) return;

      setResult({
        clientId: data.client.clientId,
        plainSecret: data.plainSecret,
        client: data.client,
      });
      setShowSecret(false);
      setStep(4);
      toast.success("Client 创建成功");
    } catch (err) {
      setCreateError(getApiErrorMessage(err, "创建 Client 失败"));
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!result.clientId || !result.plainSecret || testLoading) return;
    setTestLoading(true);
    setTestResult(null);
    setTestError("");

    try {
      const data = await withStepUp(() =>
        apiPost<TestResultData>("/api/admin/oauth-clients/test", {
          clientId: result.clientId,
          clientSecret: result.plainSecret,
          redirectUri: redirectUri.trim(),
        })
      );
      if (data === null) return;

      setTestResult(data);
      const allPassed = data.allPassed ?? data.steps.every((s) => s.status === "passed");
      if (allPassed) {
        toast.success("连接测试全部通过！");
      } else {
        toast.warning("连接测试未完全通过，请检查配置");
      }
    } catch (error) {
      setTestError(getApiErrorMessage(error, "测试请求失败"));
    } finally {
      setTestLoading(false);
    }
  };

  const copyCode = async (text: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(text);
      toast.success("已复制");
    } catch {
      toast.error("复制失败，请手动选择复制");
    }
  };

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://nihplod.cn";

  const nodeCode = `// Node.js 接入代码
import { createTokenVerifier } from "@nihplod/sso-verify";

const verifier = createTokenVerifier({
  jwksUri: "${baseUrl}/api/oauth/jwks",
  audience: "${result.clientId || "YOUR_CLIENT_ID"}",
  issuer: "${baseUrl}",
  introspectionEndpoint: "${baseUrl}/api/oauth/introspect",
  clientId: "${result.clientId || "YOUR_CLIENT_ID"}",
  clientSecret: "YOUR_CLIENT_SECRET",
});

// 在 API 路由中验证 token
const payload = await verifier.verify(accessToken);
if (!payload) {
  return res.status(401).json({ error: "Unauthorized" });
}`;

  const reactCode = `// React 接入代码
// 1. 重定向用户到主站授权页面
const authUrl = new URL("${baseUrl}/api/oauth/authorize");
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("client_id", "${result.clientId || "YOUR_CLIENT_ID"}");
authUrl.searchParams.set("redirect_uri", "${redirectUri || "YOUR_REDIRECT_URI"}");
authUrl.searchParams.set("scope", "${selectedScopes.join(" ")}");
authUrl.searchParams.set("state", crypto.randomUUID());
// PKCE
const codeVerifier = crypto.randomUUID() + crypto.randomUUID();
const codeChallenge = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier))
  .then(buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, ""));
authUrl.searchParams.set("code_challenge", codeChallenge);
authUrl.searchParams.set("code_challenge_method", "S256");

// 2. 用户被重定向到: ${baseUrl}/login?return_to=...
window.location.href = authUrl.toString();

// 3. 在回调页面中，用授权码换取 token
// ⚠️ 浏览器端仅适用于 Public Client：不要携带 client_secret；
//    Confidential Client 的 token 交换必须放在服务端（带 client_secret）
const urlParams = new URLSearchParams(window.location.search);
const tokenRes = await fetch("${baseUrl}/api/oauth/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    code: urlParams.get("code"),
    client_id: "${result.clientId || "YOUR_CLIENT_ID"}",
    code_verifier: codeVerifier,
  }),
});
const tokens = await tokenRes.json();
// tokens.access_token, tokens.refresh_token, tokens.id_token

// 4. 获取用户信息
const userRes = await fetch("${baseUrl}/api/oauth/userinfo", {
  headers: { Authorization: \`Bearer \${tokens.access_token}\` },
});
const user = await userRes.json();`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="SSO 接入向导"
        description="按步骤完成应用信息、权限、凭据与连接测试"
        actions={
          <Button
            variant="outline"
            size="sm"
            leftIcon={<ArrowLeft className="h-4 w-4" />}
            onClick={() => {
              if (confirmClose()) router.push("/admin/oauth-clients");
            }}
          >
            退出向导
          </Button>
        }
      />

      {/* Steps indicator */}
      <ol className="mb-8 flex items-start" aria-label="接入步骤">
        {STEP_TITLES.map((title, index) => {
          const stepNumber = index + 1;
          const active = step === stepNumber;
          return (
            <li key={title} className="flex items-start">
              <div className="flex flex-col items-center gap-1">
                <div
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium",
                    step >= stepNumber
                      ? "bg-brand-primary text-white"
                      : "bg-surface-muted text-ink-muted"
                  )}
                >
                  {step > stepNumber ? <Check className="h-4 w-4" /> : stepNumber}
                </div>
                <span
                  className={cn(
                    "text-2xs",
                    active ? "font-medium text-brand-primary" : "text-ink-muted"
                  )}
                >
                  {title}
                </span>
              </div>
              {stepNumber < STEP_TITLES.length && (
                <div
                  aria-hidden="true"
                  className={cn(
                    "mx-1 mt-4 h-0.5 w-4 sm:mx-2 sm:w-10",
                    step > stepNumber ? "bg-brand-primary" : "bg-surface-active"
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* Step 1: App Info */}
      {step === 1 && (
        <div className="rounded-card border border-line bg-white p-4 sm:p-6">
          <h2 ref={stepHeadingRef} tabIndex={-1} className="mb-4 text-lg font-semibold outline-none">
            ① 填写应用信息
          </h2>
          <div className="max-w-md space-y-4">
            <Input
              ref={appNameRef}
              label="应用名称"
              required
              value={appName}
              error={appNameError}
              onChange={(e) => {
                setAppName(e.target.value);
                if (appNameError) setAppNameError("");
              }}
              placeholder="如：Advisor 顾问系统"
            />
            <Input
              ref={redirectUriRef}
              label="回调 URL"
              required
              value={redirectUri}
              error={redirectUriError}
              onChange={(e) => {
                setRedirectUri(e.target.value);
                if (redirectUriError) setRedirectUriError("");
              }}
              placeholder="https://smart.nihplod.cn/api/auth/callback"
              hint="用户授权后，主站将把授权码发送到此 URL。"
            />
            <div>
              <label className="mb-2 block text-sm font-medium text-brand-charcoal/70">
                应用类型
              </label>
              <div className="space-y-2">
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${!isPublic ? "border-brand-primary bg-brand-primary/5" : "border-line-strong hover:border-brand-charcoal/30"}`}
                >
                  <input
                    type="radio"
                    name="clientType"
                    checked={!isPublic}
                    onChange={() => setIsPublic(false)}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium text-brand-charcoal">Confidential Client</p>
                    <p className="text-xs text-ink-muted">
                      Next.js / 服务端应用，后端保密 client_secret
                    </p>
                  </div>
                </label>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${isPublic ? "border-brand-primary bg-brand-primary/5" : "border-line-strong hover:border-brand-charcoal/30"}`}
                >
                  <input
                    type="radio"
                    name="clientType"
                    checked={isPublic}
                    onChange={() => setIsPublic(true)}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium text-brand-charcoal">Public Client</p>
                    <p className="text-xs text-ink-muted">
                      SPA / 移动端 / 桌面端，不传输 client_secret，必须使用 PKCE
                    </p>
                  </div>
                </label>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  if (validateStepOne()) setStep(2);
                }}
                disabled={!appName.trim() || !redirectUri.trim()}
                leftIcon={<ArrowRight className="h-4 w-4" />}
              >
                下一步
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Select Scopes */}
      {step === 2 && (
        <div className="rounded-card border border-line bg-white p-4 sm:p-6">
          <h2 ref={stepHeadingRef} tabIndex={-1} className="mb-4 text-lg font-semibold outline-none">
            ② 选择数据权限
          </h2>
          <p className="mb-4 text-sm text-ink-muted">
            选择你的应用需要获取的用户信息权限。仅选择必需的最小权限。
          </p>
          <div className="mb-6 max-w-md space-y-3">
            {availableScopes.length === 0 && scopesLoadFailed && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-status-danger-line bg-status-danger-soft p-3 text-sm text-status-danger-strong">
                <span className="min-w-0 flex-1">权限范围加载失败，请重试。</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setScopesLoadFailed(false);
                    loadScopes();
                  }}
                >
                  重试
                </Button>
              </div>
            )}
            {availableScopes.map((s) => (
              <label
                key={s.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                  selectedScopes.includes(s.value)
                    ? "border-brand-primary bg-brand-primary/5"
                    : "border-line-strong hover:border-brand-charcoal/30"
                } ${s.value === "openid" ? "opacity-70" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={selectedScopes.includes(s.value)}
                  onChange={() => toggleScope(s.value)}
                  disabled={s.value === "openid"}
                  className="mt-0.5"
                />
                <div>
                  <span className="text-sm font-medium text-brand-charcoal">{s.label}</span>
                  <span className="ml-2 font-mono text-xs text-ink-muted">{s.value}</span>
                  <p className="mt-0.5 text-xs text-ink-muted">{s.desc}</p>
                </div>
              </label>
            ))}
          </div>
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => setStep(1)}
              leftIcon={<ArrowLeft className="h-4 w-4" />}
            >
              上一步
            </Button>
            <Button onClick={() => setStep(3)} leftIcon={<ArrowRight className="h-4 w-4" />}>
              下一步
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === 3 && (
        <div className="rounded-card border border-line bg-white p-4 sm:p-6">
          <h2 ref={stepHeadingRef} tabIndex={-1} className="mb-4 text-lg font-semibold outline-none">
            ③ 确认并创建
          </h2>
          <div className="mb-6 max-w-md rounded-lg bg-surface-muted p-4">
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-ink-muted">应用名称：</span>
                <span className="font-medium text-brand-charcoal">{appName}</span>
              </div>
              <div>
                <span className="text-ink-muted">应用类型：</span>
                <span className="font-medium text-brand-charcoal">
                  {isPublic ? "Public Client" : "Confidential Client"}
                </span>
              </div>
              <div>
                <span className="text-ink-muted">回调 URL：</span>
                <span className="font-mono text-xs text-brand-charcoal">{redirectUri}</span>
              </div>
              <div>
                <span className="text-ink-muted">权限范围：</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {selectedScopes.map((s) => (
                    <Badge key={s} variant="secondary" className="text-xs">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {createError ? (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-lg border border-status-danger-line bg-status-danger-soft px-3 py-2 text-sm text-status-danger-strong"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">{createError}</span>
            </div>
          ) : null}
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => setStep(2)}
              leftIcon={<ArrowLeft className="h-4 w-4" />}
            >
              上一步
            </Button>
            <Button
              onClick={handleCreate}
              loading={loading}
              leftIcon={<Check className="h-4 w-4" />}
            >
              创建 Client
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Show Credentials + Code */}
      {step === 4 && (
        <div className="rounded-card border border-line bg-white p-4 sm:p-6">
          <h2 ref={stepHeadingRef} tabIndex={-1} className="mb-4 text-lg font-semibold outline-none">
            ④ 接入凭据与代码
          </h2>

          {/* Credentials */}
          <div className="mb-6 rounded-lg border border-status-success-line bg-status-success-soft p-4">
            <p className="mb-2 text-sm font-medium text-status-success-strong">
              请立即复制并安全保存 Client Secret！
            </p>
            <p className="mb-3 text-xs text-status-success-fg">
              以下凭据仅显示一次，关闭页面后无法再次查看 Secret。
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-brand-charcoal/70">Client ID：</span>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <code className="rounded bg-status-success-soft px-2 py-1 font-mono text-xs">
                    {result.clientId}
                  </code>
                  <button
                    onClick={() => copyCode(result.clientId || "")}
                    aria-label="复制 Client ID"
                    className="text-ink-muted hover:text-brand-charcoal/70"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-brand-charcoal/70">Client Secret：</span>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <code className="max-w-full break-all rounded bg-status-success-soft px-2 py-1 font-mono text-xs sm:max-w-[280px]">
                    {showSecret ? result.plainSecret : "••••••••••••••••••••"}
                  </code>
                  <button
                    onClick={() => setShowSecret((v) => !v)}
                    aria-label={showSecret ? "隐藏密钥" : "显示密钥"}
                    className="text-ink-muted hover:text-brand-charcoal/70"
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => copyCode(result.plainSecret || "")}
                    aria-label="复制密钥"
                    className="text-ink-muted hover:text-brand-charcoal/70"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Code Snippets */}
          <h3 className="text-md mb-3 font-semibold">接入代码片段</h3>

          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-brand-charcoal/70">Node.js</span>
              <button
                onClick={() => copyCode(nodeCode)}
                className="flex items-center gap-1 text-xs text-brand-primary hover:underline"
              >
                <Copy className="h-3 w-3" /> 复制
              </button>
            </div>
            <pre className="max-h-60 overflow-x-auto rounded-lg bg-gray-900 p-4 text-xs text-gray-100">
              {nodeCode}
            </pre>
          </div>

          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-brand-charcoal/70">React / 通用 HTTP</span>
              <button
                onClick={() => copyCode(reactCode)}
                className="flex items-center gap-1 text-xs text-brand-primary hover:underline"
              >
                <Copy className="h-3 w-3" /> 复制
              </button>
            </div>
            <pre className="max-h-80 overflow-x-auto rounded-lg bg-gray-900 p-4 text-xs text-gray-100">
              {reactCode}
            </pre>
          </div>

          <div className="mb-6 rounded-lg border border-status-warning-line bg-status-warning-soft p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={secretSaved}
                onChange={(e) => setSecretSaved(e.target.checked)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-status-warning-strong">我已安全保存 Client Secret</p>
                <p className="mt-0.5 text-xs text-status-warning-fg">
                  Secret 仅显示一次，关闭页面后无法再次查看。未完成保存前请勿继续。
                </p>
              </div>
            </label>
          </div>

          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => setStep(5)}
              disabled={!secretSaved}
              leftIcon={<ExternalLink className="h-4 w-4" />}
            >
              在线测试连接
            </Button>
            <Button onClick={() => router.push("/admin/oauth-clients")} disabled={!secretSaved}>
              完成，前往管理
            </Button>
          </div>
        </div>
      )}

      {/* Step 5: Connection Test */}
      {step === 5 && (
        <div className="rounded-card border border-line bg-white p-4 sm:p-6">
          <h2 ref={stepHeadingRef} tabIndex={-1} className="mb-4 text-lg font-semibold outline-none">
            ⑤ 在线连接测试
          </h2>
          <p className="mb-4 text-sm text-ink-muted">
            模拟完整 SSO 流程，验证配置是否正确。
          </p>

          <div className="mb-4">
            <Button
              onClick={handleTest}
              loading={testLoading}
              disabled={!result.clientId}
              leftIcon={<RefreshCw className="h-4 w-4" />}
            >
              运行测试
            </Button>
          </div>

          {testError ? (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-lg border border-status-danger-line bg-status-danger-soft px-3 py-2 text-sm text-status-danger-strong"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">{testError}</span>
            </div>
          ) : null}

          {testResult && (
            <div
              className={`rounded-lg p-4 ${testResult.steps.every((s) => s.status === "passed") ? "border border-status-success-line bg-status-success-soft" : "border border-status-warning-line bg-status-warning-soft"}`}
            >
              <p
                className={`mb-2 flex items-center gap-2 text-sm font-medium ${testResult.steps.every((s) => s.status === "passed") ? "text-status-success-strong" : "text-status-warning-strong"}`}
              >
                {testResult.steps.every((s) => s.status === "passed") ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    连接测试全部通过
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    测试未完全通过
                  </>
                )}
              </p>
              {testResult.summary && (
                <p className="mb-2 text-xs text-brand-charcoal/70">{testResult.summary}</p>
              )}
              <pre className="max-h-60 overflow-x-auto rounded bg-white/50 p-3 text-xs text-brand-charcoal/70">
                {JSON.stringify(testResult.steps, null, 2)}
              </pre>
            </div>
          )}

          <div className="mt-6 flex justify-between">
            <Button
              variant="outline"
              onClick={() => setStep(4)}
              leftIcon={<ArrowLeft className="h-4 w-4" />}
            >
              返回上一步
            </Button>
            <Button onClick={() => router.push("/admin/oauth-clients")}>完成，前往管理</Button>
          </div>
        </div>
      )}
      {totpModal}
    </div>
  );
}
