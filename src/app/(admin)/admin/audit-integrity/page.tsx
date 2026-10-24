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

interface IntegrityData {
  config: { root: string; backupRoot: string | null; keyVersion: number };
  pendingCount: number;
  latest: {
    audit: { day: string; count: number } | null;
    sso: { day: string; count: number } | null;
  };
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
  const [verifying, setVerifying] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiGet<IntegrityData>("/api/admin/audit-integrity");
      setData(result);
    } catch {
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
      render: (_, item) => <span className="tabular-nums text-sm">{item.count}</span>,
    },
    {
      key: "signatureVersion",
      title: "签名版本",
      width: "90px",
      align: "center",
      render: (_, item) => (
        <span className="text-xs text-brand-charcoal/65">
          v{item.signatureVersion} / key {item.keyVersion}
        </span>
      ),
    },
    {
      key: "digest",
      title: "摘要",
      width: "180px",
      render: (_, item) => (
        <span className="font-mono text-xs text-brand-charcoal/60">{item.digest.slice(0, 16)}…</span>
      ),
    },
    {
      key: "archivedAt",
      title: "归档",
      width: "150px",
      render: (_, item) => (
        <span className="text-xs text-brand-charcoal/65">
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
          {item.verifyStatus}
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

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-brand-charcoal/10 bg-white p-4">
          <p className="text-xs text-brand-charcoal/60">最新管理审计锚点</p>
          <p className="mt-1 font-mono text-lg font-semibold">
            {data?.latest.audit?.day ?? "-"}
          </p>
          <p className="text-xs text-brand-charcoal/50">
            {data?.latest.audit ? `${data.latest.audit.count} 条` : "暂无"}
          </p>
        </div>
        <div className="rounded-xl border border-brand-charcoal/10 bg-white p-4">
          <p className="text-xs text-brand-charcoal/60">最新 SSO 锚点</p>
          <p className="mt-1 font-mono text-lg font-semibold">{data?.latest.sso?.day ?? "-"}</p>
          <p className="text-xs text-brand-charcoal/50">
            {data?.latest.sso ? `${data.latest.sso.count} 条` : "暂无"}
          </p>
        </div>
        <div className="rounded-xl border border-brand-charcoal/10 bg-white p-4">
          <p className="text-xs text-brand-charcoal/60">PENDING / 归档目录</p>
          <p className="mt-1 text-lg font-semibold">{data?.pendingCount ?? 0}</p>
          <p className="break-all text-xs text-brand-charcoal/50">{data?.config.root ?? "-"}</p>
        </div>
      </div>

      {data ? (
        <DataTable
          columns={columns}
          data={data.anchors}
          loading={loading}
          rowKey="id"
          emptyText="暂无锚点"
          tableLayout="fixed"
          minWidth="980px"
        />
      ) : (
        <div className="flex items-center gap-2 text-sm text-brand-charcoal/60">
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
