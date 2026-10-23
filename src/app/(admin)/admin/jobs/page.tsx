"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, Search, Edit, Trash2, Eye, EyeOff, MapPin } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import { Empty } from "@/components/ui/Empty";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { PageHeader } from "@/components/admin/PageHeader";
import { IconButton } from "@/components/admin/IconButton";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useRowSelection } from "@/hooks/useRowSelection";
import { useLatestRequest } from "@/hooks/useLatestRequest";

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

export default function AdminJobsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success, error: showError } = useToast();

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
      await apiDelete(`/api/admin/jobs/${deleteTarget.id}`);
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
      const data = await apiPost<{ message: string }>("/api/admin/jobs/batch", {
        ids: Array.from(selection.selectedIds),
        action,
      });

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

  return (
    <RequirePermission permission="jobs:read">
      <div className="space-y-6">
        {/* 头部 */}
        <PageHeader
          title="招聘管理"
          description={`共 ${total} 个职位`}
          actions={
            canWriteJobs ? (
              <Link href={`/admin/jobs/new?returnTo=${encodeURIComponent(returnTo)}`}>
                <Button leftIcon={<Plus className="h-4 w-4" />}>新增职位</Button>
              </Link>
            ) : undefined
          }
        />

        {/* 工具栏 */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-charcoal/10 bg-white p-4">
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:gap-4">
            <div className="relative w-full sm:w-60">
              <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-charcoal/65" />
              <Input
                placeholder="搜索职位..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              options={[
                { value: "all", label: "全部状态" },
                { value: "published", label: "已发布" },
                { value: "draft", label: "草稿" },
              ]}
              value={statusFilter}
              onChange={(e) => updateParams({ status: e.target.value })}
              className="w-full sm:w-32"
            />
          </div>

          {selection.selectedCount > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-brand-charcoal/65">
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
                  variant="outline"
                  className="text-red-600 hover:bg-red-50"
                  onClick={() => setShowBatchDeleteConfirm(true)}
                  disabled={batchActionLoading !== null}
                >
                  批量删除
                </Button>
              )}
            </div>
          )}
        </div>

        {/* 职位列表 */}
        <div className="rounded-2xl border border-brand-charcoal/10 bg-white">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
            </div>
          ) : loadError ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3">
              <p className="text-sm text-red-500">加载失败，请重试</p>
              <Button variant="outline" size="sm" onClick={fetchJobs}>
                重试
              </Button>
            </div>
          ) : jobs.length === 0 ? (
            <Empty className="h-64" title="暂无职位" />
          ) : (
            <>
              {/* 表头：全选本页（无任何操作权限时不展示） */}
              {canSelect && (
                <div className="border-brand-charcoal/8 hidden items-center gap-4 border-b px-6 py-3 text-sm font-medium text-brand-charcoal/65 md:flex">
                  <input
                    type="checkbox"
                    checked={selection.isAllSelected(jobs)}
                    ref={(el) => {
                      if (el) el.indeterminate = selection.isIndeterminate(jobs);
                    }}
                    onChange={() => selection.toggleAll(jobs, !selection.isAllSelected(jobs))}
                    aria-label="全选本页职位"
                    className="h-4 w-4 rounded border-brand-charcoal/20"
                  />
                  <span className="flex-1">职位</span>
                  <span>更新时间</span>
                  <span>操作</span>
                </div>
              )}
              <div className="divide-brand-charcoal/8 divide-y">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex flex-wrap items-start gap-3 px-4 py-4 hover:bg-brand-charcoal/[0.03] sm:flex-nowrap sm:items-center sm:gap-4 sm:px-6"
                  >
                    {/* 选择框（无任何操作权限时不展示） */}
                    {canSelect && (
                      <input
                        type="checkbox"
                        checked={selection.isSelected(job)}
                        onChange={() => selection.toggle(job)}
                        aria-label={`选择 ${job.title}`}
                        className="h-4 w-4 rounded border-brand-charcoal/20"
                      />
                    )}

                    {/* 职位信息 */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <Link
                          href={editHref(job.id)}
                          className="min-w-0 truncate font-medium text-brand-charcoal hover:text-brand-primary"
                          title={job.title}
                        >
                          {job.title}
                        </Link>
                        <Badge variant={job.published ? "success" : "default"}>
                          {job.published ? "已发布" : "草稿"}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-brand-charcoal/65">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {job.location}
                        </span>
                        <span>{JOB_TYPE_LABELS[job.type] || job.type}</span>
                        {job.salary && <span>{job.salary}</span>}
                        <Link
                          href={`/admin/applications?jobId=${job.id}`}
                          className="hover:text-brand-primary hover:underline"
                        >
                          {job._count.applications} 份申请
                        </Link>
                      </div>
                    </div>

                    {/* 更新时间（移动端同样展示） */}
                    <div className="text-xs text-brand-charcoal/65 sm:text-sm">
                      {formatDate(job.updatedAt)}
                    </div>

                    {/* 操作按钮 */}
                    <div className="relative ml-auto flex shrink-0 items-center gap-1">
                      {canWriteJobs && (
                        <Tooltip content="编辑" side="top">
                          <IconButton label={`编辑 ${job.title}`} href={editHref(job.id)}>
                            <Edit className="h-4 w-4" />
                          </IconButton>
                        </Tooltip>
                      )}
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
                ))}
              </div>
            </>
          )}
        </div>

        {/* 分页（始终展示总数与每页条数，便于小数据量时调整） */}
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
      </div>
    </RequirePermission>
  );
}
