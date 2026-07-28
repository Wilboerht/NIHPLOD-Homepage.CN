"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Plus,
  Pencil,
  Power,
  Copy,
  RotateCw,
  Code,
  Users,
  Clock,
  Search,
  Eye,
  X,
  Shield,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPost, apiPatch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface OAuthClient {
  id: string;
  clientId: string;
  name: string;
  redirectUris: string[];
  scopes: string[];
  isActive: boolean;
  backchannelLogoutUri: string | null;
  createdAt: string;
  updatedAt: string;
  activeUserCount?: number;
  lastActiveAt?: string | null;
}

interface ClientsResponse {
  clients: OAuthClient[];
  pagination: { page: number; pageSize: number; total: number };
}

interface CreateClientResponse {
  client: OAuthClient;
  plainSecret: string;
}

interface ClientActionResponse {
  client: OAuthClient;
}

type ClientType = "public" | "confidential";

const formatDate = (dateStr: string) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("zh-CN");
};

const formatDateTime = (dateStr: string) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("zh-CN");
};

const validateRedirectUris = (uris: string): { valid: boolean; error?: string; parsed: string[] } => {
  const lines = uris.split("\n").map((u) => u.trim()).filter(Boolean);
  if (lines.length === 0) return { valid: false, error: "至少需要一个回调 URL", parsed: [] };
  const parsed: string[] = [];
  for (const line of lines) {
    try {
      const url = new URL(line);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        return { valid: false, error: `回调 URL 必须使用 http:// 或 https:// 协议：${line}`, parsed: [] };
      }
      if (url.hash) {
        return { valid: false, error: `回调 URL 不能包含 hash 片段：${line}`, parsed: [] };
      }
      parsed.push(line);
    } catch {
      return { valid: false, error: `回调 URL 格式不正确：${line}`, parsed: [] };
    }
  }
  return { valid: true, parsed };
};

const generatePkcePair = async () => {
  const verifier = crypto.randomUUID() + crypto.randomUUID();
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return { verifier, challenge };
};

