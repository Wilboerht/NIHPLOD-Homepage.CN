"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Edit, Eye, EyeOff, MapPin, Plus, Search, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { Pagination } from "@/components/ui/Pagination";
import { Tooltip } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/Toast";
import {
  DataTable,
  IconButton,
  PageHeader,
  RequirePermission,
  type Column,
} from "@/components/admin";
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { useRowSelection } from "@/hooks/useRowSelection";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";

interface Job {
  id: string;
  title: string;
  titleEn: string;
  location: string;
  type: string;
  salary: string | null;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { applications: number };
}

const JOB_TYPE_LABELS: Record<string, string> = {
  fulltime: "全职",
  parttime: "兼职",
  intern: "实习",
};

const STATUS_TABS = [
  { value: "all", label: "全部" },
  { value: "published", label: "已发布" },
  { value: "draft", label: "草稿" },
] as const;

export default function AdminJobsPage() {
  return (
    <RequirePermission permission="jobs:read">
      <AdminJobsContent />
    </RequirePermission>
  );
}

function AdminJobsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success, error: showError } = useToast();
  const { requireTotp, totpModal } = useTotpConfirm();

  // 状态
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // page/pageSize/status/search 同步到 URL（与产品列表一致，刷新/分享后保留筛选；非法值回退默认）
  const pageParam = Number(searchParams.get("page"));
  const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1;
  const pageSizeParam = Number(searchParams.get("pageSize"));
  const pageSize =
    Number.isFinite(pageSizeParam) && pageSizeParam >= 1 ? Math.floor(pageSizeParam) : 10;
  const statusFilter = searchParams.get("status") || "all";
  const searchParam = searchParams.get("search") || "";
  const [searchInput, setSearchInput] = useState(searchParam);
  // URL 中的 search 变化（前进/后退）时在渲染期同步输入框（同 useRowSelection 的调整模式）
  const [prevSearchParam, setPrevSearchParam] = useState(searchParam);
  if (prevSearchParam !== searchParam) {
    setPrevSearchParam(searchParam);
    setSearchInput(searchParam);
  }

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === "" || value === "all") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });
      // 更改筛选条件时重置页码
      if (!("page" in updates)) {
        params.delete("page");
      }
      router.push(`/admin/jobs?${params.toString()}`);
    },
    [searchParams, router]
  );

  const listQuery = searchParams.toString();
  const returnTo = `/admin/jobs${listQuery ? `?${listQuery}` : ""}`;
  const editHref = (id: string) =>
    `/admin/jobs/${id}/edit?returnTo=${encodeURIComponent(returnTo)}`;

  // 搜索防抖：停止输入 300ms 后提交到 URL
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== searchParam) {
        updateParams({ search: searchInput });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, searchParam, updateParams]);

  // 勾选状态：翻页/搜索/筛选变化时自动清空
  const selection = useRowSelection<Job>(
    (job) => job.id,
    `${page}|${pageSize}|${searchParam}|${statusFilter}`
  );
  // 删除确认
  const [loadError, setLoadError] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Job | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [batchActionLoading, setBatchActionLoading] = useState<string | null>(null);
  // 行内发布/下架防抖：进行中禁用按钮，避免连点发出多个 PATCH
  const [publishLoadingId, setPublishLoadingId] = useState<string | null>(null);

  // 权限：发布需要 jobs:write，删除需要 jobs:delete，批量删除需要 jobs:batch-delete
  const { can: canAdmin } = useAdminPermissions();
  const canWriteJobs = canAdmin("jobs:write");
  const canDeleteJobs = canAdmin("jobs:delete");
  const canBatchDelete = canAdmin("jobs:batch-delete");
  // 无任何操作权限时不展示勾选列
  const canSelect = canWriteJobs || canDeleteJobs || canBatchDelete;

  // 获取职位列表
  const takeLatestJobs = useLatestRequest();
  const fetchJobs = useCallback(async () => {
    const isLatest = takeLatestJobs();
    setLoading(true);
    try {
      const data = await apiGet<{ items: Job[]; pagination: { total: number } }>(
        "/api/admin/jobs",
        {
          page,
          pageSize,
          search: searchParam,
          status: statusFilter === "all" ? undefined : statusFilter,
        }
      );
      if (!isLatest()) return;
      setJobs(data.items);
      setTotal(data.pagination.total);
      setLoadError(false);
    } catch (error) {
      if (!isLatest()) return;
      if (error instanceof ApiError && error.status === 401) {
        router.push("/admin-login");
        return;
      }
      setLoadError(true);
      showError(error instanceof Error ? error.message : "加载失败，请刷新重试");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [page, pageSize, searchParam, statusFilter, router, showError, takeLatestJobs]);

  useEffect(() => {
    deferInEffect(fetchJobs);
  }, [fetchJobs]);

  // 切换发布状态（publishLoadingId 防连点）
  const togglePublish = async (job: Job) => {
    if (publishLoadingId) return;
    setPublishLoadingId(job.id);
    try {
      await apiPatch(`/api/admin/jobs/${job.id}`, { published: !job.published });
      success(job.published ? "已取消发布" : "已发布");
      fetchJobs();
    } catch {
      showError("操作失败");
    } finally {
      setPublishLoadingId(null);
    }
  };

  // 删除职位
  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      const runDelete = () => apiDelete(`/api/admin/jobs/${deleteTarget.id}`);
      try {
        await runDelete();
      } catch (err) {
        if (!isTotpRequired(err)) throw err;
        const verified = await requireTotp(err instanceof ApiError ? err.code : undefined);
        if (!verified) return;
        await runDelete();
      }
      success("职位已删除");
      setDeleteTarget(null);
      // 删光当前页最后一条时回退一页
      if (jobs.length === 1 && page > 1) {
        updateParams({ page: String(page - 1) });
      } else {
        fetchJobs();
      }
    } catch (error) {
      showError(error instanceof ApiError ? error.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  // 批量操作（返回是否成功，供确认弹窗决定是否关闭）
  const handleBatchAction = async (
    action: "publish" | "unpublish" | "delete"
  ): Promise<boolean> => {
    if (selection.selectedCount === 0) return false;
    setBatchActionLoading(action);

    try {
      const submit = () =>
        apiPost<{ message: string }>("/api/admin/jobs/batch", {
          ids: Array.from(selection.selectedIds),
          action,
        });

      let data: { message: string };
      try {
        data = await submit();
      } catch (err) {
        if (action !== "delete" || !isTotpRequired(err)) throw err;
        const verified = await requireTotp(err instanceof ApiError ? err.code : undefined);
        if (!verified) return false;
        data = await submit();
      }

      success(data.message);
      // 批量删光当前页时回退一页
      const deletesWholePage =
        action === "delete" &&
        jobs.length > 0 &&
        jobs.every((job) => selection.selectedIds.has(job.id));
      selection.clear();
      if (deletesWholePage && page > 1) {
        updateParams({ page: String(page - 1) });
      } else {
        await fetchJobs();
      }
      return true;
    } catch (error) {
      showError(error instanceof Error ? error.message : "操作失败");
      return false;
    } finally {
      setBatchActionLoading(null);
    }
  };

  // 表格列定义（无任何写/删权限时不展示勾选列）
  const selectColumn: Column<Job> = {
    key: "select",
    title: (
      <input
        type="checkbox"
        checked={selection.isAllSelected(jobs)}
        ref={(el) => {
          if (el) el.indeterminate = selection.isIndeterminate(jobs);
        }}
        onChange={() => selection.toggleAll(jobs, !selection.isAllSelected(jobs))}
        aria-label="全选本页职位"
        className="h-4 w-4 rounded border-brand-charcoal/20 text-brand-primary focus:ring-brand-primary"
      />
    ),
    width: "48px",
    align: "center",
    render: (_, job) => (
      <input
        type="checkbox"
        checked={selection.isSelected(job)}
        onChange={() => selection.toggle(job)}
        aria-label={`选择 ${job.title}`}
        className="h-4 w-4 rounded border-brand-charcoal/20 text-brand-primary focus:ring-brand-primary"
      />
    ),
  };

  const columns: Column<Job>[] = [
    ...(canSelect ? [selectColumn] : []),
    {
      key: "title",
      title: "职位",
      width: "280px",
      render: (_, job) => (
        <div className="min-w-0">
          <Link
            href={editHref(job.id)}
            className="block truncate font-medium text-brand-charcoal transition-colors hover:text-brand-primary"
            title={job.title}
          >
            {job.title}
          </Link>
          <p className="truncate text-xs text-brand-charcoal/65" title={job.titleEn}>
            {job.titleEn}
          </p>
        </div>
      ),
    },
    {
      key: "type",
      title: "类型",
      width: "100px",
      render: (_, job) => (
        <span className="text-sm text-brand-charcoal/70">
          {JOB_TYPE_LABELS[job.type] || job.type || "-"}
        </span>
      ),
    },
    {
      key: "location",
      title: "工作地点",
      width: "140px",
      render: (_, job) => (
        <span
          className="flex min-w-0 items-center gap-1 text-sm text-brand-charcoal/70"
          title={job.location || undefined}
        >
          <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-brand-charcoal/65" />
          <span className="min-w-0 truncate">{job.location || "-"}</span>
        </span>
      ),
    },
    {
      key: "salary",
      title: "薪资",
      width: "140px",
      render: (_, job) => (
        <span
          className="block truncate text-sm text-brand-charcoal/70"
          title={job.salary || undefined}
        >
          {job.salary || "-"}
        </span>
      ),
    },
    {
      key: "published",
      title: "状态",
      width: "100px",
      align: "center",
      render: (_, job) => (
        <Badge variant={job.published ? "success" : "default"}>
          {job.published ? "已发布" : "草稿"}
        </Badge>
      ),
    },
    {
      key: "applications",
      title: "申请",
      width: "90px",
      align: "center",
      render: (_, job) => (
        <Link href={`/admin/applications?jobId=${job.id}`} title={`查看 ${job.title} 的申请`}>
          <Badge variant={job._count.applications > 0 ? "secondary" : "default"}>
            {job._count.applications}
          </Badge>
        </Link>
      ),
    },
    {
      key: "updatedAt",
      title: "更新时间",
      width: "144px",
      render: (_, job) => (
        <span className="text-sm text-brand-charcoal/65">{formatDate(job.updatedAt)}</span>
      ),
    },
    {
      key: "actions",
      title: "操作",
      width: "152px",
      align: "right",
      render: (_, job) => (
        <div className="flex items-center justify-end gap-1">
          {canWriteJobs && (
            <Tooltip content={job.published ? "取消发布" : "发布"} side="top">
              <IconButton
                label={job.published ? `取消发布 ${job.title}` : `发布 ${job.title}`}
                onClick={() => togglePublish(job)}
                disabled={publishLoadingId !== null}
              >
                {job.published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </IconButton>
            </Tooltip>
          )}
          {canWriteJobs && (
            <Tooltip content="编辑" side="top">
              <IconButton label={`编辑 ${job.title}`} href={editHref(job.id)}>
                <Edit className="h-4 w-4" />
              </IconButton>
            </Tooltip>
          )}
          {canDeleteJobs && (
            <Tooltip content="删除" side="top">
              <IconButton
                label={`删除 ${job.title}`}
                variant="danger"
                onClick={() => setDeleteTarget(job)}
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
    <RequirePermission permission="jobs:read">
      <div className="flex flex-col gap-6">
        {/* 头部 */}
        <PageHeader
          title="职位管理"
          description={`共 ${total} 个职位`}
          actions={
            canWriteJobs ? (
              <Link href={`/admin/jobs/new?returnTo=${encodeURIComponent(returnTo)}`}>
                <Button variant="outline" size="sm" leftIcon={<Plus className="h-4 w-4" />}>
                  新增职位
                </Button>
              </Link>
            ) : undefined
          }
        />

        {/* 筛选栏 */}
        <div className="rounded-2xl border border-brand-charcoal/10 bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div
              role="group"
              aria-label="按发布状态筛选"
              className="flex flex-wrap items-center gap-1 rounded-xl bg-brand-charcoal/[0.04] p-1"
            >
              {STATUS_TABS.map((tab) => {
                const active = statusFilter === tab.value;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => updateParams({ status: tab.value })}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40",
                      active
                        ? "bg-white font-medium text-brand-charcoal shadow-sm"
                        : "text-brand-charcoal/65 hover:bg-white/70 hover:text-brand-charcoal"
                    )}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="relative w-full md:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-charcoal/65" />
              <Input
                aria-label="搜索职位"
                placeholder="搜索职位..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className={searchInput ? "pl-10 pr-10" : "pl-10"}
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput("");
                    updateParams({ search: null });
                  }}
                  aria-label="清除搜索"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-brand-charcoal/65 transition-colors hover:bg-brand-charcoal/[0.06] hover:text-brand-charcoal"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 批量操作 */}
        {selection.selectedCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-brand-primary/15 bg-brand-primary/[0.03] px-4 py-3">
            <span className="mr-1 text-sm text-brand-charcoal/80">
              已选 {selection.selectedCount} 项
            </span>
            {canWriteJobs && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBatchAction("publish")}
                  loading={batchActionLoading === "publish"}
                  disabled={batchActionLoading !== null && batchActionLoading !== "publish"}
                >
                  批量发布
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBatchAction("unpublish")}
                  loading={batchActionLoading === "unpublish"}
                  disabled={batchActionLoading !== null && batchActionLoading !== "unpublish"}
                >
                  批量下架
                </Button>
              </>
            )}
            {canBatchDelete && (
              <Button
                size="sm"
                variant="danger"
                onClick={() => setShowBatchDeleteConfirm(true)}
                disabled={batchActionLoading !== null}
              >
                批量删除
              </Button>
            )}
            <Button size="sm" variant="ghost" className="ml-auto" onClick={selection.clear}>
              取消选择
            </Button>
          </div>
        )}

        {/* 职位列表 */}
        {loadError ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <p className="text-sm text-red-500">加载失败，请重试</p>
            <Button variant="outline" size="sm" onClick={fetchJobs}>
              重试
            </Button>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={jobs}
            loading={loading}
            rowKey="id"
            tableLayout="fixed"
            minWidth="1200px"
            emptyText="暂无职位数据"
            rowProps={() => ({ className: "hover:bg-brand-charcoal/[0.03]" })}
            mobileCard={(job) => (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  {canSelect && (
                    <label className="-ml-2 flex h-11 w-9 flex-shrink-0 items-center justify-center">
                      <input
                        type="checkbox"
                        checked={selection.isSelected(job)}
                        onChange={() => selection.toggle(job)}
                        aria-label={`选择 ${job.title}`}
                        className="h-4 w-4 rounded border-brand-charcoal/20 text-brand-primary focus:ring-brand-primary"
                      />
                    </label>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={editHref(job.id)}
                        className="truncate font-medium text-brand-charcoal transition-colors hover:text-brand-primary"
                      >
                        {job.title}
                      </Link>
                      <Badge variant={job.published ? "success" : "default"}>
                        {job.published ? "已发布" : "草稿"}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-brand-charcoal/65">{job.titleEn}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-brand-charcoal/65">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {job.location || "-"}
                      </span>
                      <span>{JOB_TYPE_LABELS[job.type] || job.type || "-"}</span>
                      {job.salary && <span>{job.salary}</span>}
                      <Link
                        href={`/admin/applications?jobId=${job.id}`}
                        className="hover:text-brand-primary hover:underline"
                      >
                        {job._count.applications} 份申请
                      </Link>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-brand-charcoal/10 pt-2">
                  <span className="text-xs text-brand-charcoal/65">
                    更新于 {formatDate(job.updatedAt)}
                  </span>
                  <div className="flex items-center justify-end gap-1">
                    {canWriteJobs && (
                      <Tooltip content={job.published ? "取消发布" : "发布"} side="top">
                        <IconButton
                          label={job.published ? `取消发布 ${job.title}` : `发布 ${job.title}`}
                          onClick={() => togglePublish(job)}
                          disabled={publishLoadingId !== null}
                        >
                          {job.published ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </IconButton>
                      </Tooltip>
                    )}
                    {canWriteJobs && (
                      <Tooltip content="编辑" side="top">
                        <IconButton label={`编辑 ${job.title}`} href={editHref(job.id)}>
                          <Edit className="h-4 w-4" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {canDeleteJobs && (
                      <Tooltip content="删除" side="top">
                        <IconButton
                          label={`删除 ${job.title}`}
                          variant="danger"
                          onClick={() => setDeleteTarget(job)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </div>
            )}
          />
        )}

        {/* 分页 */}
        {total > 0 && (
          <div className="flex justify-center">
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              onChange={(p) => updateParams({ page: String(p) })}
              onPageSizeChange={(size) => updateParams({ pageSize: String(size), page: "1" })}
            />
          </div>
        )}

        {/* 删除确认（有申请时提示删除会被 API 拒绝，与后端行为一致） */}
        <ConfirmDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          title="确认删除"
          description={
            deleteTarget && deleteTarget._count.applications > 0
              ? `该职位已有 ${deleteTarget._count.applications} 份申请，删除将被拒绝。建议改为下架以保留候选人数据。`
              : `确定要删除职位「${deleteTarget?.title}」吗？此操作无法撤销。`
          }
          confirmText="删除"
          loading={deleting}
          type="danger"
          confirmDisabled={!!deleteTarget && deleteTarget._count.applications > 0}
        />

        {/* 批量删除确认（失败时保持弹窗打开） */}
        <ConfirmDialog
          open={showBatchDeleteConfirm}
          onClose={() => setShowBatchDeleteConfirm(false)}
          onConfirm={async () => {
            const ok = await handleBatchAction("delete");
            if (ok) setShowBatchDeleteConfirm(false);
          }}
          title="批量删除"
          description={`确定要删除选中的 ${selection.selectedCount} 项？此操作不可恢复。`}
          confirmText="确定删除"
          loading={batchActionLoading === "delete"}
          type="danger"
        />
        {totpModal}
      </div>
    </RequirePermission>
  );
}
