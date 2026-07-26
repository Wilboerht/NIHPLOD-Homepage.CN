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

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { apiPost } from "@/lib/api-client";
import {
  Check,
  Copy,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

const AVAILABLE_SCOPES = [
  { value: "openid", label: "OpenID", desc: "基础身份标识（必选）" },
  { value: "profile", label: "个人信息", desc: "昵称、头像" },
  { value: "phone", label: "手机号", desc: "脱敏手机号（138****1234）" },
  { value: "membership", label: "会员信息", desc: "会员等级、积分" },
];

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
  steps: Array<{ step: string; status: string; durationMs: number; detail?: string }>;
  summary: string;
  totalDurationMs: number;
}

export default function OAuthWizardPage() {
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: App Info
  const [appName, setAppName] = useState("");
  const [redirectUri, setRedirectUri] = useState("");

  // Step 2: Scopes
  const [selectedScopes, setSelectedScopes] = useState<string[]>(["openid", "profile"]);

  // Step 3: Result
  const [result, setResult] = useState<StepResult>({});

  // Step 5: Test
  const [testResult, setTestResult] = useState<TestResultData | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  const toggleScope = (scope: string) => {
    if (scope === "openid") return; // openid 必选
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const handleCreate = async () => {
    if (!appName.trim()) {
      toast.error("请输入应用名称");
      return;
    }
    if (!redirectUri.trim()) {
      toast.error("请输入回调 URL");
      return;
    }
    if (!redirectUri.startsWith("https://")) {
      toast.error("回调 URL 必须以 https:// 开头");
      return;
    }

    setLoading(true);
    try {
      const data = await apiPost<CreateClientWizardResponse>("/api/admin/oauth-clients", {
        name: appName.trim(),
        redirectUris: [redirectUri.trim()],
        scopes: selectedScopes,
      });

      setResult({
        clientId: data.client.clientId,
        plainSecret: data.plainSecret,
        client: data.client,
      });
      setStep(4);
      toast.success("Client 创建成功");
    } catch {
      toast.error("网络错误");
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!result.clientId || !result.plainSecret) return;
    setTestLoading(true);
    setTestResult(null);

    try {
      const data = await apiPost<TestResultData>("/api/admin/oauth-clients/test", {
        clientId: result.clientId,
        clientSecret: result.plainSecret,
        redirectUri: redirectUri.trim(),
      });

      setTestResult(data);
      const allPassed = data.steps.every((s) => s.status === "passed");
      if (allPassed) {
        toast.success("连接测试全部通过！");
      } else {
        toast.warning("连接测试未完全通过，请检查配置");
      }
    } catch {
      toast.error("测试请求失败");
    } finally {
      setTestLoading(false);
    }
  };

  const copyCode = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success("已复制"));
  };

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://nihplod.cn";

  const nodeCode = `// Node.js 接入代码
import { createTokenVerifier } from "@nihplod/sso-verify";

const verifier = createTokenVerifier({
  jwksUri: "${baseUrl}/api/oauth/jwks.json",
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
const tokenRes = await fetch("${baseUrl}/api/oauth/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    code: urlParams.get("code"),
    client_id: "${result.clientId || "YOUR_CLIENT_ID"}",
    client_secret: "YOUR_CLIENT_SECRET",
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
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">SSO 接入向导</h1>

      {/* Steps indicator */}
      <div className="flex items-center mb-8">
        {[1, 2, 3, 4, 5].map((s) => (
          <div key={s} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step >= s ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500"
              }`}
            >
              {step > s ? <Check className="w-4 h-4" /> : s}
            </div>
            {s < 5 && (
              <div className={`w-12 h-0.5 ${step > s ? "bg-blue-600" : "bg-gray-200"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: App Info */}
      {step === 1 && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">① 填写应用信息</h2>
          <div className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">应用名称 *</label>
              <Input
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                placeholder="如：Advisor 顾问系统"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">回调 URL *</label>
              <Input
                value={redirectUri}
                onChange={(e) => setRedirectUri(e.target.value)}
                placeholder="https://advisor.nihplod.cn/api/auth/callback"
              />
              <p className="text-xs text-gray-400 mt-1">
                用户授权后，主站将把授权码发送到此 URL。
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => setStep(2)}
                disabled={!appName.trim() || !redirectUri.trim()}
                leftIcon={<ArrowRight className="w-4 h-4" />}
              >
                下一步
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Select Scopes */}
      {step === 2 && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">② 选择数据权限</h2>
          <p className="text-sm text-gray-500 mb-4">
            选择你的应用需要获取的用户信息权限。仅选择必需的最小权限。
          </p>
          <div className="space-y-3 max-w-md mb-6">
            {AVAILABLE_SCOPES.map((s) => (
              <label
                key={s.value}
                className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                  selectedScopes.includes(s.value)
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
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
                  <span className="text-sm font-medium text-gray-900">{s.label}</span>
                  <span className="text-xs text-gray-400 ml-2 font-mono">{s.value}</span>
                  <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
                </div>
              </label>
            ))}
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)} leftIcon={<ArrowLeft className="w-4 h-4" />}>
              上一步
            </Button>
            <Button onClick={() => setStep(3)} leftIcon={<ArrowRight className="w-4 h-4" />}>
              下一步
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === 3 && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">③ 确认并创建</h2>
          <div className="bg-gray-50 rounded-lg p-4 mb-6 max-w-md">
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-500">应用名称：</span>
                <span className="text-gray-900 font-medium">{appName}</span>
              </div>
              <div>
                <span className="text-gray-500">回调 URL：</span>
                <span className="text-gray-900 font-mono text-xs">{redirectUri}</span>
              </div>
              <div>
                <span className="text-gray-500">权限范围：</span>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {selectedScopes.map((s) => (
                    <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)} leftIcon={<ArrowLeft className="w-4 h-4" />}>
              上一步
            </Button>
            <Button onClick={handleCreate} disabled={loading} leftIcon={<Check className="w-4 h-4" />}>
              {loading ? "创建中..." : "创建 Client"}
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Show Credentials + Code */}
      {step === 4 && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">④ 接入凭据与代码</h2>

          {/* Credentials */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-green-800 font-medium mb-2">
              请立即复制并安全保存 Client Secret！
            </p>
            <p className="text-xs text-green-600 mb-3">
              以下凭据仅显示一次，关闭页面后无法再次查看 Secret。
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Client ID：</span>
                <div className="flex items-center gap-2">
                  <code className="bg-green-100 px-2 py-1 rounded text-xs font-mono">
                    {result.clientId}
                  </code>
                  <button onClick={() => copyCode(result.clientId || "")} className="text-gray-400 hover:text-gray-600">
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Client Secret：</span>
                <div className="flex items-center gap-2">
                  <code className="bg-green-100 px-2 py-1 rounded text-xs font-mono max-w-[200px] truncate">
                    {result.plainSecret}
                  </code>
                  <button onClick={() => copyCode(result.plainSecret || "")} className="text-gray-400 hover:text-gray-600">
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Code Snippets */}
          <h3 className="text-md font-semibold mb-3">接入代码片段</h3>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Node.js</span>
              <button onClick={() => copyCode(nodeCode)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <Copy className="w-3 h-3" /> 复制
              </button>
            </div>
            <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs overflow-x-auto max-h-60">
              {nodeCode}
            </pre>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">React / 通用 HTTP</span>
              <button onClick={() => copyCode(reactCode)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <Copy className="w-3 h-3" /> 复制
              </button>
            </div>
            <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs overflow-x-auto max-h-80">
              {reactCode}
            </pre>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(5)} leftIcon={<ExternalLink className="w-4 h-4" />}>
              在线测试连接
            </Button>
            <Button onClick={() => (window.location.href = "/admin/oauth-clients")}>
              完成，前往管理
            </Button>
          </div>
        </div>
      )}

      {/* Step 5: Connection Test */}
      {step === 5 && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">⑤ 在线连接测试</h2>
          <p className="text-sm text-gray-500 mb-4">
            模拟完整 SSO 流程，验证配置是否正确。
          </p>

          <div className="mb-4">
            <Button
              onClick={handleTest}
              disabled={testLoading || !result.clientId}
              leftIcon={testLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            >
              {testLoading ? "测试中..." : "运行测试"}
            </Button>
          </div>

          {testResult && (
            <div className={`rounded-lg p-4 ${testResult.steps.every(s => s.status === "passed") ? "bg-green-50 border border-green-200" : "bg-yellow-50 border border-yellow-200"}`}>
              <p className={`text-sm font-medium mb-2 ${testResult.steps.every(s => s.status === "passed") ? "text-green-800" : "text-yellow-800"}`}>
                {testResult.steps.every(s => s.status === "passed") ? "✅ 连接测试全部通过" : "⚠️ 测试未完全通过"}
              </p>
              {testResult.summary && (
                <p className="text-xs text-gray-600 mb-2">{testResult.summary}</p>
              )}
              <pre className="text-xs text-gray-600 bg-white/50 rounded p-3 overflow-x-auto max-h-60">
                {JSON.stringify(testResult.steps, null, 2)}
              </pre>
            </div>
          )}

          <div className="flex justify-between mt-6">
            <Button variant="outline" onClick={() => setStep(4)} leftIcon={<ArrowLeft className="w-4 h-4" />}>
              返回上一步
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
