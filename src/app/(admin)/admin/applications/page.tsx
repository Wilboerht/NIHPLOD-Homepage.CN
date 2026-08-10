"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  Download,
  Eye,
  Trash2,
  Clock,
  FileText,
  User,
  Briefcase,
  Filter,
  FolderPlus,
  Folder,
  Edit2,
  X,
  Tag,
} from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Textarea } from "@/components/ui/Textarea";
import { Pagination } from "@/components/ui/Pagination";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import { Empty } from "@/components/ui/Empty";
import { cn } from "@/lib/utils";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/lib/api-client";
import { apiConsole } from "@/lib/logger";
import { deferInEffect } from "@/hooks/deferInEffect";

interface Job {
  id: string;
  title: string;
  titleEn: string;
  location?: string;
  type?: string;
}

interface ApplicationFolder {
  id: string;
  name: string;
  description?: string | null;
  applicationCount: number;
}

interface Application {
  id: string;
  jobId: string;
  name: string;
  phone: string;
  resumePath: string;
  status: string;
  notes: string | null;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
  job: Job;
  folder?: { id: string; name: string } | null;
}

// 状态配置
const statusConfig: Record<
  string,
  { label: string; color: "default" | "warning" | "primary" | "success" | "danger" }
> = {
  pending: { label: "待处理", color: "warning" },
  reviewed: { label: "已查看", color: "primary" },
  interviewed: { label: "已面试", color: "default" },
  rejected: { label: "已拒绝", color: "danger" },
  hired: { label: "已录用", color: "success" },
};

