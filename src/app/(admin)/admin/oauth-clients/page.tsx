"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, Power, Copy, EyeOff, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api-client";

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

interface DeleteResponse {
  message: string;
}

const formatDate = (dateStr: string) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("zh-CN");
};

export default function OAuthClientsPage() {
  const toast = useToast();
  const [clients, setClients] = useState<OAuthClient[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const pageSize = 20;

  // Modal states
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [editClient, setEditClient] = useState<OAuthClient | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form
  const [formName, setFormName] = useState("");
  const [formRedirectUris, setFormRedirectUris] = useState("");
  const [formScopes, setFormScopes] = useState("openid profile phone");
  const [formBackchannelUri, setFormBackchannelUri] = useState("");
  const [saving, setSaving] = useState(false);

  // Newly created secret
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<ClientsResponse>(`/api/admin/oauth-clients?page=${page}&pageSize=${pageSize}`);
      setClients(data.clients);
      setTotal(data.pagination.total);
    } catch {
      toast.error("获取 Client 列表失败");
    } finally {
      setLoading(false);
    }
  }, [page, toast]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const resetForm = () => {
    setFormName("");
    setFormRedirectUris("");
    setFormScopes("openid profile phone");
    setFormBackchannelUri("");
  };

  const handleCreate = async () => {
    if (!formName.trim()) {
      toast.error("请输入应用名称");
      return;
    }
    const uris = formRedirectUris.split("\n").map((u) => u.trim()).filter(Boolean);
    if (uris.length === 0) {
      toast.error("至少需要一个回调 URL");
      return;
    }
    const scopes = formScopes.split(" ").filter(Boolean);

    setSaving(true);
    try {
      const data = await apiPost<CreateClientResponse>("/api/admin/oauth-clients", {
        name: formName.trim(),
        redirectUris: uris,
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
    if (!editClient || !formName.trim()) {
      toast.error("请输入应用名称");
      return;
    }
    const uris = formRedirectUris.split("\n").map((u) => u.trim()).filter(Boolean);
    if (uris.length === 0) {
      toast.error("至少需要一个回调 URL");
      return;
    }
    const scopes = formScopes.split(" ").filter(Boolean);

    setSaving(true);
    try {
      await apiPatch<ClientActionResponse>(`/api/admin/oauth-clients/${editClient.id}`, {
        name: formName.trim(),
        redirectUris: uris,
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

  const handleDelete = async () => {
    if (!deleteId) return;
    setSaving(true);
    try {
      await apiDelete<DeleteResponse>(`/api/admin/oauth-clients/${deleteId}`);
      toast.success("Client 已停用");
      setShowDelete(false);
      fetchClients();
    } catch {
      toast.error("网络错误");
    } finally {
      setSaving(false);
    }
  };

  const handleRotateSecret = async (clientId: string) => {
    if (!confirm("确定要轮换该 Client 的密钥？轮换后旧密钥将在 5 分钟内失效。")) return;
    setSaving(true);
    try {
      const data = await apiPost<{ plainSecret: string }>(
        `/api/admin/oauth-clients/${clientId}/rotate-secret`,
        { confirm: true }
      );
      setNewSecret(data.plainSecret);
      setShowCreate(true); // 复用 create modal 展示新 secret
      toast.success("密钥轮换成功");
    } catch {
      toast.error("密钥轮换失败");
    } finally {
      setSaving(false);
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
    setEditClient(client);
    setFormName(client.name);
    setFormRedirectUris(client.redirectUris.join("\n"));
    setFormScopes(client.scopes.join(" "));
    setFormBackchannelUri(client.backchannelLogoutUri || "");
    setShowEdit(true);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success("已复制到剪贴板");
    });
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">OAuth Client 管理</h1>
        <Button
          onClick={() => {
            resetForm();
            setNewSecret(null);
            setShowCreate(true);
          }}
          leftIcon={<Plus className="w-4 h-4" />}
        >
          新建 Client
        </Button>
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
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">状态</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">创建时间</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-500">加载中...</td>
              </tr>
            ) : clients.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-500">暂无数据</td>
              </tr>
            ) : (
              clients.map((c) => (
                <tr key={c.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-600">{c.clientId}</td>
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
                  <td className="px-4 py-3">
                    <Badge variant={c.isActive ? "success" : "danger"}>
                      {c.isActive ? "启用" : "禁用"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(c.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(c)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                        title="编辑"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRotateSecret(c.id)}
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
                      <button
                        onClick={() => { setDeleteId(c.id); setShowDelete(true); }}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
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
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Scopes（空格分隔）</label>
              <Input value={formScopes} onChange={(e) => setFormScopes(e.target.value)} placeholder="openid profile phone membership" />
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
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Scopes（空格分隔）</label>
            <Input value={formScopes} onChange={(e) => setFormScopes(e.target.value)} />
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

      {/* Delete Confirm */}
      <ConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="停用 OAuth Client"
        description="停用后该 Client 将无法发起授权请求，所有已签发的 Token 仍有效。确定停用？"
        confirmText="确定停用"
      />
    </div>
  );
}
