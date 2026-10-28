"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
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
  EyeOff,
  Shield,
  Smartphone,
  Trash2,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Empty } from "@/components/ui/Empty";
import { useToast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import { IconButton } from "@/components/admin/IconButton";
import { MobileList, MobileListCard } from "@/components/admin/MobileList";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/lib/api-client";
import { formatDate, formatDateTimeSeconds as formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RequirePermission } from "@/components/admin";
import { PageHeader } from "@/components/admin/PageHeader";

interface OAuthClient {
  id: string;
  clientId: string;
  name: string;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  scopes: string[];
  isActive: boolean;
  isPublic: boolean;
  backchannelLogoutUri: string | null;
  webhookUri: string | null;
  codeTtlSeconds: number;
  accessTokenTtlSeconds: number;
  secretRotatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  activeUserCount?: number;
  lastActiveAt?: string | null;
}

interface ClientsResponse {
  clients: OAuthClient[];
  pagination: { page: number; pageSize: number; total: number };
}

interface TestResultData {
  allPassed: boolean;
  steps: Array<{ step: string; status: string; durationMs: number; detail?: string }>;
  summary?: string;
}

interface CreateClientResponse {
  client: OAuthClient;
  plainSecret: string;
}

interface ClientActionResponse {
  client: OAuthClient;
}

type ClientType = "public" | "confidential";

const validateRedirectUris = (
  uris: string
): { valid: boolean; error?: string; parsed: string[] } => {
  const lines = uris
    .split("\n")
    .map((u) => u.trim())
    .filter(Boolean);
  if (lines.length === 0) return { valid: false, error: "至少需要一个回调 URL", parsed: [] };
  const parsed: string[] = [];
  for (const line of lines) {
    try {
      const url = new URL(line);
      if (url.protocol === "http:") {
        return { valid: false, error: `生产环境必须使用 https:// 协议：${line}`, parsed: [] };
      }
      if (url.protocol !== "https:") {
        return { valid: false, error: `回调 URL 必须使用 https:// 协议：${line}`, parsed: [] };
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

/**
 * Post Logout Redirect URI 校验：与 redirectUris 同规则（https、不允许 fragment），
 * 但允许为空（登出后跳转为可选能力，空表示不允许任何 post_logout_redirect_uri）。
 */
const validatePostLogoutUris = (
  uris: string
): { valid: boolean; error?: string; parsed: string[] } => {
  const lines = uris
    .split("\n")
    .map((u) => u.trim())
    .filter(Boolean);
  const parsed: string[] = [];
  for (const line of lines) {
    try {
      const url = new URL(line);
      if (url.protocol !== "https:") {
        return {
          valid: false,
          error: `Post Logout URL 必须使用 https:// 协议：${line}`,
          parsed: [],
        };
      }
      if (url.hash) {
        return { valid: false, error: `Post Logout URL 不能包含 hash 片段：${line}`, parsed: [] };
      }
      parsed.push(line);
    } catch {
      return { valid: false, error: `Post Logout URL 格式不正确：${line}`, parsed: [] };
    }
  }
  return { valid: true, parsed };
};

interface ClientFormFieldsProps {
  formName: string;
  onFormNameChange: (value: string) => void;
  formRedirectUris: string;
  onFormRedirectUrisChange: (value: string) => void;
  formPostLogoutUris: string;
  onFormPostLogoutUrisChange: (value: string) => void;
  formScopes: string;
  onFormScopesChange: (value: string) => void;
  formIsPublic: boolean;
  onFormIsPublicChange: (value: boolean) => void;
  formBackchannelUri: string;
  onFormBackchannelUriChange: (value: string) => void;
  formWebhookUri: string;
  onFormWebhookUriChange: (value: string) => void;
  formCodeTtl: string;
  onFormCodeTtlChange: (value: string) => void;
  formAccessTokenTtl: string;
  onFormAccessTokenTtlChange: (value: string) => void;
  errors: Record<string, string>;
}

function ClientFormFields({
  formName,
  onFormNameChange,
  formRedirectUris,
  onFormRedirectUrisChange,
  formPostLogoutUris,
  onFormPostLogoutUrisChange,
  formScopes,
  onFormScopesChange,
  formIsPublic,
  onFormIsPublicChange,
  formBackchannelUri,
  onFormBackchannelUriChange,
  formWebhookUri,
  onFormWebhookUriChange,
  formCodeTtl,
  onFormCodeTtlChange,
  formAccessTokenTtl,
  onFormAccessTokenTtlChange,
  errors,
}: ClientFormFieldsProps) {
  return (
    <div className="space-y-4">
      <Input
        label="应用名称"
        required
        data-autofocus
        value={formName}
        onChange={(e) => onFormNameChange(e.target.value)}
        error={errors.name}
        placeholder="如：Advisor 顾问系统"
      />
      <Textarea
        label="回调 URL"
        required
        value={formRedirectUris}
        onChange={(e) => onFormRedirectUrisChange(e.target.value)}
        error={errors.redirectUris}
        placeholder={"https://smart.nihplod.cn/api/auth/callback\nhttps://shop.nihplod.cn/callback"}
        rows={3}
        hint="每行一个；生产环境必须使用 https://"
      />
      <Textarea
        label="Post Logout Redirect URIs"
        value={formPostLogoutUris}
        onChange={(e) => onFormPostLogoutUrisChange(e.target.value)}
        error={errors.postLogoutUris}
        placeholder={"https://smart.nihplod.cn/login\nhttps://shop.nihplod.cn/logged-out"}
        rows={2}
        hint="可选，每行一个；留空表示不允许跳转"
      />
      <Input
        label="Scopes"
        value={formScopes}
        onChange={(e) => onFormScopesChange(e.target.value)}
        error={errors.scopes}
        placeholder="openid profile phone membership"
        hint="空格分隔，必须包含 openid，建议只申请必需 scope"
      />
      <Switch
        checked={formIsPublic}
        onChange={onFormIsPublicChange}
        label="Public Client"
        description={
          formIsPublic
            ? "SPA / 移动端 / 桌面端，不传输 client_secret，使用 PKCE"
            : "Next.js / 服务端应用，必须保密 client_secret"
        }
      />
      <Input
        label="Backchannel Logout URI"
        value={formBackchannelUri}
        onChange={(e) => onFormBackchannelUriChange(e.target.value)}
        error={errors.backchannelUri}
        placeholder="https://smart.nihplod.cn/api/sso/logout"
        hint="可选，https:// 公网地址"
      />
      <Input
        label="资料变更 Webhook URI"
        value={formWebhookUri}
        onChange={(e) => onFormWebhookUriChange(e.target.value)}
        error={errors.webhookUri}
        placeholder="https://smart.nihplod.cn/api/sso/webhook"
        hint="用户昵称/头像/生日变更时推送签名事件，须为 https:// 公网地址"
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="授权码有效期（秒）"
          type="number"
          min={60}
          max={600}
          value={formCodeTtl}
          onChange={(e) => onFormCodeTtlChange(e.target.value)}
          error={errors.codeTtlSeconds}
          hint="授权码换取 Token 的有效时间，默认 300 秒（60–600）"
        />
        <Input
          label="Access Token 有效期（秒）"
          type="number"
          min={60}
          max={86400}
          value={formAccessTokenTtl}
          onChange={(e) => onFormAccessTokenTtlChange(e.target.value)}
          error={errors.accessTokenTtlSeconds}
          hint="访问令牌的有效时间，默认 28800 秒（8 小时，60–86400）"
        />
      </div>
    </div>
  );
}

interface ClientActionsProps {
  client: OAuthClient;
  canWrite: boolean;
  onView: () => void;
  onSdkConfig: () => void;
  onTest: () => void;
  onEdit: () => void;
  onRotate: () => void;
  onToggle: () => void;
  onDelete: () => void;
}

function ClientActions({
  client,
  canWrite,
  onView,
  onSdkConfig,
  onTest,
  onEdit,
  onRotate,
  onToggle,
  onDelete,
}: ClientActionsProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-0.5 sm:flex-nowrap">
      <Tooltip content="查看详情" side="top">
        <IconButton label={`查看 ${client.name} 详情`} onClick={onView}>
          <Eye className="h-4 w-4" />
        </IconButton>
      </Tooltip>
      <Tooltip content="生成接入配置" side="top">
        <IconButton label={`生成 ${client.name} 接入配置`} onClick={onSdkConfig}>
          <Code className="h-4 w-4" />
        </IconButton>
      </Tooltip>
      {canWrite && (
        <>
          {!client.isPublic && (
            <Tooltip content="在线测试" side="top">
              <IconButton label={`在线测试 ${client.name}`} onClick={onTest}>
                <Shield className="h-4 w-4" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip content="编辑" side="top">
            <IconButton label={`编辑 ${client.name}`} onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </IconButton>
          </Tooltip>
          {!client.isPublic && (
            <Tooltip content="轮换密钥" side="top">
              <IconButton label={`轮换 ${client.name} 密钥`} onClick={onRotate}>
                <RotateCw className="h-4 w-4" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip content={client.isActive ? "禁用" : "启用"} side="top">
            <IconButton
              label={`${client.isActive ? "禁用" : "启用"} ${client.name}`}
              onClick={onToggle}
            >
              <Power className="h-4 w-4" />
            </IconButton>
          </Tooltip>
          <Tooltip content="删除 Client" side="top">
            <IconButton label={`删除 ${client.name}`} variant="danger" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </Tooltip>
        </>
      )}
    </div>
  );
}

/** 判断密钥是否处于轮换过渡期（5 分钟内旧 secret 仍可用）；仅在事件处理器中调用 */
function isInRotationGrace(secretRotatedAt: string | null | undefined): boolean {
  if (!secretRotatedAt) return false;
  return Date.now() - new Date(secretRotatedAt).getTime() <= 5 * 60 * 1000;
}

function OAuthClientsPage() {
  const searchParams = useSearchParams();
  const toast = useToast();
  const { requireTotp, totpModal } = useTotpConfirm();
  const { can: canAdmin } = useAdminPermissions();
  const canWrite = canAdmin("sso:clients:write");

  /** 高风险 Client 操作（停用/删除/轮换/缩权）：服务端要求 step-up，失败时拉起二次验证并重试 */
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
  const [clients, setClients] = useState<OAuthClient[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(() => {
    const p = Number(searchParams.get("page"));
    return Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1;
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  const [debouncedSearch, setDebouncedSearch] = useState(() => searchParams.get("search") || "");
  const urlSearch = searchParams.get("search") || "";
  const [prevUrlSearch, setPrevUrlSearch] = useState(urlSearch);
  if (prevUrlSearch !== urlSearch) {
    setPrevUrlSearch(urlSearch);
    setSearch(urlSearch);
    setDebouncedSearch(urlSearch);
  }
  const pageSize = 20;

  // Modal states
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editClient, setEditClient] = useState<OAuthClient | null>(null);

  // Rotate secret confirm modal
  const [rotateClient, setRotateClient] = useState<OAuthClient | null>(null);

  // Rotated secret display modal
  const [showRotatedSecret, setShowRotatedSecret] = useState(false);
  const [rotatedSecret, setRotatedSecret] = useState<string | null>(null);
  const [showRotatedSecretValue, setShowRotatedSecretValue] = useState(false);
  const [rotatedSecretSaved, setRotatedSecretSaved] = useState(false);

  // Delete confirm modal
  const [deleteClient, setDeleteClient] = useState<OAuthClient | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Disable confirm modal（禁用会级联撤销会话并 backchannel 登出子项目用户，需二次确认）
  const [disableClient, setDisableClient] = useState<OAuthClient | null>(null);

  // Detail drawer
  const [detailClient, setDetailClient] = useState<OAuthClient | null>(null);
  // 密钥轮换过渡期标记：打开抽屉时计算一次（渲染期禁止调用 Date.now）
  const [detailInRotationGrace, setDetailInRotationGrace] = useState(false);

  const openDetailDrawer = (client: OAuthClient) => {
    setDetailInRotationGrace(isInRotationGrace(client.secretRotatedAt));
    setDetailClient(client);
  };

  // Online test modal
  const [testClient, setTestClient] = useState<OAuthClient | null>(null);
  const [testSecret, setTestSecret] = useState("");
  const [testRedirectUri, setTestRedirectUri] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<TestResultData | null>(null);

  // Form
  const [formName, setFormName] = useState("");
  const [formRedirectUris, setFormRedirectUris] = useState("");
  const [formPostLogoutUris, setFormPostLogoutUris] = useState("");
  const [formScopes, setFormScopes] = useState("openid profile phone");
  const [formIsPublic, setFormIsPublic] = useState(false);
  const [formBackchannelUri, setFormBackchannelUri] = useState("");
  const [formWebhookUri, setFormWebhookUri] = useState("");
  const [formCodeTtl, setFormCodeTtl] = useState("300");
  const [formAccessTokenTtl, setFormAccessTokenTtl] = useState("28800");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // 编辑时缩减 scopes 的二次确认（缩权会立即撤销该 Client 全部会话）
  const [showScopeShrinkConfirm, setShowScopeShrinkConfirm] = useState(false);

  // Newly created secret
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [showNewSecret, setShowNewSecret] = useState(false);
  const [newSecretSaved, setNewSecretSaved] = useState(false);

  // SDK config
  const [showSdkConfig, setShowSdkConfig] = useState(false);
  const [sdkConfigClient, setSdkConfigClient] = useState<OAuthClient | null>(null);
  const [sdkConfigCode, setSdkConfigCode] = useState("");
  const [sdkClientType, setSdkClientType] = useState<ClientType>("confidential");

  const isCreateDirty =
    showCreate &&
    !newSecret &&
    (formName !== "" ||
      formRedirectUris !== "" ||
      formPostLogoutUris !== "" ||
      formScopes !== "openid profile phone" ||
      formIsPublic ||
      formBackchannelUri !== "" ||
      formWebhookUri !== "" ||
      formCodeTtl !== "300" ||
      formAccessTokenTtl !== "28800");

  const isEditDirty =
    showEdit &&
    !!editClient &&
    (formName !== editClient.name ||
      formRedirectUris !== editClient.redirectUris.join("\n") ||
      formPostLogoutUris !== (editClient.postLogoutRedirectUris || []).join("\n") ||
      formScopes !== editClient.scopes.join(" ") ||
      formIsPublic !== editClient.isPublic ||
      formBackchannelUri !== (editClient.backchannelLogoutUri || "") ||
      formWebhookUri !== (editClient.webhookUri || "") ||
      formCodeTtl !== String(editClient.codeTtlSeconds ?? 300) ||
      formAccessTokenTtl !== String(editClient.accessTokenTtlSeconds ?? 28800));

  const { confirmClose: confirmCloseCreate } = useUnsavedChanges(isCreateDirty);
  const { confirmClose: confirmCloseEdit } = useUnsavedChanges(isEditDirty);

  const takeLatestClients = useLatestRequest();
  const fetchClients = useCallback(async () => {
    const isLatest = takeLatestClients();
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      const data = await apiGet<ClientsResponse>(`/api/admin/oauth-clients?${params.toString()}`);
      if (!isLatest()) return;
      setClients(data.clients);
      setTotal(data.pagination.total);
      setLoadError(false);
    } catch (err) {
      if (!isLatest()) return;
      setLoadError(true);
      toast.error(err instanceof Error ? err.message : "获取 Client 列表失败");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [page, debouncedSearch, toast, takeLatestClients]);

  useEffect(() => {
    deferInEffect(fetchClients);
  }, [fetchClients]);

  // URL 仅在生效查询值变化后同步，避免每次击键都写 URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    else params.delete("search");
    if (page !== 1) params.set("page", String(page));
    else params.delete("page");
    const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState(null, "", newUrl);
  }, [debouncedSearch, page]);

  // 搜索防抖：输入停止 400ms 后才更新生效查询值，由 fetchClients 统一发起请求。
  // 跳过首次执行，避免 ?page=N 深链在挂载 400ms 后被重置回第 1 页。
  const searchDebounceMountedRef = useRef(false);
  useEffect(() => {
    if (!searchDebounceMountedRef.current) {
      searchDebounceMountedRef.current = true;
      return;
    }
    const handler = setTimeout(() => {
      setPage(1);
      setDebouncedSearch(search);
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  const resetForm = () => {
    setFormName("");
    setFormRedirectUris("");
    setFormPostLogoutUris("");
    setFormScopes("openid profile phone");
    setFormIsPublic(false);
    setFormBackchannelUri("");
    setFormWebhookUri("");
    setFormCodeTtl("300");
    setFormAccessTokenTtl("28800");
    setFormErrors({});
  };

  /** TTL 安全参数校验：与服务端 zod 范围一致（60–600 / 60–86400 秒） */
  const validateTtlFields = (nextErrors: Record<string, string>) => {
    const codeTtl = Number(formCodeTtl);
    if (!Number.isInteger(codeTtl) || codeTtl < 60 || codeTtl > 600) {
      nextErrors.codeTtlSeconds = "授权码有效期须为 60–600 秒的整数";
    }
    const accessTokenTtl = Number(formAccessTokenTtl);
    if (!Number.isInteger(accessTokenTtl) || accessTokenTtl < 60 || accessTokenTtl > 86400) {
      nextErrors.accessTokenTtlSeconds = "Access Token 有效期须为 60–86400 秒的整数";
    }
  };

  const handleCreate = async () => {
    setFormError(null);
    const nextErrors: Record<string, string> = {};
    if (!formName.trim()) nextErrors.name = "请输入应用名称";
    const uriValidation = validateRedirectUris(formRedirectUris);
    if (!uriValidation.valid) nextErrors.redirectUris = uriValidation.error || "回调 URL 格式错误";
    const postLogoutValidation = validatePostLogoutUris(formPostLogoutUris);
    if (!postLogoutValidation.valid) {
      nextErrors.postLogoutUris = postLogoutValidation.error || "Post Logout URL 格式错误";
    }
    const scopes = formScopes.split(" ").filter(Boolean);
    if (scopes.length === 0 || !scopes.includes("openid")) {
      nextErrors.scopes = "Scopes 必须包含 openid";
    }
    validateTtlFields(nextErrors);
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const data = await withStepUp(() =>
        apiPost<CreateClientResponse>("/api/admin/oauth-clients", {
          name: formName.trim(),
          redirectUris: uriValidation.parsed,
          postLogoutRedirectUris: postLogoutValidation.parsed,
          scopes,
          isPublic: formIsPublic,
          backchannelLogoutUri: formBackchannelUri.trim() || undefined,
          webhookUri: formWebhookUri.trim() || undefined,
          codeTtlSeconds: Number(formCodeTtl),
          accessTokenTtlSeconds: Number(formAccessTokenTtl),
        })
      );
      if (data === null) return;
      setNewSecret(data.plainSecret);
      setShowNewSecret(false);
      setNewSecretSaved(false);
      toast.success("Client 创建成功");
      fetchClients();
    } catch (err) {
      const message = err instanceof Error ? err.message : "创建 Client 失败";
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    setFormError(null);
    if (!editClient) return;
    const nextErrors: Record<string, string> = {};
    if (!formName.trim()) nextErrors.name = "请输入应用名称";
    const uriValidation = validateRedirectUris(formRedirectUris);
    if (!uriValidation.valid) nextErrors.redirectUris = uriValidation.error || "回调 URL 格式错误";
    const postLogoutValidation = validatePostLogoutUris(formPostLogoutUris);
    if (!postLogoutValidation.valid) {
      nextErrors.postLogoutUris = postLogoutValidation.error || "Post Logout URL 格式错误";
    }
    const scopes = formScopes.split(" ").filter(Boolean);
    if (scopes.length === 0 || !scopes.includes("openid")) {
      nextErrors.scopes = "Scopes 必须包含 openid";
    }
    validateTtlFields(nextErrors);
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    // 缩减 scopes 会立即撤销该 Client 全部会话与 Refresh Token，必须二次确认
    const removedScopes = editClient.scopes.filter((s) => !scopes.includes(s));
    if (removedScopes.length > 0) {
      setShowScopeShrinkConfirm(true);
      return;
    }
    await submitEdit();
  };

  const submitEdit = async () => {
    if (!editClient) return;
    const uriValidation = validateRedirectUris(formRedirectUris);
    const postLogoutValidation = validatePostLogoutUris(formPostLogoutUris);
    const scopes = formScopes.split(" ").filter(Boolean);
    setSaving(true);
    try {
      const saved = await withStepUp(() =>
        apiPatch<ClientActionResponse>(`/api/admin/oauth-clients/${editClient.id}`, {
          name: formName.trim(),
          redirectUris: uriValidation.parsed,
          postLogoutRedirectUris: postLogoutValidation.parsed,
          scopes,
          isPublic: formIsPublic,
          backchannelLogoutUri: formBackchannelUri.trim() || null,
          webhookUri: formWebhookUri.trim() || null,
          codeTtlSeconds: Number(formCodeTtl),
          accessTokenTtlSeconds: Number(formAccessTokenTtl),
        })
      );
      if (saved === null) return;
      toast.success("Client 更新成功");
      setShowEdit(false);
      setShowScopeShrinkConfirm(false);
      fetchClients();
    } catch (err) {
      const message = err instanceof Error ? err.message : "更新 Client 失败";
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteClient) return;
    if (deleteConfirmText !== deleteClient.name) {
      toast.error("请输入 Client 名称以确认删除");
      return;
    }
    setSaving(true);
    try {
      const deleted = await withStepUp(() =>
        apiDelete(`/api/admin/oauth-clients/${deleteClient.id}`)
      );
      if (deleted === null) return;
      toast.success("Client 已删除");
      setDeleteClient(null);
      setDeleteConfirmText("");
      if (clients.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        fetchClients();
      }
    } catch (err) {
      // 失败时保留弹窗与已输入的确认名称，便于重试
      toast.error(err instanceof Error ? err.message : "删除 Client 失败");
    } finally {
      setSaving(false);
    }
  };

  const handleRotateSecret = async () => {
    if (!rotateClient) return;
    setSaving(true);
    try {
      const data = await withStepUp(() =>
        apiPost<{ plainSecret: string }>(
          `/api/admin/oauth-clients/${rotateClient.id}/rotate-secret`,
          {
            confirm: true,
          }
        )
      );
      if (data === null) return;
      setRotatedSecret(data.plainSecret);
      setRotatedSecretSaved(false);
      setShowRotatedSecretValue(false);
      setShowRotatedSecret(true);
      toast.success("密钥轮换成功");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "密钥轮换失败");
    } finally {
      setSaving(false);
      setRotateClient(null);
    }
  };

  const handleToggleActive = async (client: OAuthClient) => {
    setSaving(true);
    try {
      const saved = await withStepUp(() =>
        apiPatch<ClientActionResponse>(`/api/admin/oauth-clients/${client.id}`, {
          isActive: !client.isActive,
        })
      );
      if (saved === null) return;
      toast.success(client.isActive ? "Client 已禁用" : "Client 已启用");
      setDisableClient(null);
      fetchClients();
    } catch (err) {
      // 失败时保留弹窗便于重试
      toast.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (client: OAuthClient) => {
    setFormError(null);
    setFormErrors({});
    setEditClient(client);
    setFormName(client.name);
    setFormRedirectUris(client.redirectUris.join("\n"));
    setFormPostLogoutUris((client.postLogoutRedirectUris || []).join("\n"));
    setFormScopes(client.scopes.join(" "));
    setFormIsPublic(client.isPublic);
    setFormBackchannelUri(client.backchannelLogoutUri || "");
    setFormWebhookUri(client.webhookUri || "");
    setFormCodeTtl(String(client.codeTtlSeconds ?? 300));
    setFormAccessTokenTtl(String(client.accessTokenTtlSeconds ?? 28800));
    setShowEdit(true);
  };

  const openTest = (client: OAuthClient) => {
    setTestClient(client);
    setTestSecret("");
    setTestRedirectUri(client.redirectUris[0] || "");
    setTestResult(null);
  };

  const handleRunTest = async () => {
    if (!testClient || !testSecret.trim()) {
      toast.error("请填写 Client Secret");
      return;
    }
    if (!testRedirectUri.trim()) {
      toast.error("请填写回调地址");
      return;
    }
    setTestLoading(true);
    setTestResult(null);
    try {
      const data = await apiPost<TestResultData>("/api/admin/oauth-clients/test", {
        clientId: testClient.clientId,
        clientSecret: testSecret.trim(),
        redirectUri: testRedirectUri.trim(),
      });
      setTestResult(data);
      const allPassed = data.allPassed ?? data.steps.every((s) => s.status === "passed");
      if (allPassed) toast.success("连接测试全部通过！");
      else toast.warning("连接测试未完全通过，请检查配置");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "测试请求失败");
    } finally {
      setTestLoading(false);
    }
  };

  const openCreate = () => {
    setFormError(null);
    setFormErrors({});
    resetForm();
    setNewSecret(null);
    setShowNewSecret(false);
    setNewSecretSaved(false);
    setShowCreate(true);
  };

  const copyToClipboard = async (text: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(text);
      toast.success("已复制到剪贴板");
    } catch {
      toast.error("复制失败，请手动选择复制");
    }
  };

  const getSdkConfigCode = (client: OAuthClient, type: ClientType) => {
    const ssoBaseUrl =
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_APP_URL || "https://nihplod.cn";
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
// code_challenge 必须由同一个 codeVerifier 计算（S256）
const codeChallenge = await crypto.subtle
  .digest("SHA-256", new TextEncoder().encode(codeVerifier))
  .then((buf) =>
    btoa(String.fromCharCode(...new Uint8Array(buf)))
      .replace(/\\+/g, "-")
      .replace(/\\//g, "_")
      .replace(/=+$/, "")
  );
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
    // Public Client 无 secret，默认展示 public 片段，避免复制到含 clientSecret 的错误示例
    const type: ClientType = client.isPublic ? "public" : "confidential";
    setSdkConfigClient(client);
    setSdkClientType(type);
    setSdkConfigCode(getSdkConfigCode(client, type));
    setShowSdkConfig(true);
  };

  const handleSdkTypeChange = async (type: ClientType) => {
    setSdkClientType(type);
    if (sdkConfigClient) {
      setSdkConfigCode(getSdkConfigCode(sdkConfigClient, type));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="SSO 应用（OAuth Client）管理"
        description="管理接入 SSO 的 OAuth 客户端，配置回调地址、Scopes 与令牌安全参数"
        actions={
          <>
            {canWrite && (
              <>
                <Link href="/admin/oauth-clients/wizard">
                  <Button variant="outline" size="sm">
                    向导创建
                  </Button>
                </Link>
                <Button size="sm" onClick={openCreate} leftIcon={<Plus className="h-4 w-4" />}>
                  新建 Client
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={fetchClients}>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              刷新
            </Button>
          </>
        }
      />

      {/* 工具栏：搜索与结果统计同一行，避免筛选控件堆叠 */}
      <div className="rounded-2xl border border-brand-charcoal/10 bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-charcoal/65" />
            <Input
              aria-label="搜索应用名称或 Client ID"
              placeholder="搜索名称 / Client ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={search ? "pl-10 pr-10" : "pl-10"}
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setDebouncedSearch("");
                  setPage(1);
                }}
                aria-label="清除搜索"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-brand-charcoal/65 transition-colors hover:bg-brand-charcoal/[0.06] hover:text-brand-charcoal"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <span className="text-sm text-brand-charcoal/65 md:ml-auto">共 {total} 个 Client</span>
        </div>
      </div>

      {/* 移动端卡片列表 */}
      <MobileList
        loading={loading}
        error={
          loadError ? (
            <>
              <p className="text-red-500">加载失败</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={fetchClients}>
                重试
              </Button>
            </>
          ) : undefined
        }
        empty={
          debouncedSearch ? `暂无匹配「${debouncedSearch}」的 Client` : "暂无 Client，请先创建"
        }
        isEmpty={!loading && !loadError && clients.length === 0}
      >
        {clients.map((c) => (
          <MobileListCard key={c.id}>
            <div className="flex items-start justify-between gap-3">
              <button
                onClick={() => openDetailDrawer(c)}
                className="min-w-0 text-left"
                aria-label={`查看 ${c.name} 详情`}
              >
                <p className="truncate font-medium text-brand-charcoal">{c.name}</p>
                <p className="mt-0.5 truncate font-mono text-xs text-brand-charcoal/65">
                  {c.clientId}
                </p>
              </button>
              <Badge variant={c.isActive ? "success" : "danger"}>
                {c.isActive ? "启用" : "禁用"}
              </Badge>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1">
              <Badge variant={c.isPublic ? "warning" : "secondary"} className="text-xs">
                {c.isPublic ? "Public" : "Confidential"}
              </Badge>
              {c.scopes.slice(0, 3).map((s) => (
                <Badge key={s} variant="secondary" className="text-xs">
                  {s}
                </Badge>
              ))}
              {c.scopes.length > 3 && (
                <span className="text-xs text-brand-charcoal/65">+{c.scopes.length - 3}</span>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-brand-charcoal/65">
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {c.activeUserCount ?? 0} 个活跃会话
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {c.lastActiveAt ? formatDate(c.lastActiveAt) : "从未活跃"}
              </span>
              <span className="col-span-2 truncate" title={c.redirectUris.join(", ")}>
                回调：{c.redirectUris[0] || "-"}
                {c.redirectUris.length > 1 && ` 等 ${c.redirectUris.length} 个`}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-brand-charcoal/10 pt-2">
              <button
                onClick={() => copyToClipboard(c.clientId)}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs text-brand-charcoal/65 hover:bg-brand-charcoal/[0.04] hover:text-brand-charcoal"
              >
                <Copy className="h-3.5 w-3.5" />
                复制 Client ID
              </button>
              <ClientActions
                client={c}
                canWrite={canWrite}
                onView={() => openDetailDrawer(c)}
                onSdkConfig={() => openSdkConfig(c)}
                onTest={() => openTest(c)}
                onEdit={() => openEdit(c)}
                onRotate={() => setRotateClient(c)}
                onToggle={() => (c.isActive ? setDisableClient(c) : handleToggleActive(c))}
                onDelete={() => {
                  setDeleteClient(c);
                  setDeleteConfirmText("");
                }}
              />
            </div>
          </MobileListCard>
        ))}
      </MobileList>

      {/* 桌面端表格 */}
      <div className="hidden overflow-x-auto rounded-2xl border border-brand-charcoal/10 bg-white md:block">
        <table className="w-full min-w-[1392px] table-fixed text-sm">
          <colgroup>
            <col className="w-[240px]" />
            <col className="w-[128px]" />
            <col className="w-[180px]" />
            <col className="w-[220px]" />
            <col className="w-[124px]" />
            <col className="w-[88px]" />
            <col className="w-[104px]" />
            <col className="w-[308px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-brand-charcoal/10 bg-brand-charcoal/[0.02] text-left">
              <th scope="col" className="whitespace-nowrap px-4 py-3 font-normal">
                应用
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-3 font-normal">
                类型
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-3 font-normal">
                回调 URL
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-3 font-normal">
                Scopes
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-3 font-normal">
                活跃情况
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-3 font-normal">
                状态
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-3 font-normal">
                创建时间
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-3 text-right font-normal">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-charcoal/10">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} columns={8} />)
            ) : loadError ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center">
                  <p className="text-sm text-red-500">加载失败</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={fetchClients}>
                    重试
                  </Button>
                </td>
              </tr>
            ) : clients.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="flex justify-center py-8">
                    <Empty
                      title="暂无 Client"
                      description={
                        debouncedSearch
                          ? `没有匹配「${debouncedSearch}」的 Client，请调整搜索条件`
                          : "创建第一个 OAuth Client 以接入 SSO"
                      }
                    />
                  </div>
                </td>
              </tr>
            ) : (
              clients.map((c) => (
                <tr key={c.id} className="hover:bg-brand-charcoal/[0.03]">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openDetailDrawer(c)}
                      className="block w-full truncate text-left font-medium text-brand-charcoal hover:text-brand-primary hover:underline"
                      title={c.name}
                    >
                      {c.name}
                    </button>
                    <div className="mt-0.5 flex min-w-0 items-center gap-1.5 font-mono text-xs text-brand-charcoal/65">
                      <span className="min-w-0 truncate" title={c.clientId}>
                        {c.clientId}
                      </span>
                      <Tooltip content="复制 Client ID" side="top">
                        <button
                          aria-label="复制 Client ID"
                          onClick={() => copyToClipboard(c.clientId)}
                          className="inline-flex shrink-0 text-brand-charcoal/65 hover:text-brand-charcoal/70"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </Tooltip>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={c.isPublic ? "warning" : "secondary"}
                      className="whitespace-nowrap text-xs"
                    >
                      {c.isPublic ? "Public" : "Confidential"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-brand-charcoal/70">
                    <span className="block truncate" title={c.redirectUris.join(", ")}>
                      {c.redirectUris[0] || "-"}
                      {c.redirectUris.length > 1 && (
                        <span className="text-brand-charcoal/50">
                          {" "}
                          +{c.redirectUris.length - 1}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-nowrap items-center gap-1 overflow-hidden">
                      {c.scopes.slice(0, 2).map((s) => (
                        <Badge key={s} variant="secondary" className="whitespace-nowrap text-xs">
                          {s}
                        </Badge>
                      ))}
                      {c.scopes.length > 2 && (
                        <span
                          className="shrink-0 cursor-default text-xs text-brand-charcoal/65"
                          title={c.scopes.slice(2).join(", ")}
                        >
                          +{c.scopes.length - 2}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 whitespace-nowrap text-sm text-brand-charcoal/70">
                      <Users className="h-3.5 w-3.5 text-brand-charcoal/65" />
                      {c.activeUserCount ?? "-"}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-xs text-brand-charcoal/55">
                      <Clock className="h-3.5 w-3.5 text-brand-charcoal/65" />
                      {c.lastActiveAt ? formatDate(c.lastActiveAt) : "从未活跃"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={c.isActive ? "success" : "danger"}
                      className="whitespace-nowrap"
                    >
                      {c.isActive ? "启用" : "禁用"}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-brand-charcoal/65">
                    {formatDate(c.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <ClientActions
                      client={c}
                      canWrite={canWrite}
                      onView={() => openDetailDrawer(c)}
                      onSdkConfig={() => openSdkConfig(c)}
                      onTest={() => openTest(c)}
                      onEdit={() => openEdit(c)}
                      onRotate={() => setRotateClient(c)}
                      onToggle={() => (c.isActive ? setDisableClient(c) : handleToggleActive(c))}
                      onDelete={() => {
                        setDeleteClient(c);
                        setDeleteConfirmText("");
                      }}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className="flex justify-center">
          <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />
        </div>
      )}

      {/* Create Modal */}
      <Modal
        open={showCreate}
        onClose={() => {
          setShowCreate(false);
          setNewSecret(null);
        }}
        title="新建 OAuth Client"
        size="lg"
        mobileFullScreen
        // 一次性 Secret 展示期间禁止 Esc/遮罩/关闭按钮误关（关闭按钮另有"已保存"勾选门控）
        closeOnBackdrop={false}
        closeOnEscape={!newSecret}
        showCloseButton={!newSecret}
        closeGuard={newSecret ? undefined : () => !saving && confirmCloseCreate()}
        footer={
          newSecret ? (
            <div className="flex justify-end">
              <Button
                disabled={!newSecretSaved}
                onClick={() => {
                  setShowCreate(false);
                  setNewSecret(null);
                  fetchClients();
                }}
              >
                关闭
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  if (confirmCloseCreate()) setShowCreate(false);
                }}
                disabled={saving}
              >
                取消
              </Button>
              <Button onClick={handleCreate} loading={saving}>
                创建
              </Button>
            </div>
          )
        }
      >
        {newSecret ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="mb-2 text-sm font-medium text-green-800">Client 创建成功！</p>
              <p className="mb-3 text-xs text-green-600">
                请立即复制并安全保存 Client Secret，关闭后无法再次查看。
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type={showNewSecret ? "text" : "password"}
                  value={newSecret}
                  readOnly
                  className="flex-1 font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowNewSecret(!showNewSecret)}
                  leftIcon={
                    showNewSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />
                  }
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(newSecret)}
                  leftIcon={<Copy className="h-4 w-4" />}
                >
                  复制
                </Button>
              </div>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={newSecretSaved}
                  onChange={(e) => setNewSecretSaved(e.target.checked)}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-amber-800">我已安全保存 Client Secret</p>
                  <p className="mt-0.5 text-xs text-amber-600">
                    Secret 仅显示一次，关闭后无法再次查看。未完成保存前请勿关闭。
                  </p>
                </div>
              </label>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {formError}
              </div>
            )}
            <ClientFormFields
              formName={formName}
              onFormNameChange={setFormName}
              formRedirectUris={formRedirectUris}
              onFormRedirectUrisChange={setFormRedirectUris}
              formPostLogoutUris={formPostLogoutUris}
              onFormPostLogoutUrisChange={setFormPostLogoutUris}
              formScopes={formScopes}
              onFormScopesChange={setFormScopes}
              formIsPublic={formIsPublic}
              onFormIsPublicChange={setFormIsPublic}
              formBackchannelUri={formBackchannelUri}
              onFormBackchannelUriChange={setFormBackchannelUri}
              formWebhookUri={formWebhookUri}
              onFormWebhookUriChange={setFormWebhookUri}
              formCodeTtl={formCodeTtl}
              onFormCodeTtlChange={setFormCodeTtl}
              formAccessTokenTtl={formAccessTokenTtl}
              onFormAccessTokenTtlChange={setFormAccessTokenTtl}
              errors={formErrors}
            />
          </div>
        )}
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        title="编辑 OAuth Client"
        size="lg"
        mobileFullScreen
        closeOnBackdrop={false}
        closeGuard={() => !saving && confirmCloseEdit()}
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                if (confirmCloseEdit()) setShowEdit(false);
              }}
              disabled={saving}
            >
              取消
            </Button>
            <Button onClick={handleEdit} loading={saving}>
              保存
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {formError}
            </div>
          )}
          <ClientFormFields
            formName={formName}
            onFormNameChange={setFormName}
            formRedirectUris={formRedirectUris}
            onFormRedirectUrisChange={setFormRedirectUris}
            formPostLogoutUris={formPostLogoutUris}
            onFormPostLogoutUrisChange={setFormPostLogoutUris}
            formScopes={formScopes}
            onFormScopesChange={setFormScopes}
            formIsPublic={formIsPublic}
            onFormIsPublicChange={setFormIsPublic}
            formBackchannelUri={formBackchannelUri}
            onFormBackchannelUriChange={setFormBackchannelUri}
            formWebhookUri={formWebhookUri}
            onFormWebhookUriChange={setFormWebhookUri}
            formCodeTtl={formCodeTtl}
            onFormCodeTtlChange={setFormCodeTtl}
            formAccessTokenTtl={formAccessTokenTtl}
            onFormAccessTokenTtlChange={setFormAccessTokenTtl}
            errors={formErrors}
          />
        </div>
      </Modal>

      {/* 缩减 Scopes 二次确认：缩权会立即使该应用所有已登录用户下线 */}
      <ConfirmDialog
        open={showScopeShrinkConfirm}
        onClose={() => setShowScopeShrinkConfirm(false)}
        onConfirm={submitEdit}
        type="danger"
        title="确认缩减权限范围"
        description={`本次修改移除了 scope：${
          editClient
            ? editClient.scopes
                .filter((s) => !formScopes.split(" ").filter(Boolean).includes(s))
                .join(", ")
            : ""
        }。减少权限范围将立即使该应用所有已登录用户下线（撤销全部会话与 Refresh Token，并通过 Backchannel Logout 通知子站登出），确定继续吗？`}
        confirmText="确认缩权并保存"
        loading={saving}
      />

      {/* Rotate Secret Confirm */}
      <ConfirmDialog
        open={!!rotateClient}
        onClose={() => setRotateClient(null)}
        onConfirm={handleRotateSecret}
        type="danger"
        title="轮换 Client 密钥"
        description={`确定要轮换「${rotateClient?.name || ""}」（${rotateClient?.clientId || ""}）的密钥？旧 Secret 在 5 分钟过渡期内仍可使用，之后自动失效。所有使用旧密钥的子项目需要在过渡期内更新配置。`}
        confirmText="确定轮换"
        loading={saving}
      />

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteClient}
        onClose={() => {
          setDeleteClient(null);
          setDeleteConfirmText("");
        }}
        onConfirm={handleDelete}
        type="danger"
        title="删除 Client"
        description={`确定要删除「${deleteClient?.name || ""}」（${deleteClient?.clientId || ""}）吗？删除后该 Client 将无法继续接入 SSO，所有已授权用户需要重新授权。请在下方输入 Client 名称以确认。`}
        confirmText="确定删除"
        loading={saving}
        confirmDisabled={deleteConfirmText !== (deleteClient?.name || "")}
      >
        <Input
          value={deleteConfirmText}
          onChange={(e) => setDeleteConfirmText(e.target.value)}
          aria-label="输入 Client 名称以确认删除"
          data-autofocus
          placeholder={`输入 ${deleteClient?.name || "Client 名称"}`}
          className="mt-2"
        />
      </ConfirmDialog>

      {/* Disable Confirm（启用无需确认，直接生效） */}
      <ConfirmDialog
        open={!!disableClient}
        onClose={() => setDisableClient(null)}
        onConfirm={() => (disableClient ? handleToggleActive(disableClient) : undefined)}
        type="danger"
        title="禁用 Client"
        description={`确定要禁用「${disableClient?.name || ""}」吗？禁用后该 Client 的所有用户会话将立即失效，子项目用户会被登出。`}
        confirmText="确定禁用"
        loading={saving}
      />

      {/* Rotated Secret Display Modal */}
      <Modal
        open={showRotatedSecret}
        onClose={() => {
          setShowRotatedSecret(false);
          setRotatedSecret(null);
        }}
        title="Client Secret 轮换成功"
        // 一次性 Secret 展示期间禁止 Esc/遮罩/关闭按钮误关（关闭按钮另有"已保存"勾选门控）
        closeOnBackdrop={!rotatedSecret}
        closeOnEscape={!rotatedSecret}
        showCloseButton={!rotatedSecret}
        footer={
          <div className="flex justify-end">
            <Button
              disabled={!rotatedSecretSaved}
              onClick={() => {
                setShowRotatedSecret(false);
                setRotatedSecret(null);
                fetchClients();
              }}
            >
              关闭
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="mb-2 text-sm font-medium text-green-800">新 Secret 已生成</p>
            <p className="mb-3 text-xs text-green-600">
              请立即复制并安全保存。旧 Secret 在 5
              分钟过渡期内仍可使用，之后自动失效，关闭后无法再次查看新 Secret。
            </p>
            <div className="flex items-center gap-2">
              <Input
                type={showRotatedSecretValue ? "text" : "password"}
                value={rotatedSecret || ""}
                readOnly
                className="flex-1 font-mono text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRotatedSecretValue(!showRotatedSecretValue)}
                leftIcon={
                  showRotatedSecretValue ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )
                }
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => rotatedSecret && copyToClipboard(rotatedSecret)}
                leftIcon={<Copy className="h-4 w-4" />}
              >
                复制
              </Button>
            </div>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={rotatedSecretSaved}
                onChange={(e) => setRotatedSecretSaved(e.target.checked)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-amber-800">我已安全保存 Client Secret</p>
                <p className="mt-0.5 text-xs text-amber-600">
                  Secret 仅显示一次，关闭后无法再次查看。未完成保存前请勿关闭。
                </p>
              </div>
            </label>
          </div>
        </div>
      </Modal>

      {/* Online Test Modal */}
      <Modal
        open={!!testClient}
        onClose={() => {
          setTestClient(null);
          // 清除内存中残留的明文 secret（只在本次测试中需要）
          setTestSecret("");
        }}
        title={`在线测试：${testClient?.name || ""}`}
        size="lg"
        mobileFullScreen
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setTestClient(null);
                setTestSecret("");
              }}
            >
              关闭
            </Button>
            <Button
              onClick={handleRunTest}
              loading={testLoading}
              leftIcon={<Shield className="h-4 w-4" />}
            >
              开始测试
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-brand-charcoal/65">
            输入 Client Secret 与回调地址，验证凭据、JWKS、authorize、token、userinfo、introspect
            全链路连通性。
          </p>
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
            如果没有保存 secret，请先轮换密钥获取新 secret。
          </p>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-charcoal/70">
                Client Secret
              </label>
              <Input
                type="password"
                autoComplete="off"
                value={testSecret}
                onChange={(e) => setTestSecret(e.target.value)}
                placeholder="请输入 Client Secret"
                className="font-mono text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-charcoal/70">
                回调地址
              </label>
              <Input
                value={testRedirectUri}
                onChange={(e) => setTestRedirectUri(e.target.value)}
                placeholder="https://your-app.com/callback"
                className="font-mono text-sm"
              />
            </div>
          </div>

          {testResult && (
            <div
              className={`rounded-lg p-4 ${testResult.steps.every((s) => s.status === "passed") ? "border border-emerald-200 bg-emerald-50" : "border border-amber-200 bg-amber-50"}`}
            >
              <p
                className={`mb-2 text-sm font-medium ${testResult.steps.every((s) => s.status === "passed") ? "text-emerald-800" : "text-amber-800"}`}
              >
                {testResult.steps.every((s) => s.status === "passed")
                  ? "✅ 连接测试全部通过"
                  : "⚠️ 测试未完全通过"}
              </p>
              <div className="space-y-1">
                {testResult.steps.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className={s.status === "passed" ? "text-green-600" : "text-red-500"}>
                      {s.status === "passed" ? "✓" : "✗"}
                    </span>
                    <span className="text-brand-charcoal/70">
                      {s.step}
                      {s.durationMs !== undefined && (
                        <span className="ml-1 text-brand-charcoal/65">({s.durationMs}ms)</span>
                      )}
                      {s.detail && (
                        <span className="ml-1 text-brand-charcoal/65">— {s.detail}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* SDK Config Modal */}
      <Modal
        open={showSdkConfig}
        onClose={() => setShowSdkConfig(false)}
        title="接入配置代码"
        size="lg"
        mobileFullScreen
        footer={
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setShowSdkConfig(false)}>
              关闭
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex gap-2 rounded-lg bg-brand-charcoal/[0.06] p-1">
            <button
              onClick={() => handleSdkTypeChange("confidential")}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                sdkClientType === "confidential"
                  ? "bg-white text-brand-charcoal shadow-sm"
                  : "text-brand-charcoal/65 hover:text-brand-charcoal/70"
              )}
            >
              <Shield className="h-4 w-4" />
              Confidential（服务端）
            </button>
            <button
              onClick={() => handleSdkTypeChange("public")}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                sdkClientType === "public"
                  ? "bg-white text-brand-charcoal shadow-sm"
                  : "text-brand-charcoal/65 hover:text-brand-charcoal/70"
              )}
            >
              <Smartphone className="h-4 w-4" />
              Public（SPA/移动端）
            </button>
          </div>
          <p className="text-sm text-brand-charcoal/70">
            {sdkClientType === "confidential"
              ? "适用于 Next.js / 服务端应用，后端通过 introspection 验证 token。client_secret 必须保密。"
              : "适用于 SPA、移动端、桌面端，不传输 client_secret，必须使用 PKCE。"}
          </p>
          <div className="relative">
            <pre className="max-h-80 overflow-x-auto rounded-lg bg-gray-900 p-4 text-xs text-green-400">
              <code>{sdkConfigCode}</code>
            </pre>
            <span className="absolute right-2 top-2">
              <Tooltip content="复制代码" side="top">
                <button
                  aria-label="复制代码"
                  onClick={() => copyToClipboard(sdkConfigCode)}
                  className="inline-flex rounded bg-brand-charcoal p-1.5 text-white hover:bg-brand-charcoal/90"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
            </span>
          </div>
          <p className="text-xs text-brand-charcoal/65">
            将代码复制到子项目中即可快速接入。详情请参考{" "}
            <a
              href={`${process.env.NEXT_PUBLIC_APP_URL || "https://nihplod.cn"}/api/oauth/docs`}
              target="_blank"
              className="text-brand-primary underline"
              rel="noreferrer"
            >
              OAuth API 文档
            </a>
            。
          </p>
        </div>
      </Modal>

      {/* Detail Drawer（复用 Modal 的焦点陷阱/Esc/滚动锁/aria 语义） */}
      <Modal
        open={!!detailClient}
        onClose={() => setDetailClient(null)}
        title={detailClient?.name}
        description={detailClient ? `Client ID: ${detailClient.clientId}` : undefined}
        variant="drawer"
        size="md"
      >
        {detailClient && (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="rounded-lg bg-brand-charcoal/[0.03] p-4">
                <h3 className="mb-3 text-sm font-medium text-brand-charcoal/70">基本信息</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-brand-charcoal/65">状态</span>
                    <Badge variant={detailClient.isActive ? "success" : "danger"}>
                      {detailClient.isActive ? "启用" : "禁用"}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-brand-charcoal/65">类型</span>
                    <Badge variant={detailClient.isPublic ? "warning" : "secondary"}>
                      {detailClient.isPublic ? "Public" : "Confidential"}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-brand-charcoal/65">活跃会话</span>
                    <span>{detailClient.activeUserCount ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-brand-charcoal/65">最近活跃</span>
                    <span>
                      {detailClient.lastActiveAt ? formatDateTime(detailClient.lastActiveAt) : "-"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-brand-charcoal/65">创建时间</span>
                    <span>{formatDateTime(detailClient.createdAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-brand-charcoal/65">更新时间</span>
                    <span>{formatDateTime(detailClient.updatedAt)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-brand-charcoal/[0.03] p-4">
                <h3 className="mb-3 text-sm font-medium text-brand-charcoal/70">安全参数</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-brand-charcoal/65">授权码有效期</span>
                    <span>{detailClient.codeTtlSeconds ?? 300} 秒</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-brand-charcoal/65">Access Token 有效期</span>
                    <span>{detailClient.accessTokenTtlSeconds ?? 28800} 秒</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-brand-charcoal/65">最近密钥轮换</span>
                    <span className="text-right">
                      {detailClient.secretRotatedAt ? (
                        <>
                          {formatDateTime(detailClient.secretRotatedAt)}
                          {detailInRotationGrace && (
                            <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                              过渡期内（旧密钥 5 分钟内仍可用）
                            </span>
                          )}
                        </>
                      ) : (
                        "从未轮换"
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium text-brand-charcoal/70">
                  权限范围（Scopes）
                </h3>
                <div className="flex flex-wrap gap-2">
                  {detailClient.scopes.map((s) => (
                    <Badge key={s} variant="secondary">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium text-brand-charcoal/70">回调 URL</h3>
                <ul className="space-y-2">
                  {detailClient.redirectUris.map((uri) => (
                    <li
                      key={uri}
                      className="break-all rounded bg-brand-charcoal/[0.03] p-2 font-mono text-sm"
                    >
                      {uri}
                    </li>
                  ))}
                </ul>
              </div>

              {(detailClient.postLogoutRedirectUris || []).length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-medium text-brand-charcoal/70">
                    Post Logout Redirect URIs
                  </h3>
                  <ul className="space-y-2">
                    {detailClient.postLogoutRedirectUris.map((uri) => (
                      <li
                        key={uri}
                        className="break-all rounded bg-brand-charcoal/[0.03] p-2 font-mono text-sm"
                      >
                        {uri}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {detailClient.backchannelLogoutUri && (
                <div>
                  <h3 className="mb-2 text-sm font-medium text-brand-charcoal/70">
                    Backchannel Logout URI
                  </h3>
                  <p className="break-all rounded bg-brand-charcoal/[0.03] p-2 font-mono text-sm">
                    {detailClient.backchannelLogoutUri}
                  </p>
                </div>
              )}

              {detailClient.webhookUri && (
                <div>
                  <h3 className="mb-2 text-sm font-medium text-brand-charcoal/70">
                    资料变更 Webhook URI
                  </h3>
                  <p className="break-all rounded bg-brand-charcoal/[0.03] p-2 font-mono text-sm">
                    {detailClient.webhookUri}
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-2 border-t pt-4">
              {canWrite && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setDetailClient(null);
                    openEdit(detailClient);
                  }}
                  leftIcon={<Pencil className="h-4 w-4" />}
                >
                  编辑
                </Button>
              )}
              <Button
                onClick={() => {
                  setDetailClient(null);
                  openSdkConfig(detailClient);
                }}
                leftIcon={<Code className="h-4 w-4" />}
              >
                接入配置
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 高风险操作二次验证 */}
      {totpModal}
    </div>
  );
}

export default function OAuthClientsPageWrapper() {
  return (
    <RequirePermission permission="sso:clients:read">
      <Suspense fallback={<div className="p-6 text-center text-brand-charcoal/65">加载中...</div>}>
        <OAuthClientsPage />
      </Suspense>
    </RequirePermission>
  );
}