export default function AdminApplicationsPage() {
  const { success, error: showError } = useToast();

  // 状态
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [statusFilter, setStatusFilter] = useState("all");
  const [jobFilter, setJobFilter] = useState("all");
  const [folderFilter, setFolderFilter] = useState("all");
  const [jobs, setJobs] = useState<Job[]>([]);

  // 分类夹相关状态
  const [folders, setFolders] = useState<ApplicationFolder[]>([]);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<ApplicationFolder | null>(null);
  const [folderForm, setFolderForm] = useState({ name: "", description: "" });
  const [savingFolder, setSavingFolder] = useState(false);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<ApplicationFolder | null>(null);
  const [deletingFolder, setDeletingFolder] = useState(false);

  // 详情弹窗
  const [detailApplication, setDetailApplication] = useState<Application | null>(null);
  const [editingNotes, setEditingNotes] = useState("");

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<Application | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 获取分类夹列表
  const fetchFolders = useCallback(async () => {
    try {
      const data = await apiGet<ApplicationFolder[]>("/api/admin/application-folders");
      setFolders(data);
    } catch (error) {
      apiConsole.error("获取分类夹列表失败:", error);
    }
  }, []);

  // 获取职位列表（用于筛选）
  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const data = await apiGet<{ items: Job[] }>("/api/admin/jobs", { pageSize: 100 });
        setJobs(data.items);
      } catch (error) {
        apiConsole.error("获取职位列表失败:", error);
      }
    };
    deferInEffect(() => {
      fetchJobs();
      fetchFolders();
    });
  }, [fetchFolders]);

  // 获取申请列表
  const fetchApplications = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: "20",
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (jobFilter !== "all") params.set("jobId", jobFilter);
      if (folderFilter !== "all") params.set("folderId", folderFilter);

      const data = await apiGet<{
        items: Application[];
        pagination: { total: number };
        pendingCount: number;
      }>("/api/admin/applications", Object.fromEntries(params.entries()));

      setApplications(data.items);
      setTotal(data.pagination.total);
      setPendingCount(data.pendingCount);
    } catch (error) {
      apiConsole.error("获取申请列表失败:", error);
      if (error instanceof ApiError && error.status === 401) {
        showError("登录已过期，请重新登录");
        window.location.href = "/admin-login";
        return;
      }
      showError("网络异常，请刷新重试");
      setApplications([]);
      setTotal(0);
      setPendingCount(0);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, jobFilter, folderFilter, showError]);

  useEffect(() => {
    deferInEffect(fetchApplications);
  }, [fetchApplications]);

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // 更新状态
  const updateStatus = async (application: Application, newStatus: string, toastMsg?: string) => {
    try {
      await apiPatch(`/api/admin/applications/${application.id}`, { status: newStatus });
      success(toastMsg || "状态已更新");
      fetchApplications();
      if (detailApplication?.id === application.id) {
        setDetailApplication({ ...application, status: newStatus });
      }
    } catch {
      showError("更新失败");
    }
  };

  // 保存备注
  const saveNotes = async () => {
    if (!detailApplication) return;

    try {
      await apiPatch(`/api/admin/applications/${detailApplication.id}`, { notes: editingNotes });
      success("备注已保存");
      setDetailApplication({ ...detailApplication, notes: editingNotes });
      fetchApplications();
    } catch {
      showError("保存失败");
    }
  };

  // 删除申请
  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      await apiDelete(`/api/admin/applications/${deleteTarget.id}`);
      success("申请已删除");
      setDeleteTarget(null);
      fetchApplications();
    } catch {
      showError("删除失败");
    } finally {
      setDeleting(false);
    }
  };

  // 查看详情
  const viewDetail = (application: Application) => {
    setDetailApplication(application);
    setEditingNotes(application.notes || "");
    // 自动标记为已查看
    if (application.status === "pending") {
      updateStatus(application, "reviewed", "已将申请标记为已查看");
    }
  };

  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // 下载简历
  const downloadResume = (application: Application) => {
    window.open(application.resumePath, "_blank");
  };

  // 打开分类夹编辑弹窗
  const openFolderModal = (folder?: ApplicationFolder) => {
    if (folder) {
      setEditingFolder(folder);
      setFolderForm({ name: folder.name, description: folder.description || "" });
    } else {
      setEditingFolder(null);
      setFolderForm({ name: "", description: "" });
    }
    setShowFolderModal(true);
  };

  // 保存分类夹
  const saveFolder = async () => {
    if (!folderForm.name.trim()) {
      showError("请输入分类名称");
      return;
    }

    setSavingFolder(true);
    try {
      if (editingFolder) {
        await apiPatch(`/api/admin/application-folders/${editingFolder.id}`, folderForm);
      } else {
        await apiPost("/api/admin/application-folders", folderForm);
      }
      success(editingFolder ? "分类已更新" : "分类已创建");
      setShowFolderModal(false);
      fetchFolders();
    } catch {
      showError("保存失败");
    } finally {
      setSavingFolder(false);
    }
  };

  // 删除分类夹
  const handleDeleteFolder = async () => {
    if (!deleteFolderTarget) return;

    setDeletingFolder(true);
    try {
      await apiDelete(`/api/admin/application-folders/${deleteFolderTarget.id}`);
      success("分类已删除");
      setDeleteFolderTarget(null);
      fetchFolders();
      if (folderFilter === deleteFolderTarget.id) {
        setFolderFilter("all");
      }
    } catch {
      showError("删除失败");
    } finally {
      setDeletingFolder(false);
    }
  };

  // 更新申请的分类
  const updateApplicationFolder = async (application: Application, folderId: string | null) => {
    try {
      await apiPatch(`/api/admin/applications/${application.id}`, { folderId });
      success("分类已更新");
      fetchApplications();
      fetchFolders();
      if (detailApplication?.id === application.id) {
        const updatedFolder = folderId ? folders.find((f) => f.id === folderId) : null;
        setDetailApplication({
          ...application,
          folderId,
          folder: updatedFolder ? { id: updatedFolder.id, name: updatedFolder.name } : null,
        });
      }
    } catch {
      showError("更新失败");
    }
  };

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-brand-charcoal">简历管理</h1>
          <p className="mt-1 text-sm text-brand-charcoal/50">
            共 {total} 份简历
            {pendingCount > 0 && (
              <span className="ml-2 text-brand-primary">({pendingCount} 份待处理)</span>
            )}
          </p>
        </div>
        <Button leftIcon={<FolderPlus className="h-4 w-4" />} onClick={() => openFolderModal()}>
          新建分类
        </Button>
      </div>

      {/* 分类夹列表 */}
      {folders.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setFolderFilter("all");
              setPage(1);
            }}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              folderFilter === "all"
                ? "bg-brand-primary text-white"
                : "hover:bg-brand-charcoal/8 bg-white text-brand-charcoal/60"
            )}
          >
            <Folder className="h-4 w-4" />
            全部
          </button>
          <button
            onClick={() => {
              setFolderFilter("uncategorized");
              setPage(1);
            }}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              folderFilter === "uncategorized"
                ? "bg-brand-charcoal text-white"
                : "hover:bg-brand-charcoal/8 bg-white text-brand-charcoal/60"
            )}
          >
            <FileText className="h-4 w-4" />
            未分类
          </button>
          {folders.map((folder) => (
            <div key={folder.id} className="group relative">
              <button
                onClick={() => {
                  setFolderFilter(folder.id);
                  setPage(1);
                }}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  folderFilter === folder.id
                    ? "bg-brand-primary text-white"
                    : "hover:bg-brand-charcoal/8 bg-white text-brand-charcoal/60"
                )}
              >
                {folder.name}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-xs",
                    folderFilter === folder.id
                      ? "bg-white/20 text-white"
                      : "bg-brand-charcoal/8 text-brand-charcoal/50"
                  )}
                >
                  {folder.applicationCount}
                </span>
              </button>
              <div className="absolute right-0 top-0 hidden -translate-y-1 translate-x-1 gap-0.5 group-hover:flex">
                <Tooltip content="编辑" side="top">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openFolderModal(folder);
                    }}
                    className="rounded bg-white p-1 text-brand-charcoal/50 shadow hover:text-brand-charcoal/60"
                  >
                    <Edit2 className="h-3 w-3" />
                  </button>
                </Tooltip>
                <Tooltip content="删除" side="top">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteFolderTarget(folder);
                    }}
                    className="rounded bg-white p-1 text-brand-charcoal/50 shadow hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Tooltip>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-white p-4 shadow-sm">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-charcoal/40" />
          <Input
            placeholder="搜索姓名、手机号..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-brand-charcoal/50" />
          <Select
            options={[
              { value: "all", label: "全部状态" },
              { value: "pending", label: "待处理" },
              { value: "reviewed", label: "已查看" },
              { value: "interviewed", label: "已面试" },
              { value: "rejected", label: "已拒绝" },
              { value: "hired", label: "已录用" },
            ]}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="w-32"
          />
        </div>

        <div className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-brand-charcoal/50" />
          <Select
            options={[
              { value: "all", label: "全部职位" },
              ...jobs.map((job) => ({ value: job.id, label: job.title })),
            ]}
            value={jobFilter}
            onChange={(e) => {
              setJobFilter(e.target.value);
              setPage(1);
            }}
            className="w-40"
          />
        </div>
      </div>

      {/* 申请列表 */}
      <div className="rounded-xl bg-white shadow-sm">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
          </div>
        ) : applications.length === 0 ? (
          <Empty className="h-64" title="暂无简历申请" />
        ) : (
          <>
            {/* 表头 */}
            <div className="border-brand-charcoal/8 grid grid-cols-12 gap-4 border-b px-6 py-3 text-sm font-medium text-brand-charcoal/50">
              <span className="col-span-3">申请人</span>
              <span className="col-span-3">应聘职位</span>
              <span className="col-span-2">状态</span>
              <span className="col-span-2">申请时间</span>
              <span className="col-span-2 text-right">操作</span>
            </div>

            {/* 列表 */}
            <div className="divide-brand-charcoal/8 divide-y">
              {applications.map((application) => {
                const statusInfo = statusConfig[application.status] || statusConfig.pending;
                return (
                  <div
                    key={application.id}
                    className={cn(
                      "grid grid-cols-12 gap-4 px-6 py-4 transition-colors hover:bg-brand-charcoal/[0.03]",
                      application.status === "pending" && "bg-brand-primary/5"
                    )}
                  >
                    {/* 申请人信息 */}
                    <div className="col-span-3 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-primary/10 text-sm font-medium text-brand-primary">
                        {application.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-brand-charcoal">
                          {application.name}
                        </p>
                        <p className="truncate text-xs text-brand-charcoal/50">
                          {application.phone}
                        </p>
                      </div>
                    </div>

                    {/* 应聘职位 */}
                    <div className="col-span-3 flex items-center">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-brand-charcoal/80">
                          {application.job.title}
                        </p>
                        <p className="truncate text-xs text-brand-charcoal/50">
                          {application.job.titleEn}
                        </p>
                      </div>
                    </div>

                    {/* 状态 */}
                    <div className="col-span-2 flex flex-col justify-center gap-1">
                      <Badge variant={statusInfo.color}>{statusInfo.label}</Badge>
                      {application.folder && (
                        <span className="bg-brand-charcoal/8 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-brand-charcoal/60">
                          <Tag className="h-3 w-3" />
                          {application.folder.name}
                        </span>
                      )}
                    </div>

                    {/* 时间 */}
                    <div className="col-span-2 flex items-center text-sm text-brand-charcoal/50">
                      <Clock className="mr-1.5 h-3.5 w-3.5" />
                      {formatDate(application.createdAt)}
                    </div>

                    {/* 操作 */}
                    <div className="col-span-2 flex items-center justify-end gap-1">
                      <Tooltip content="查看详情" side="top">
                        <button
                          onClick={() => viewDetail(application)}
                          className="hover:bg-brand-charcoal/8 rounded p-2 text-brand-charcoal/50 hover:text-brand-charcoal/60"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </Tooltip>
                      <Tooltip content="下载简历" side="top">
                        <button
                          onClick={() => downloadResume(application)}
                          className="rounded p-2 text-brand-charcoal/50 hover:bg-brand-primary/[0.06] hover:text-brand-primary"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </Tooltip>
                      <Tooltip content="删除" side="top">
                        <button
                          onClick={() => setDeleteTarget(application)}
                          className="rounded p-2 text-brand-charcoal/50 hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* 分页 */}
      {total > 20 && (
        <div className="flex justify-center">
          <Pagination page={page} pageSize={20} total={total} onChange={setPage} />
        </div>
      )}

      {/* 详情弹窗 */}
      <Modal
        open={!!detailApplication}
        onClose={() => setDetailApplication(null)}
        title="简历详情"
        size="lg"
      >
        {detailApplication && (
          <div className="space-y-6">
            {/* 申请人信息 */}
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-primary/10 text-xl font-medium text-brand-primary">
                {detailApplication.name.charAt(0)}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-medium text-brand-charcoal">
                    {detailApplication.name}
                  </span>
                  <Badge variant={statusConfig[detailApplication.status]?.color || "default"}>
                    {statusConfig[detailApplication.status]?.label || "未知"}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-sm text-brand-charcoal/50">
                  <span className="flex items-center gap-1">
                    <User className="h-4 w-4" />
                    {detailApplication.phone}
                  </span>
                </div>
              </div>
            </div>

            {/* 应聘职位 */}
            <div className="rounded-lg bg-brand-charcoal/[0.03] p-4">
              <div className="mb-2 flex items-center gap-2 text-sm text-brand-charcoal/50">
                <Briefcase className="h-4 w-4" />
                应聘职位
              </div>
              <p className="font-medium text-brand-charcoal">{detailApplication.job.title}</p>
              <p className="text-sm text-brand-charcoal/50">{detailApplication.job.titleEn}</p>
            </div>

            {/* 申请时间 */}
            <div className="flex items-center gap-2 text-sm text-brand-charcoal/50">
              <Clock className="h-4 w-4" />
              申请时间：{formatDate(detailApplication.createdAt)}
            </div>

            {/* 简历下载 */}
            <div>
              <Button
                variant="outline"
                leftIcon={<Download className="h-4 w-4" />}
                onClick={() => downloadResume(detailApplication)}
              >
                下载简历
              </Button>
            </div>

            {/* 状态更新 */}
            <div>
              <label className="mb-2 block text-sm font-medium text-brand-charcoal/80">
                更新状态
              </label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(statusConfig).map(([key, config]) => (
                  <button
                    key={key}
                    onClick={() => updateStatus(detailApplication, key)}
                    className={cn(
                      "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                      detailApplication.status === key
                        ? "bg-brand-primary text-white"
                        : "bg-brand-charcoal/8 text-brand-charcoal/60 hover:bg-brand-charcoal/[0.06]"
                    )}
                  >
                    {config.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 分类夹 */}
            <div>
              <label className="mb-2 block text-sm font-medium text-brand-charcoal/80">分类</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => updateApplicationFolder(detailApplication, null)}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                    !detailApplication.folderId
                      ? "bg-brand-charcoal text-white"
                      : "bg-brand-charcoal/8 text-brand-charcoal/60 hover:bg-brand-charcoal/[0.06]"
                  )}
                >
                  未分类
                </button>
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => updateApplicationFolder(detailApplication, folder.id)}
                    className={cn(
                      "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                      detailApplication.folderId === folder.id
                        ? "bg-brand-primary text-white"
                        : "bg-brand-charcoal/8 text-brand-charcoal/60 hover:bg-brand-charcoal/[0.06]"
                    )}
                  >
                    {folder.name}
                  </button>
                ))}
              </div>
            </div>

            {/* 备注 */}
            <div>
              <Textarea
                label="备注"
                value={editingNotes}
                onChange={(e) => setEditingNotes(e.target.value)}
                placeholder="添加备注信息..."
                rows={3}
              />
              <div className="mt-2 flex justify-end">
                <Button size="sm" onClick={saveNotes}>
                  保存备注
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* 删除确认 */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="确认删除"
        description={`确定要删除「${deleteTarget?.name}」的简历申请吗？此操作无法撤销。`}
        confirmText="删除"
        loading={deleting}
        type="danger"
      />

      {/* 分类夹编辑弹窗 */}
      <Modal
        open={showFolderModal}
        onClose={() => setShowFolderModal(false)}
        title={editingFolder ? "编辑分类" : "新建分类"}
      >
        <div className="space-y-4">
          <Input
            label="分类名称"
            value={folderForm.name}
            onChange={(e) => setFolderForm({ ...folderForm, name: e.target.value })}
            placeholder="如：优秀候选人、待面试等"
            required
          />
          <Textarea
            label="描述（可选）"
            value={folderForm.description}
            onChange={(e) => setFolderForm({ ...folderForm, description: e.target.value })}
            placeholder="添加分类说明..."
            rows={2}
          />
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setShowFolderModal(false)}>
              取消
            </Button>
            <Button onClick={saveFolder} loading={savingFolder}>
              {editingFolder ? "保存" : "创建"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 删除分类夹确认 */}
      <ConfirmDialog
        open={!!deleteFolderTarget}
        onClose={() => setDeleteFolderTarget(null)}
        onConfirm={handleDeleteFolder}
        title="确认删除分类"
        description={`确定要删除分类「${deleteFolderTarget?.name}」吗？分类下的申请不会被删除，会变为未分类状态。`}
        confirmText="删除"
        loading={deletingFolder}
        type="danger"
      />
    </div>
  );
}
