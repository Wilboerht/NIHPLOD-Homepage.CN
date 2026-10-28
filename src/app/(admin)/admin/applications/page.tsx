"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Download,
  Eye,
  Trash2,
  Clock,
  FileText,
  User,
  Briefcase,
  FolderPlus,
  Folder,
  Edit2,
  X,
  Tag,
  RefreshCw,
  Loader2,
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
import { cn } from "@/lib/utils";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/lib/api-client";
import { downloadFromUrl } from "@/lib/client-download";
import { formatDateTime as formatDate } from "@/lib/format";
import { apiConsole } from "@/lib/logger";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { useListQuery } from "@/hooks/useListQuery";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import {
  DataTable,
  IconButton,
  PageHeader,
  RequirePermission,
  type Column,
} from "@/components/admin";

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
  hasResume: boolean;
  resumeFileName?: string | null;
  resumeSize?: number | null;
  jobTitleSnapshot?: string | null;
  status: string;
  notes?: string | null;
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

const JOB_TYPE_LABELS: Record<string, string> = {
  fulltime: "全职",
  parttime: "兼职",
  intern: "实习",
};

const getStatusInfo = (status: string) => statusConfig[status] || statusConfig.pending;

function formatFileSize(bytes?: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AdminApplicationsContent() {
  const router = useRouter();
  const { get, getNumber, update } = useListQuery();
  const { success, error: showError } = useToast();
  const { can: canAdmin } = useAdminPermissions();
  const { requireTotp, totpModal } = useTotpConfirm();
  const canWrite = canAdmin("applications:write");
  const canDelete = canAdmin("applications:delete");
  const takeLatest = useLatestRequest();
  const takeLatestDetail = useLatestRequest();

  // 列表状态全部由 URL 派生，刷新/分享/前进后退可恢复
  const page = getNumber("page", 1);
  const searchParam = get("search");
  const statusFilter = get("status", "all");
  const jobFilter = get("jobId", "all");
  const folderFilter = get("folderId", "all");

  // 状态
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [total, setTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [search, setSearch] = useState(searchParam);
  // URL 变化（如浏览器前进/后退）时同步输入框
  const [prevSearchParam, setPrevSearchParam] = useState(searchParam);
  if (prevSearchParam !== searchParam) {
    setPrevSearchParam(searchParam);
    setSearch(searchParam);
  }
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
  const [detailLoading, setDetailLoading] = useState(false);
  const [editingNotes, setEditingNotes] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const detailIdRef = useRef<string | null>(null);

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

  // 获取职位列表（用于筛选；超过 100 个时继续翻页）
  const fetchJobs = useCallback(async () => {
    try {
      const firstPage = await apiGet<{
        items: Job[];
        pagination?: { total?: number; totalPages?: number };
      }>("/api/admin/jobs", { page: 1, pageSize: 100 });
      let items = firstPage.items;
      const totalPages = Math.min(
        firstPage.pagination?.totalPages ??
          Math.ceil((firstPage.pagination?.total ?? items.length) / 100),
        10
      );
      for (let nextPage = 2; nextPage <= totalPages; nextPage += 1) {
        const data = await apiGet<{ items: Job[] }>("/api/admin/jobs", {
          page: nextPage,
          pageSize: 100,
        });
        items = items.concat(data.items);
      }
      setJobs(items);
    } catch (error) {
      apiConsole.error("获取职位列表失败:", error);
    }
  }, []);

  useEffect(() => {
    deferInEffect(() => {
      fetchJobs();
      fetchFolders();
    });
  }, [fetchJobs, fetchFolders]);

  // 获取申请列表
  const fetchApplications = useCallback(async () => {
    const isLatest = takeLatest();
    setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: "20",
      });
      if (searchParam) params.set("search", searchParam);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (jobFilter !== "all") params.set("jobId", jobFilter);
      if (folderFilter !== "all") params.set("folderId", folderFilter);

      const data = await apiGet<{
        items: Application[];
        pagination: { total: number };
        pendingCount: number;
      }>("/api/admin/applications", Object.fromEntries(params.entries()));
      if (!isLatest()) return;

      setApplications(data.items);
      setTotal(data.pagination.total);
      setPendingCount(data.pendingCount);
    } catch (error) {
      if (!isLatest()) return;
      apiConsole.error("获取申请列表失败:", error);
      if (error instanceof ApiError && error.status === 401) {
        showError("登录已过期，请重新登录");
        router.push("/admin-login?reauth=1");
        return;
      }
      showError(error instanceof ApiError ? error.message : "网络异常，请刷新重试");
      setApplications([]);
      setTotal(0);
      setPendingCount(0);
      setLoadError(true);
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [page, searchParam, statusFilter, jobFilter, folderFilter, showError, router, takeLatest]);

  useEffect(() => {
    deferInEffect(fetchApplications);
  }, [fetchApplications]);

  useEffect(() => {
    const totalPages = Math.ceil(total / 20);
    if (totalPages > 0 && page > totalPages) {
      update({ page: String(totalPages) }, { replace: true, resetPage: false });
    }
  }, [page, total, update]);

  // 搜索防抖写入 URL（replace，避免每次击键产生历史记录）
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = search.trim();
      if (next !== searchParam) {
        update({ search: next || null }, { replace: true });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, searchParam, update]);

  // 更新状态（详情弹窗用函数式更新，避免闭包里的旧状态覆盖）
  const updateStatus = async (application: Application, newStatus: string, toastMsg?: string) => {
    try {
      const updated = await apiPatch<Application>(`/api/admin/applications/${application.id}`, {
        status: newStatus,
        // 手动传入当前状态：若已被改过状态，后端拒绝，避免静默覆盖
        expectedStatus: application.status,
        expectedUpdatedAt: application.updatedAt,
      });
      success(toastMsg || "状态已更新");
      window.dispatchEvent(new Event("admin:nav-counts-refresh"));
      setDetailApplication((prev) =>
        prev && prev.id === application.id
          ? { ...prev, status: newStatus, updatedAt: updated.updatedAt ?? prev.updatedAt }
          : prev
      );
      fetchApplications();
    } catch (err) {
      if (err instanceof ApiError && err.code === "STATUS_CONFLICT") {
        showError("该申请状态已被其他管理员更新，已刷新列表");
        fetchApplications();
        return;
      }
      showError(err instanceof Error ? err.message : "更新失败");
    }
  };

  // 保存备注
  const [savingNotes, setSavingNotes] = useState(false);
  const folderBaseline = editingFolder
    ? { name: editingFolder.name, description: editingFolder.description || "" }
    : { name: "", description: "" };
  const isFolderDirty =
    showFolderModal &&
    (folderForm.name !== folderBaseline.name ||
      folderForm.description !== folderBaseline.description);
  const isNotesDirty = !!detailApplication && editingNotes !== (detailApplication.notes ?? "");
  const { confirmClose: confirmCloseFolder } = useUnsavedChanges(isFolderDirty);
  const { confirmClose: confirmCloseNotes } = useUnsavedChanges(isNotesDirty);
  const saveNotes = async () => {
    if (!detailApplication) return;
    if (editingNotes.length > 5000) {
      showError("备注不能超过 5000 字");
      return;
    }

    setSavingNotes(true);
    try {
      const updated = await apiPatch<Application>(
        `/api/admin/applications/${detailApplication.id}`,
        {
          notes: editingNotes,
          // 乐观锁：防止覆盖其他管理员刚保存的备注/状态
          expectedUpdatedAt: detailApplication.updatedAt,
        }
      );
      success("备注已保存");
      setDetailApplication((prev) =>
        prev
          ? {
              ...prev,
              notes: updated.notes ?? editingNotes,
              updatedAt: updated.updatedAt ?? prev.updatedAt,
            }
          : prev
      );
      fetchApplications();
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.code === "STALE_APPLICATION" || err.code === "STATUS_CONFLICT")
      ) {
        showError("该申请已被其他管理员修改，请刷新后重试");
        fetchApplications();
        return;
      }
      showError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSavingNotes(false);
    }
  };

  // 删除申请
  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      const runDelete = () => apiDelete(`/api/admin/applications/${deleteTarget.id}`);
      try {
        await runDelete();
      } catch (err) {
        if (!isTotpRequired(err)) throw err;
        const verified = await requireTotp(err instanceof ApiError ? err.code : undefined);
        if (!verified) return;
        await runDelete();
      }
      success("申请已删除");
      window.dispatchEvent(new Event("admin:nav-counts-refresh"));
      setDeleteTarget(null);
      // 分类夹计数会因删除而变化
      fetchFolders();
      // 删除本页最后一条时回退一页
      if (applications.length === 1 && page > 1) {
        update({ page: String(page - 1) }, { resetPage: false });
      } else {
        fetchApplications();
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  const reloadDetail = async (id: string) => {
    const isLatest = takeLatestDetail();
    try {
      const detail = await apiGet<Application>(`/api/admin/applications/${id}`);
      if (!isLatest() || detailIdRef.current !== id) return;
      setDetailApplication(detail);
      setEditingNotes(detail.notes ?? "");
    } catch {
      // 静默失败：下一次打开详情会重新拉取
    }
  };

  const autoMarkReviewed = async (application: Application) => {
    try {
      const updated = await apiPatch<Application>(`/api/admin/applications/${application.id}`, {
        status: "reviewed",
        expectedStatus: application.status,
        expectedUpdatedAt: application.updatedAt,
      });
      window.dispatchEvent(new Event("admin:nav-counts-refresh"));
      setDetailApplication((prev) =>
        prev && prev.id === application.id
          ? { ...prev, status: "reviewed", updatedAt: updated.updatedAt ?? prev.updatedAt }
          : prev
      );
      fetchApplications();
    } catch (err) {
      if (err instanceof ApiError && err.code === "STATUS_CONFLICT") {
        // 其他管理员已改状态：不要覆盖，拉取最新详情
        showError("该申请状态已被其他管理员更新");
        fetchApplications();
        await reloadDetail(application.id);
      }
      // 自动标记失败不打断查看流程
    }
  };

  const closeDetail = () => {
    // 使仍在飞行中的详情请求失效，避免关闭后又被写回
    takeLatestDetail();
    detailIdRef.current = null;
    setDetailApplication(null);
    setDetailLoading(false);
  };

  // 查看详情：列表只返回脱敏字段，详情单独请求（同时触发 application_detail_view 审计）
  const viewDetail = async (application: Application) => {
    detailIdRef.current = application.id;
    setDetailApplication(application);
    setDetailLoading(true);
    setEditingNotes("");
    const isLatest = takeLatestDetail();
    try {
      const detail = await apiGet<Application>(`/api/admin/applications/${application.id}`);
      if (!isLatest()) return;
      setDetailApplication(detail);
      setEditingNotes(detail.notes ?? "");
      // 自动标记为已查看（需要 applications:write，异步更新详情状态）
      if (detail.status === "pending" && canWrite) {
        void autoMarkReviewed(detail);
      }
    } catch (err) {
      if (!isLatest()) return;
      closeDetail();
      showError(err instanceof ApiError ? err.message : "获取详情失败");
    } finally {
      if (isLatest()) setDetailLoading(false);
    }
  };

  // 下载简历：优先 fetch+blob（能提示 409/401），OSS 跨域失败时回退新标签页
  const downloadResume = async (application: Application) => {
    const url = `/api/admin/applications/${application.id}/resume`;
    setDownloadingId(application.id);
    try {
      await downloadFromUrl(url, application.resumeFileName ?? "resume.pdf");
    } catch (err) {
      if (err instanceof ApiError) {
        showError(err.message);
      } else {
        // OSS 签名地址跨域时 fetch 可能被 CORS 拦截；回退浏览器直接下载
        // 用 <a> 而不是 window.open，避免异步回调里被弹窗拦截
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.target = "_blank";
        anchor.rel = "noopener";
        anchor.click();
      }
    } finally {
      setDownloadingId(null);
    }
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
        update({ folderId: null }, { replace: true });
      } else {
        // 该分类下的申请已变为未分类，刷新当前列表避免展示旧分类
        fetchApplications();
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
      const updated = await apiPatch<Application>(`/api/admin/applications/${application.id}`, {
        folderId,
        expectedUpdatedAt: application.updatedAt,
      });
      success("分类已更新");
      fetchApplications();
      fetchFolders();
      if (detailApplication?.id === application.id) {
        const updatedFolder = folderId ? folders.find((f) => f.id === folderId) : null;
        setDetailApplication((prev) =>
          prev && prev.id === application.id
            ? {
                ...prev,
                folderId,
                folder: updatedFolder ? { id: updatedFolder.id, name: updatedFolder.name } : null,
                updatedAt: updated.updatedAt ?? prev.updatedAt,
              }
            : prev
        );
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : "更新失败");
    }
  };

  const refreshAll = async () => {
    await Promise.all([fetchApplications(), fetchFolders(), fetchJobs()]);
  };

  // 表格列定义
  const columns: Column<Application>[] = [
    {
      key: "name",
      title: "申请人",
      width: "260px",
      render: (_, application) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-xs font-medium text-brand-primary">
            {application.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-brand-charcoal">{application.name}</p>
            <p className="truncate text-xs text-brand-charcoal/65">{application.phone}</p>
          </div>
        </div>
      ),
    },
    {
      key: "job.title",
      title: "应聘职位",
      width: "240px",
      render: (_, application) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-brand-charcoal/80" title={application.job.title}>
            {application.job.title}
          </p>
          <p className="truncate text-xs text-brand-charcoal/65" title={application.job.titleEn}>
            {application.job.titleEn}
          </p>
        </div>
      ),
    },
    {
      key: "folder.name",
      title: "分类",
      width: "120px",
      render: (_, application) =>
        application.folder ? (
          <Badge variant="secondary" className="max-w-full">
            <span className="min-w-0 truncate">{application.folder.name}</span>
          </Badge>
        ) : (
          <span className="text-sm text-brand-charcoal/65">—</span>
        ),
    },
    {
      key: "status",
      title: "状态",
      width: "100px",
      align: "center",
      render: (_, application) => {
        const statusInfo = getStatusInfo(application.status);
        return <Badge variant={statusInfo.color}>{statusInfo.label}</Badge>;
      },
    },
    {
      key: "createdAt",
      title: "申请时间",
      width: "150px",
      render: (_, application) => (
        <span className="text-sm text-brand-charcoal/65">{formatDate(application.createdAt)}</span>
      ),
    },
    {
      key: "updatedAt",
      title: "最近处理",
      width: "150px",
      render: (_, application) => (
        <span className="text-sm text-brand-charcoal/65">{formatDate(application.updatedAt)}</span>
      ),
    },
    {
      key: "actions",
      title: "操作",
      width: "140px",
      align: "right",
      render: (_, application) => (
        <div className="flex items-center justify-end gap-1">
          <Tooltip content="查看详情" side="top">
            <IconButton
              label={`查看 ${application.name} 的简历`}
              onClick={() => void viewDetail(application)}
            >
              <Eye className="h-4 w-4" />
            </IconButton>
          </Tooltip>
          <Tooltip content={application.hasResume ? "下载简历" : "简历文件不存在"} side="top">
            <IconButton
              label={`下载 ${application.name} 的简历`}
              disabled={!application.hasResume || downloadingId === application.id}
              onClick={() => void downloadResume(application)}
            >
              <Download className="h-4 w-4" />
            </IconButton>
          </Tooltip>
          {canDelete && (
            <Tooltip content="删除" side="top">
              <IconButton
                label={`删除 ${application.name} 的申请`}
                variant="danger"
                onClick={() => setDeleteTarget(application)}
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </Tooltip>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* 头部 */}
      <PageHeader
        title="简历管理"
        description={
          <>
            共 {total} 份简历
            {pendingCount > 0 && (
              <span className="ml-2 text-brand-primary">({pendingCount} 份待处理)</span>
            )}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw className="h-4 w-4" />}
              onClick={() => void refreshAll()}
              loading={loading}
            >
              刷新
            </Button>
            {canWrite && (
              <Button
                variant="outline"
                size="sm"
                leftIcon={<FolderPlus className="h-4 w-4" />}
                onClick={() => openFolderModal()}
              >
                新建分类
              </Button>
            )}
          </div>
        }
      />

      {/* 筛选栏 */}
      <div className="rounded-2xl border border-brand-charcoal/10 bg-white">
        {folders.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-brand-charcoal/10 p-4">
            <span className="mr-1 text-sm text-brand-charcoal/65">分类</span>
            <button
              onClick={() => update({ folderId: null })}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
                folderFilter === "all"
                  ? "border-brand-primary bg-brand-primary text-white"
                  : "border-brand-charcoal/10 bg-white text-brand-charcoal/70 hover:border-brand-charcoal/25 hover:text-brand-charcoal"
              )}
            >
              <Folder className="h-3.5 w-3.5" />
              全部
            </button>
            <button
              onClick={() => update({ folderId: "uncategorized" })}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
                folderFilter === "uncategorized"
                  ? "border-brand-primary bg-brand-primary text-white"
                  : "border-brand-charcoal/10 bg-white text-brand-charcoal/70 hover:border-brand-charcoal/25 hover:text-brand-charcoal"
              )}
            >
              <FileText className="h-3.5 w-3.5" />
              未分类
            </button>
            {folders.map((folder) => (
              <div key={folder.id} className="group relative">
                <button
                  onClick={() => update({ folderId: folder.id })}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
                    folderFilter === folder.id
                      ? "border-brand-primary bg-brand-primary text-white"
                      : "border-brand-charcoal/10 bg-white text-brand-charcoal/70 hover:border-brand-charcoal/25 hover:text-brand-charcoal"
                  )}
                >
                  {folder.name}
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-xs tabular-nums",
                      folderFilter === folder.id
                        ? "bg-white/20 text-white"
                        : "bg-brand-charcoal/[0.06] text-brand-charcoal/65"
                    )}
                  >
                    {folder.applicationCount}
                  </span>
                </button>
                <div className="absolute -right-1.5 -top-2 hidden items-center gap-0.5 group-focus-within:flex group-hover:flex max-md:flex">
                  {canWrite && (
                    <Tooltip content="编辑" side="top">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openFolderModal(folder);
                        }}
                        aria-label={`编辑分类 ${folder.name}`}
                        className="rounded-full border border-brand-charcoal/10 bg-white p-1 text-brand-charcoal/65 shadow-sm transition-colors hover:text-brand-charcoal"
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                    </Tooltip>
                  )}
                  {canWrite && (
                    <Tooltip content="删除" side="top">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteFolderTarget(folder);
                        }}
                        aria-label={`删除分类 ${folder.name}`}
                        className="rounded-full border border-brand-charcoal/10 bg-white p-1 text-brand-charcoal/65 shadow-sm transition-colors hover:text-red-500"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Tooltip>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative w-full md:max-w-sm md:flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-charcoal/65" />
              <Input
                aria-label="搜索姓名、手机号"
                placeholder="搜索姓名、手机号..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={search ? "pl-10 pr-10" : "pl-10"}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="清除搜索"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-brand-charcoal/65 transition-colors hover:bg-brand-charcoal/[0.06] hover:text-brand-charcoal"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row md:ml-auto">
              <div className="w-full sm:w-36">
                <Select
                  aria-label="按状态筛选"
                  options={[
                    { value: "all", label: "全部状态" },
                    { value: "pending", label: "待处理" },
                    { value: "reviewed", label: "已查看" },
                    { value: "interviewed", label: "已面试" },
                    { value: "rejected", label: "已拒绝" },
                    { value: "hired", label: "已录用" },
                  ]}
                  value={statusFilter}
                  onChange={(e) => update({ status: e.target.value })}
                />
              </div>
              <div className="w-full sm:w-44">
                <Select
                  aria-label="按职位筛选"
                  options={[
                    { value: "all", label: "全部职位" },
                    ...jobs.map((job) => ({ value: job.id, label: job.title })),
                  ]}
                  value={jobFilter}
                  onChange={(e) => update({ jobId: e.target.value })}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 申请列表 */}
      {loadError ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <p className="text-sm text-red-500">加载失败，请重试</p>
          <Button variant="outline" size="sm" onClick={fetchApplications}>
            重试
          </Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={applications}
          loading={loading}
          rowKey="id"
          tableLayout="fixed"
          minWidth="1160px"
          emptyText="暂无简历申请"
          rowProps={(application) => ({
            className: cn(
              "hover:bg-brand-charcoal/[0.03]",
              application.status === "pending" &&
                "!bg-brand-primary/[0.04] hover:!bg-brand-primary/[0.06]"
            ),
          })}
          mobileCard={(application) => {
            const statusInfo = getStatusInfo(application.status);
            return (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-sm font-medium text-brand-primary">
                    {application.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium text-brand-charcoal">{application.name}</p>
                      <Badge variant={statusInfo.color}>{statusInfo.label}</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-brand-charcoal/65">
                      {application.phone}
                    </p>
                    <p className="mt-1 truncate text-sm text-brand-charcoal/80">
                      {application.job.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-brand-charcoal/65">
                      {application.folder && (
                        <span className="bg-brand-charcoal/8 inline-flex items-center gap-1 rounded px-1.5 py-0.5">
                          <Tag className="h-3 w-3" />
                          {application.folder.name}
                        </span>
                      )}
                      <span>最近处理 {formatDate(application.updatedAt)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-brand-charcoal/10 pt-2">
                  <span className="inline-flex items-center gap-1 text-xs text-brand-charcoal/65">
                    <Clock className="h-3 w-3" />
                    申请 {formatDate(application.createdAt)}
                  </span>
                  <div className="flex items-center justify-end gap-1">
                    <Tooltip content="查看详情" side="top">
                      <IconButton
                        label={`查看 ${application.name} 的简历`}
                        onClick={() => void viewDetail(application)}
                      >
                        <Eye className="h-4 w-4" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip
                      content={application.hasResume ? "下载简历" : "简历文件不存在"}
                      side="top"
                    >
                      <IconButton
                        label={`下载 ${application.name} 的简历`}
                        disabled={!application.hasResume || downloadingId === application.id}
                        onClick={() => void downloadResume(application)}
                      >
                        <Download className="h-4 w-4" />
                      </IconButton>
                    </Tooltip>
                    {canDelete && (
                      <Tooltip content="删除" side="top">
                        <IconButton
                          label={`删除 ${application.name} 的申请`}
                          variant="danger"
                          onClick={() => setDeleteTarget(application)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </div>
            );
          }}
        />
      )}

      {/* 分页（始终展示总数） */}
      {total > 0 && (
        <div className="flex justify-center">
          <Pagination
            page={page}
            pageSize={20}
            total={total}
            onChange={(nextPage) => update({ page: String(nextPage) }, { resetPage: false })}
          />
        </div>
      )}

      {/* 详情弹窗 */}
      <Modal
        open={!!detailApplication}
        onClose={closeDetail}
        title="简历详情"
        size="lg"
        mobileFullScreen
        closeOnBackdrop={false}
        closeGuard={() => !savingNotes && confirmCloseNotes()}
      >
        {detailApplication && detailLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-brand-charcoal/65">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在加载详情...
          </div>
        ) : detailApplication ? (
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
                <div className="mt-2 flex flex-wrap gap-4 text-sm text-brand-charcoal/65">
                  <span className="flex items-center gap-1">
                    <User className="h-4 w-4" />
                    {detailApplication.phone}
                  </span>
                </div>
              </div>
            </div>

            {/* 应聘职位 */}
            <div className="rounded-lg bg-brand-charcoal/[0.03] p-4">
              <div className="mb-2 flex items-center gap-2 text-sm text-brand-charcoal/65">
                <Briefcase className="h-4 w-4" />
                应聘职位
              </div>
              <p className="font-medium text-brand-charcoal">{detailApplication.job.title}</p>
              <p className="text-sm text-brand-charcoal/65">{detailApplication.job.titleEn}</p>
              {(detailApplication.job.location || detailApplication.job.type) && (
                <p className="mt-1 text-sm text-brand-charcoal/65">
                  {[
                    detailApplication.job.location,
                    detailApplication.job.type &&
                      (JOB_TYPE_LABELS[detailApplication.job.type] ?? detailApplication.job.type),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              {detailApplication.jobTitleSnapshot &&
                detailApplication.jobTitleSnapshot !== detailApplication.job.title && (
                  <p className="mt-1 text-sm text-brand-charcoal/65">
                    投递时职位名称：{detailApplication.jobTitleSnapshot}
                  </p>
                )}
            </div>

            {/* 申请时间 */}
            <div className="flex items-center gap-2 text-sm text-brand-charcoal/65">
              <Clock className="h-4 w-4" />
              申请时间：{formatDate(detailApplication.createdAt)}
            </div>

            {/* 简历下载 */}
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  leftIcon={<Download className="h-4 w-4" />}
                  onClick={() => void downloadResume(detailApplication)}
                  loading={downloadingId === detailApplication.id}
                  disabled={!detailApplication.hasResume || downloadingId === detailApplication.id}
                >
                  下载简历
                </Button>
                {detailApplication.resumeFileName && (
                  <span
                    className="max-w-full truncate text-sm text-brand-charcoal/65"
                    title={detailApplication.resumeFileName}
                  >
                    {detailApplication.resumeFileName}
                  </span>
                )}
                {formatFileSize(detailApplication.resumeSize) && (
                  <span className="text-sm text-brand-charcoal/65">
                    {formatFileSize(detailApplication.resumeSize)}
                  </span>
                )}
              </div>
              {!detailApplication.hasResume && (
                <p className="mt-2 text-sm text-amber-600">简历文件不存在或已被清理。</p>
              )}
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
                    disabled={!canWrite || detailApplication.status === key}
                    className={cn(
                      "rounded-full px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed",
                      detailApplication.status === key
                        ? "bg-brand-primary text-white"
                        : "bg-brand-charcoal/8 text-brand-charcoal/70 hover:bg-brand-charcoal/[0.06] disabled:opacity-60"
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
                  disabled={!canWrite || !detailApplication.folderId}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed",
                    !detailApplication.folderId
                      ? "bg-brand-charcoal text-white"
                      : "bg-brand-charcoal/8 text-brand-charcoal/70 hover:bg-brand-charcoal/[0.06] disabled:opacity-60"
                  )}
                >
                  未分类
                </button>
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => updateApplicationFolder(detailApplication, folder.id)}
                    disabled={!canWrite || detailApplication.folderId === folder.id}
                    className={cn(
                      "rounded-full px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed",
                      detailApplication.folderId === folder.id
                        ? "bg-brand-primary text-white"
                        : "bg-brand-charcoal/8 text-brand-charcoal/70 hover:bg-brand-charcoal/[0.06] disabled:opacity-60"
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
                maxLength={5000}
                disabled={!canWrite}
              />
              <div className="mt-2 flex justify-end">
                <Button
                  size="sm"
                  onClick={saveNotes}
                  loading={savingNotes}
                  disabled={!canWrite || savingNotes}
                >
                  保存备注
                </Button>
              </div>
            </div>
          </div>
        ) : null}
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
        closeOnBackdrop={false}
        closeGuard={() => !savingFolder && confirmCloseFolder()}
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                if (confirmCloseFolder()) setShowFolderModal(false);
              }}
              disabled={savingFolder}
            >
              取消
            </Button>
            <Button onClick={saveFolder} loading={savingFolder}>
              {editingFolder ? "保存" : "创建"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="分类名称"
            data-autofocus
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

      {totpModal}
    </div>
  );
}

export default function AdminApplicationsPage() {
  return (
    <RequirePermission permission="applications:read">
      <AdminApplicationsContent />
    </RequirePermission>
  );
}
