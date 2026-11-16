"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPost } from "@/lib/api-client";
import { formatDateTimeSeconds as formatDate } from "@/lib/format";
import { deferInEffect } from "@/hooks/deferInEffect";
import { DataTable, PageHeader, RequirePermission, type Column } from "@/components/admin";
import { AdminHubTabs } from "@/components/admin/AdminHubTabs";

interface AnchorItem {
  id: string;
  stream: "audit" | "sso";
  day: string;
  signatureVersion: number;
  keyVersion: number;
  count: number;
  digest: string;
  signature: string;
  archivedAt: string | null;
  verifyStatus: string;
  verifiedAt: string | null;
  createdAt: string;
}

const VERIFY_STATUS_LABELS: Record<string, string> = {
  VERIFIED: "已校验",
  FAILED: "校验失败",
  PENDING: "待校验",
};

interface IntegrityData {
  config: { root: string; backupRoot: string | null; keyVersion: number };
  pendingCount: number;
  latest: {
    audit: { day: string; count: number } | null;
    sso: { day: string; count: number } | null;
  };
  chainVerified: boolean;
  chainErrors: string[];
  anchors: AnchorItem[];
}

interface VerifyResult {
  stream: string;
  day: string;
  verified: boolean;
  count: number;
  digest: string;
  signatureVersion: number;
  keyVersion: number;
  archiveVerified: boolean;
  backupVerified: boolean;
  error?: string;
}

