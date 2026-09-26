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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    const size = Number(searchParams.get("pageSize"));
    return Number.isFinite(size) && size >= 1 ? Math.floor(size) : 10;
  });
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [statusFilter, setStatusFilter] = useState("all");
  // 勾选状态：翻页/搜索/筛选变化时自动清空
  const selection = useRowSelection<Job>(
    (job) => job.id,
    `${page}|${pageSize}|${debouncedSearch}|${statusFilter}`
  );
  // 删除确认
  const [loadError, setLoadError] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Job | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [batchActionLoading, setBatchActionLoading] = useState<string | null>(null);

  // 权限：发布需要 jobs:write，删除需要 jobs:delete，批量删除需要 jobs:batch-delete
  const { can: canAdmin } = useAdminPermissions();
  const canWriteJobs = canAdmin("jobs:write");
  const canDeleteJobs = canAdmin("jobs:delete");
  const canBatchDelete = canAdmin("jobs:batch-delete");

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
          search: debouncedSearch,
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
  }, [page, pageSize, debouncedSearch, statusFilter, router, showError, takeLatestJobs]);

  useEffect(() => {
    deferInEffect(fetchJobs);
  }, [fetchJobs]);

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // 切换发布状态
  const togglePublish = async (job: Job) => {
    try {
      await apiPatch(`/api/admin/jobs/${job.id}`, { published: !job.published });
      success(job.published ? "已取消发布" : "已发布");
      fetchJobs();
    } catch {
      showError("操作失败");
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
        setPage(page - 1);
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
        setPage(page - 1);
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-brand-charcoal">招聘管理</h1>
          <p className="mt-1 text-sm text-brand-charcoal/50">共 {total} 个职位</p>
        </div>
        {canWriteJobs && (
          <Link href="/admin/jobs/new">
            <Button leftIcon={<Plus className="h-4 w-4" />}>新增职位</Button>
          </Link>
        )}
      </div>

      {/* 工具栏 */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-white p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="relative w-60">
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-charcoal/40" />
            <Input
              placeholder="搜索职位..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="w-32"
          />
        </div>

        {selection.selectedCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-brand-charcoal/50">
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
      <div className="rounded-xl bg-white shadow-sm">
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
          <div className="divide-brand-charcoal/8 divide-y">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center gap-4 px-6 py-4 hover:bg-brand-charcoal/[0.03]"
              >
                {/* 选择框（无任何操作权限时不展示） */}
                {(canWriteJobs || canDeleteJobs || canBatchDelete) && (
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
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/admin/jobs/${job.id}/edit`}
                      className="font-medium text-brand-charcoal hover:text-brand-primary"
                    >
                      {job.title}
                    </Link>
                    <Badge variant={job.published ? "success" : "default"}>
                      {job.published ? "已发布" : "草稿"}
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-4 text-sm text-brand-charcoal/50">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {job.location}
                    </span>
                    <span>{JOB_TYPE_LABELS[job.type] || job.type}</span>
                    {job.salary && <span>{job.salary}</span>}
                  </div>
                </div>

                {/* 更新时间 */}
                <div className="hidden text-sm text-brand-charcoal/50 md:block">
                  {formatDate(job.updatedAt)}
                </div>

                {/* 操作按钮 */}
                <div className="relative flex items-center gap-1">
                  {canWriteJobs && (
                    <Tooltip content="编辑" side="top">
                      <Link
                        href={`/admin/jobs/${job.id}/edit`}
                        aria-label={`编辑 ${job.title}`}
                        className="rounded p-2 text-brand-charcoal/50 hover:bg-brand-charcoal/[0.06] hover:text-brand-charcoal"
                      >
                        <Edit className="h-4 w-4" />
                      </Link>
                    </Tooltip>
                  )}
                  {canWriteJobs && (
                    <Tooltip content={job.published ? "取消发布" : "发布"} side="top">
                      <button
                        onClick={() => togglePublish(job)}
                        aria-label={job.published ? `取消发布 ${job.title}` : `发布 ${job.title}`}
                        className="rounded p-2 text-brand-charcoal/50 hover:bg-brand-charcoal/[0.06] hover:text-brand-charcoal"
                      >
                        {job.published ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </Tooltip>
                  )}
                  {canDeleteJobs && (
                    <Tooltip content="删除" side="top">
                      <button
                        onClick={() => setDeleteTarget(job)}
                        aria-label={`删除 ${job.title}`}
                        className="rounded p-2 text-brand-charcoal/50 hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </Tooltip>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 分页（始终展示总数与每页条数，便于小数据量时调整） */}
      {total > 0 && (
        <div className="flex justify-center">
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
              const params = new URLSearchParams(searchParams.toString());
              params.set("pageSize", String(size));
              router.push(`/admin/jobs?${params.toString()}`);
            }}
          />
        </div>
      )}

      {/* 删除确认 */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="确认删除"
        description={`确定要删除职位「${deleteTarget?.title}」吗？此操作无法撤销。`}
        confirmText="删除"
        loading={deleting}
        type="danger"
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