function OAuthClientsPage() {
  const searchParams = useSearchParams();
  const toast = useToast();
  const [clients, setClients] = useState<OAuthClient[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(() => {
    const p = searchParams.get("page");
    return p ? Math.max(1, parseInt(p, 10)) : 1;
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  const pageSize = 20;

  // Modal states
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editClient, setEditClient] = useState<OAuthClient | null>(null);

  // Rotate secret confirm modal
  const [showRotateConfirm, setShowRotateConfirm] = useState(false);
  const [rotateClientId, setRotateClientId] = useState<string | null>(null);

  // Rotated secret display modal
  const [showRotatedSecret, setShowRotatedSecret] = useState(false);
  const [rotatedSecret, setRotatedSecret] = useState<string | null>(null);

  // Detail drawer
  const [detailClient, setDetailClient] = useState<OAuthClient | null>(null);

  // Form
  const [formName, setFormName] = useState("");
  const [formRedirectUris, setFormRedirectUris] = useState("");
  const [formScopes, setFormScopes] = useState("openid profile phone");
  const [formBackchannelUri, setFormBackchannelUri] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Newly created secret
  const [newSecret, setNewSecret] = useState<string | null>(null);

  // SDK config
  const [showSdkConfig, setShowSdkConfig] = useState(false);
  const [sdkConfigClient, setSdkConfigClient] = useState<OAuthClient | null>(null);
  const [sdkConfigCode, setSdkConfigCode] = useState("");
  const [sdkClientType, setSdkClientType] = useState<ClientType>("confidential");

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (search.trim()) params.set("search", search.trim());
      const data = await apiGet<ClientsResponse>(`/api/admin/oauth-clients?${params.toString()}`);
      setClients(data.clients);
      setTotal(data.pagination.total);
    } catch {
      toast.error("获取 Client 列表失败");
    } finally {
      setLoading(false);
    }
  }, [page, search, toast]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (search.trim()) params.set("search", search.trim());
    else params.delete("search");
    if (page !== 1) params.set("page", String(page));
    else params.delete("page");
    const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState(null, "", newUrl);
  }, [search, page]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (page !== 1) setPage(1);
      else fetchClients();
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  const resetForm = () => {
    setFormName("");
    setFormRedirectUris("");
    setFormScopes("openid profile phone");
    setFormBackchannelUri("");
  };

  const handleCreate = async () => {
    setFormError(null);
    if (!formName.trim()) {
      setFormError("请输入应用名称");
      return;
    }
    const uriValidation = validateRedirectUris(formRedirectUris);
    if (!uriValidation.valid) {
      setFormError(uriValidation.error || "回调 URL 格式错误");
      return;
    }
    const scopes = formScopes.split(" ").filter(Boolean);
    if (scopes.length === 0 || !scopes.includes("openid")) {
      setFormError("Scopes 必须包含 openid");
      return;
    }

    setSaving(true);
    try {
      const data = await apiPost<CreateClientResponse>("/api/admin/oauth-clients", {
        name: formName.trim(),
        redirectUris: uriValidation.parsed,
        scopes,
        backchannelLogoutUri: formBackchannelUri.trim() || undefined,
      });
      setNewSecret(data.plainSecret);
      toast.success("Client 创建成功");
      fetchClients();
    } catch {
      toast.error("网络错误");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    setFormError(null);
    if (!editClient || !formName.trim()) {
      setFormError("请输入应用名称");
      return;
    }
    const uriValidation = validateRedirectUris(formRedirectUris);
    if (!uriValidation.valid) {
      setFormError(uriValidation.error || "回调 URL 格式错误");
      return;
    }
    const scopes = formScopes.split(" ").filter(Boolean);
    if (scopes.length === 0 || !scopes.includes("openid")) {
      setFormError("Scopes 必须包含 openid");
      return;
    }

    setSaving(true);
    try {
      await apiPatch<ClientActionResponse>(`/api/admin/oauth-clients/${editClient.id}`, {
        name: formName.trim(),
        redirectUris: uriValidation.parsed,
        scopes,
        backchannelLogoutUri: formBackchannelUri.trim() || null,
      });
      toast.success("Client 更新成功");
      setShowEdit(false);
      fetchClients();
    } catch {
      toast.error("网络错误");
    } finally {
      setSaving(false);
    }
  };

  const handleRotateSecret = async () => {
    if (!rotateClientId) return;
    setSaving(true);
    try {
      const data = await apiPost<{ plainSecret: string }>(
        `/api/admin/oauth-clients/${rotateClientId}/rotate-secret`,
        { confirm: true }
      );
      setRotatedSecret(data.plainSecret);
      setShowRotatedSecret(true);
      toast.success("密钥轮换成功");
    } catch {
      toast.error("密钥轮换失败");
    } finally {
      setSaving(false);
      setShowRotateConfirm(false);
      setRotateClientId(null);
    }
  };

  const handleToggleActive = async (client: OAuthClient) => {
    try {
      await apiPatch<ClientActionResponse>(`/api/admin/oauth-clients/${client.id}`, {
        isActive: !client.isActive,
      });
      toast.success(client.isActive ? "Client 已禁用" : "Client 已启用");
      fetchClients();
    } catch {
      toast.error("网络错误");
    }
  };

  const openEdit = (client: OAuthClient) => {
    setFormError(null);
    setEditClient(client);
    setFormName(client.name);
    setFormRedirectUris(client.redirectUris.join("\n"));
    setFormScopes(client.scopes.join(" "));
    setFormBackchannelUri(client.backchannelLogoutUri || "");
    setShowEdit(true);
  };

  const openCreate = () => {
    setFormError(null);
    resetForm();
    setNewSecret(null);
    setShowCreate(true);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success("已复制到剪贴板");
    });
  };

  const getSdkConfigCode = (client: OAuthClient, type: ClientType, pkceChallenge?: string) => {
    const ssoBaseUrl = typeof window !== "undefined" ? window.location.origin : "https://nihplod.cn";
    const primaryUri = client.redirectUris[0] || "https://your-app.com/callback";
    const scopes = client.scopes.join(" ");

    if (type === "public") {
      return `// Public Client（SPA、移动端、桌面端）
// 不传输 client_secret，必须使用 PKCE
import { SsoClient } from "@nihplod/sso-sdk";

const ssoClient = new SsoClient({
  clientId: "${client.clientId}",
  redirectUri: "${primaryUri}",
  ssoBaseUrl: "${ssoBaseUrl}",
  scopes: "${scopes}",
});

// React 集成:
// import { SsoProvider } from "@nihplod/sso-sdk/react";
// <SsoProvider config={{ clientId: "${client.clientId}", redirectUri: "${primaryUri}", ssoBaseUrl: "${ssoBaseUrl}", scopes: "${scopes}" }}>
//   <App />
// </SsoProvider>

// 通用 HTTP 示例（手动 PKCE）：
const state = crypto.randomUUID();
const codeVerifier = crypto.randomUUID() + crypto.randomUUID();
const codeChallenge = "${pkceChallenge || "YOUR_CODE_CHALLENGE"}";
const authUrl = new URL("${ssoBaseUrl}/api/oauth/authorize");
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("client_id", "${client.clientId}");
authUrl.searchParams.set("redirect_uri", "${primaryUri}");
authUrl.searchParams.set("scope", "${scopes}");
authUrl.searchParams.set("state", state);
authUrl.searchParams.set("code_challenge", codeChallenge);
authUrl.searchParams.set("code_challenge_method", "S256");
window.location.href = authUrl.toString();`;
    }

    return `// Confidential Client（Next.js / 服务端应用）
// 后端通过 introspection 验证 token，必须保密 client_secret
import { createTokenVerifier } from "@nihplod/sso-verify";

const verifier = createTokenVerifier({
  jwksUri: "${ssoBaseUrl}/api/oauth/jwks",
  audience: "${client.clientId}",
  issuer: "${ssoBaseUrl}",
  introspectionEndpoint: "${ssoBaseUrl}/api/oauth/introspect",
  clientId: "${client.clientId}",
  clientSecret: "YOUR_CLIENT_SECRET",
});

// 在 API 路由中验证 access_token
const payload = await verifier.verify(accessToken);
if (!payload) {
  return res.status(401).json({ error: "Unauthorized" });
}`;
  };

  const openSdkConfig = async (client: OAuthClient) => {
    setSdkConfigClient(client);
    setSdkClientType("confidential");
    const pkce = await generatePkcePair();
    setSdkConfigCode(getSdkConfigCode(client, "confidential", pkce.challenge));
    setShowSdkConfig(true);
  };

  const handleSdkTypeChange = async (type: ClientType) => {
    setSdkClientType(type);
    if (sdkConfigClient) {
      const pkce = type === "public" ? await generatePkcePair() : undefined;
      setSdkConfigCode(getSdkConfigCode(sdkConfigClient, type, pkce?.challenge));
    }
  };

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">OAuth Client 管理</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索名称或 Client ID"
              className="pl-9 w-64"
            />
          </div>
          <Button
            onClick={openCreate}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            新建 Client
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">名称</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Client ID</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">回调 URL</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Scopes</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">活跃用户</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">最近活跃</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">状态</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">创建时间</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="text-center py-8 text-gray-500">加载中...</td>
              </tr>
            ) : clients.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-8 text-gray-500">暂无数据</td>
              </tr>
            ) : (
              clients.map((c) => (
                <tr key={c.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium">
                    <button
                      onClick={() => setDetailClient(c)}
                      className="text-left hover:text-blue-600 hover:underline"
                    >
                      {c.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-600">
                    <div className="flex items-center gap-2">
                      <span className="truncate max-w-[120px]" title={c.clientId}>{c.clientId}</span>
                      <button
                        onClick={() => copyToClipboard(c.clientId)}
                        className="text-gray-400 hover:text-gray-600"
                        title="复制 Client ID"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate">
                    {c.redirectUris.join(", ")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {c.scopes.map((s) => (
                        <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      {c.activeUserCount ?? "-"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {c.lastActiveAt ? formatDate(c.lastActiveAt) : "-"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={c.isActive ? "success" : "danger"}>
                      {c.isActive ? "启用" : "禁用"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(c.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setDetailClient(c)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                        title="查看详情"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openSdkConfig(c)}
                        className="p-1.5 text-gray-400 hover:text-green-600 rounded"
                        title="生成接入配置"
                      >
                        <Code className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEdit(c)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                        title="编辑"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => { setRotateClientId(c.id); setShowRotateConfirm(true); }}
                        className="p-1.5 text-gray-400 hover:text-purple-600 rounded"
                        title="轮换密钥"
                      >
                        <RotateCw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(c)}
                        className="p-1.5 text-gray-400 hover:text-orange-600 rounded"
                        title={c.isActive ? "禁用" : "启用"}
                      >
                        <Power className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > pageSize && (
        <div className="mt-4">
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onChange={setPage}
          />
        </div>
      )}

      {/* Create Modal */}
      <Modal
        open={showCreate}
        onClose={() => { setShowCreate(false); setNewSecret(null); }}
        title="新建 OAuth Client"
      >
        {newSecret ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-800 font-medium mb-2">Client 创建成功！</p>
              <p className="text-xs text-green-600 mb-3">
                请立即复制并安全保存 Client Secret，关闭后无法再次查看。
              </p>
              <div className="flex items-center gap-2">
                <Input
                  value={newSecret}
                  readOnly
                  className="font-mono text-sm flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(newSecret)}
                  leftIcon={<Copy className="w-4 h-4" />}
                >
                  复制
                </Button>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => { setShowCreate(false); setNewSecret(null); fetchClients(); }}>
                关闭
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {formError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {formError}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">应用名称 *</label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="如：Advisor 顾问系统" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">回调 URL *（每行一个）</label>
              <textarea
                value={formRedirectUris}
                onChange={(e) => setFormRedirectUris(e.target.value)}
                placeholder="https://advisor.nihplod.cn/api/auth/callback&#10;https://shop.nihplod.cn/callback"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">生产环境回调 URL 必须使用 https://</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Scopes（空格分隔）</label>
              <Input value={formScopes} onChange={(e) => setFormScopes(e.target.value)} placeholder="openid profile phone membership" />
              <p className="text-xs text-gray-400 mt-1">必须包含 openid，建议只申请必需 scope</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Backchannel Logout URI（可选）</label>
              <Input value={formBackchannelUri} onChange={(e) => setFormBackchannelUri(e.target.value)} placeholder="https://advisor.nihplod.cn/api/sso/logout" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? "创建中..." : "创建"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        title="编辑 OAuth Client"
      >
        <div className="space-y-4">
          {formError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {formError}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">应用名称 *</label>
            <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">回调 URL *（每行一个）</label>
            <textarea
              value={formRedirectUris}
              onChange={(e) => setFormRedirectUris(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">生产环境回调 URL 必须使用 https://</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Scopes（空格分隔）</label>
            <Input value={formScopes} onChange={(e) => setFormScopes(e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">必须包含 openid，建议只申请必需 scope</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Backchannel Logout URI（可选）</label>
            <Input value={formBackchannelUri} onChange={(e) => setFormBackchannelUri(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowEdit(false)}>取消</Button>
            <Button onClick={handleEdit} disabled={saving}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Rotate Secret Confirm */}
      <ConfirmDialog
        open={showRotateConfirm}
        onClose={() => { setShowRotateConfirm(false); setRotateClientId(null); }}
        onConfirm={handleRotateSecret}
        title="轮换 Client 密钥"
        description="确定要轮换该 Client 的密钥？轮换后旧密钥将在 5 分钟内失效，所有使用旧密钥的子项目需要立即更新配置。"
        confirmText="确定轮换"
        loading={saving}
      />

      {/* Rotated Secret Display Modal */}
      <Modal
        open={showRotatedSecret}
        onClose={() => { setShowRotatedSecret(false); setRotatedSecret(null); }}
        title="Client Secret 轮换成功"
      >
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-800 font-medium mb-2">新 Secret 已生成</p>
            <p className="text-xs text-green-600 mb-3">
              请立即复制并安全保存。旧 Secret 将在 5 分钟内失效，关闭后无法再次查看新 Secret。
            </p>
            <div className="flex items-center gap-2">
              <Input
                value={rotatedSecret || ""}
                readOnly
                className="font-mono text-sm flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => rotatedSecret && copyToClipboard(rotatedSecret)}
                leftIcon={<Copy className="w-4 h-4" />}
              >
                复制
              </Button>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => { setShowRotatedSecret(false); setRotatedSecret(null); fetchClients(); }}>
              关闭
            </Button>
          </div>
        </div>
      </Modal>

      {/* SDK Config Modal */}
      <Modal
        open={showSdkConfig}
        onClose={() => setShowSdkConfig(false)}
        title="接入配置代码"
      >
        <div className="space-y-4">
          <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
            <button
              onClick={() => handleSdkTypeChange("confidential")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                sdkClientType === "confidential"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              <Shield className="w-4 h-4" />
              Confidential（服务端）
            </button>
            <button
              onClick={() => handleSdkTypeChange("public")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                sdkClientType === "public"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              <Smartphone className="w-4 h-4" />
              Public（SPA/移动端）
            </button>
          </div>
          <p className="text-sm text-gray-600">
            {sdkClientType === "confidential"
              ? "适用于 Next.js / 服务端应用，后端通过 introspection 验证 token。client_secret 必须保密。"
              : "适用于 SPA、移动端、桌面端，不传输 client_secret，必须使用 PKCE。"}
          </p>
          <div className="relative">
            <pre className="bg-gray-900 text-green-400 rounded-lg p-4 text-xs overflow-x-auto max-h-80">
              <code>{sdkConfigCode}</code>
            </pre>
            <button
              onClick={() => copyToClipboard(sdkConfigCode)}
              className="absolute top-2 right-2 p-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded"
              title="复制代码"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs text-gray-500">
            将代码复制到子项目中即可快速接入。详情请参考{" "}
            <a
              href="https://nihplod.cn/docs/sso-integration"
              target="_blank"
              className="text-blue-600 underline"
              rel="noreferrer"
            >
              接入文档
            </a>
            。
          </p>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setShowSdkConfig(false)}>
              关闭
            </Button>
          </div>
        </div>
      </Modal>

      {/* Detail Drawer */}
      {detailClient && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setDetailClient(null)}
          />
          <div className="relative w-full max-w-md bg-white shadow-xl h-full overflow-y-auto">
            <div className="p-6 space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{detailClient.name}</h2>
                  <p className="text-sm text-gray-500 mt-1">Client ID: {detailClient.clientId}</p>
                </div>
                <button
                  onClick={() => setDetailClient(null)}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">基本信息</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">状态</span>
                      <Badge variant={detailClient.isActive ? "success" : "danger"}>
                        {detailClient.isActive ? "启用" : "禁用"}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">活跃用户</span>
                      <span>{detailClient.activeUserCount ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">最近活跃</span>
                      <span>{detailClient.lastActiveAt ? formatDateTime(detailClient.lastActiveAt) : "-"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">创建时间</span>
                      <span>{formatDateTime(detailClient.createdAt)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">更新时间</span>
                      <span>{formatDateTime(detailClient.updatedAt)}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">权限范围（Scopes）</h3>
                  <div className="flex gap-2 flex-wrap">
                    {detailClient.scopes.map((s) => (
                      <Badge key={s} variant="secondary">{s}</Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">回调 URL</h3>
                  <ul className="space-y-2">
                    {detailClient.redirectUris.map((uri) => (
                      <li key={uri} className="text-sm font-mono bg-gray-50 p-2 rounded break-all">
                        {uri}
                      </li>
                    ))}
                  </ul>
                </div>

                {detailClient.backchannelLogoutUri && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Backchannel Logout URI</h3>
                    <p className="text-sm font-mono bg-gray-50 p-2 rounded break-all">
                      {detailClient.backchannelLogoutUri}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => { setDetailClient(null); openEdit(detailClient); }}
                  leftIcon={<Pencil className="w-4 h-4" />}
                >
                  编辑
                </Button>
                <Button
                  onClick={() => { setDetailClient(null); openSdkConfig(detailClient); }}
                  leftIcon={<Code className="w-4 h-4" />}
                >
                  接入配置
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OAuthClientsPageWrapper() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-gray-500">加载中...</div>}>
      <OAuthClientsPage />
    </Suspense>
  );
}