function IntegrityContent() {
  const toast = useToast();
  const [data, setData] = useState<IntegrityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiGet<IntegrityData>("/api/admin/audit-integrity");
      setData(result);
      setLoadError(false);
    } catch {
      setLoadError(true);
      toast.error("加载审计完整性失败");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    deferInEffect(load);
  }, [load]);

  const verify = async (stream: "audit" | "sso", day: string) => {
    setVerifying(`${stream}/${day}`);
    try {
      const result = await apiPost<VerifyResult>("/api/admin/audit-integrity/verify", {
        stream,
        day,
      });
      if (result.verified) {
        toast.success(
          `${stream}/${day} 校验通过${result.archiveVerified ? "（归档已校验）" : "（未归档）"}`
        );
      } else {
        toast.error(`${stream}/${day} 校验失败：${result.error ?? "未知原因"}`);
      }
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "校验失败");
    } finally {
      setVerifying(null);
    }
  };

  const columns: Column<AnchorItem>[] = [
    {
      key: "day",
      title: "日期",
      width: "110px",
      render: (_, item) => <span className="font-mono text-sm">{item.day}</span>,
    },
    {
      key: "stream",
      title: "流",
      width: "90px",
      render: (_, item) => (
        <Badge variant={item.stream === "audit" ? "primary" : "secondary"}>
          {item.stream === "audit" ? "管理审计" : "SSO 审计"}
        </Badge>
      ),
    },
    {
      key: "count",
      title: "条数",
      width: "80px",
      align: "right",
      render: (_, item) => <span className="text-sm tabular-nums">{item.count}</span>,
    },
    {
      key: "signatureVersion",
      title: "签名版本",
      width: "90px",
      align: "center",
      render: (_, item) => (
        <span className="text-xs text-ink-muted">
          v{item.signatureVersion} / key {item.keyVersion}
        </span>
      ),
    },
    {
      key: "digest",
      title: "摘要",
      width: "180px",
      render: (_, item) => (
        <span className="font-mono text-xs text-ink-muted">
          {item.digest.slice(0, 16)}…
        </span>
      ),
    },
    {
      key: "archivedAt",
      title: "归档",
      width: "150px",
      render: (_, item) => (
        <span className="text-xs text-ink-muted">
          {item.archivedAt ? formatDate(item.archivedAt) : "未归档"}
        </span>
      ),
    },
    {
      key: "verifyStatus",
      title: "状态",
      width: "100px",
      align: "center",
      render: (_, item) => (
        <Badge
          variant={
            item.verifyStatus === "VERIFIED"
              ? "success"
              : item.verifyStatus === "FAILED"
                ? "danger"
                : "warning"
          }
        >
          {VERIFY_STATUS_LABELS[item.verifyStatus] ?? item.verifyStatus}
        </Badge>
      ),
    },
    {
      key: "actions",
      title: "校验",
      width: "100px",
      align: "right",
      render: (_, item) => (
        <Button
          variant="outline"
          size="sm"
          loading={verifying === `${item.stream}/${item.day}`}
          disabled={Boolean(verifying)}
          onClick={() => void verify(item.stream, item.day)}
        >
          校验
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="审计完整性"
        description="审计日志哈希链、每日锚点与本地归档校验"
        actions={
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw className="h-4 w-4" />}
            onClick={load}
          >
            刷新
          </Button>
        }
      />

      <AdminHubTabs section="audit" />

      {data && !data.chainVerified && (
        <div className="rounded-xl border border-status-danger-line bg-status-danger-soft p-4 text-sm text-status-danger-strong">
          <p className="font-medium">锚点链连续性异常</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
            {data.chainErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-line bg-white p-4">
          <p className="text-xs text-ink-muted">最新管理审计锚点</p>
          <p className="mt-1 font-mono text-lg font-semibold">{data?.latest.audit?.day ?? "-"}</p>
          <p className="text-xs text-ink-muted">
            {data?.latest.audit ? `${data.latest.audit.count} 条` : "暂无"}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-white p-4">
          <p className="text-xs text-ink-muted">最新 SSO 锚点</p>
          <p className="mt-1 font-mono text-lg font-semibold">{data?.latest.sso?.day ?? "-"}</p>
          <p className="text-xs text-ink-muted">
            {data?.latest.sso ? `${data.latest.sso.count} 条` : "暂无"}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-white p-4">
          <p className="text-xs text-ink-muted">待处理 / 归档目录</p>
          <p className="mt-1 text-lg font-semibold">{data?.pendingCount ?? 0}</p>
          <p className="break-all text-xs text-ink-muted">{data?.config.root ?? "-"}</p>
        </div>
      </div>

      {loadError ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-line bg-white py-12">
          <p className="text-sm text-status-danger-fg">加载失败，请检查服务状态后重试</p>
          <Button variant="outline" size="sm" onClick={load}>
            重新加载
          </Button>
        </div>
      ) : data ? (
        <DataTable
          columns={columns}
          data={data.anchors}
          loading={loading}
          rowKey="id"
          emptyText="暂无锚点"
          tableLayout="fixed"
          minWidth="980px"
          mobileCard={(item) => (
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono">{item.day}</span>
                <Badge variant={item.stream === "audit" ? "primary" : "secondary"}>
                  {item.stream === "audit" ? "管理审计" : "SSO 审计"}
                </Badge>
              </div>
              <p className="text-xs text-ink-muted">
                {item.count} 条 · 签名 v{item.signatureVersion} / key {item.keyVersion}
              </p>
              <p className="break-all font-mono text-xs text-ink-muted">
                {item.digest.slice(0, 24)}…
              </p>
              <div className="flex items-center justify-between gap-2 text-xs text-ink-muted">
                <span>{item.archivedAt ? formatDate(item.archivedAt) : "未归档"}</span>
                <Badge
                  variant={
                    item.verifyStatus === "VERIFIED"
                      ? "success"
                      : item.verifyStatus === "FAILED"
                        ? "danger"
                        : "warning"
                  }
                >
                  {VERIFY_STATUS_LABELS[item.verifyStatus] ?? item.verifyStatus}
                </Badge>
              </div>
              <div className="flex justify-end border-t border-line pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  loading={verifying === `${item.stream}/${item.day}`}
                  disabled={Boolean(verifying)}
                  onClick={() => void verify(item.stream, item.day)}
                >
                  校验
                </Button>
              </div>
            </div>
          )}
        />
      ) : (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <ShieldCheck className="h-4 w-4" />
          加载中...
        </div>
      )}
    </div>
  );
}

export default function AuditIntegrityPage() {
  return (
    <RequirePermission permission="audit:read">
      <IntegrityContent />
    </RequirePermission>
  );
}
