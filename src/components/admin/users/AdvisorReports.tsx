"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronLeft, RefreshCw } from "lucide-react";
import { apiGet, ApiError } from "@/lib/api-client";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type {
  AdvisorReportDetail,
  AdvisorReportListPayload,
  AdvisorReportProduct,
  AdvisorReportQuestionnaire,
} from "@/types/advisor-report";

const DIMENSION_LABELS: Record<string, string> = {
  waterOil: "水油平衡",
  skinTone: "肤色均匀度",
  spots: "色斑状况",
  wrinkles: "细纹皱纹",
  uvDamage: "光老化程度",
  sensitivity: "肌肤敏感度",
  darkCircles: "黑眼圈",
  firmness: "皮肤弹性",
  acne: "粉刺/痤疮",
  radiance: "光泽度",
};

const DIMENSION_ORDER = [
  "waterOil",
  "skinTone",
  "spots",
  "wrinkles",
  "uvDamage",
  "sensitivity",
  "darkCircles",
  "firmness",
  "acne",
  "radiance",
];

const ZONE_LABELS: Record<string, string> = {
  forehead: "额头",
  tZone: "T 字区",
  leftCheek: "左脸颊",
  rightCheek: "右脸颊",
  eyeArea: "眼周",
  jawline: "下颌",
};

const GRADE_LABELS: Record<string, string> = {
  excellent: "优秀",
  good: "良好",
  average: "一般",
  fair: "需关注",
  poor: "较差",
};

const SEVERITY_LABELS: Record<string, string> = {
  severe: "重点",
  moderate: "待改善",
  mild: "轻微",
};

const DATA_SOURCE_LABELS: Record<string, string> = {
  comprehensive: "问卷 + 面部影像",
  questionnaire: "问卷",
  hybrid: "混合",
};

const QUESTIONNAIRE_FIELDS: Array<{ key: keyof AdvisorReportQuestionnaire; label: string }> = [
  { key: "ageRange", label: "年龄段" },
  { key: "primaryConcerns", label: "关注问题" },
  { key: "allergies", label: "过敏史" },
  { key: "pregnancy", label: "备孕/孕期/哺乳期" },
  { key: "medicalBeauty", label: "近 3 月医美" },
  { key: "sleepQuality", label: "睡眠质量" },
  { key: "stressLevel", label: "压力水平" },
  { key: "menstrualCycle", label: "生理周期" },
  { key: "waterIntake", label: "饮水量" },
  { key: "exerciseFrequency", label: "运动频率" },
  { key: "dietaryHabits", label: "饮食习惯" },
  { key: "sunExposure", label: "日晒情况" },
  { key: "skincareFrequency", label: "护肤习惯" },
  { key: "skincareLevel", label: "护肤水平" },
  { key: "budget", label: "预算" },
];

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDay(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("zh-CN");
}

function versionLabel(version: number | null | undefined): string {
  return version === 2 ? "v2" : "v1";
}

function scoreTone(score: number | null | undefined): string {
  if (typeof score !== "number") return "text-brand-charcoal";
  if (score >= 85) return "text-emerald-700";
  if (score >= 70) return "text-brand-charcoal";
  if (score >= 55) return "text-amber-700";
  return "text-red-600";
}

function Section({
  title,
  extra,
  children,
}: {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-brand-charcoal/10 pt-4 first:border-t-0 first:pt-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-brand-charcoal">{title}</h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 py-1.5 text-xs">
      <dt className="text-brand-charcoal/55">{label}</dt>
      <dd className="min-w-0 text-brand-charcoal">{value || "—"}</dd>
    </div>
  );
}

function ProductTable({ products }: { products: AdvisorReportProduct[] }) {
  if (products.length === 0) {
    return <p className="text-xs text-brand-charcoal/55">暂无产品推荐。</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-brand-charcoal/10">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead className="bg-brand-charcoal/[0.03] text-brand-charcoal/55">
          <tr>
            <th className="px-3 py-2 font-medium">产品</th>
            <th className="px-3 py-2 font-medium">分类</th>
            <th className="px-3 py-2 font-medium">推荐理由</th>
            <th className="px-3 py-2 font-medium">价格</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-charcoal/[0.06]">
          {products.map((product) => (
            <tr key={product.id}>
              <td className="px-3 py-2 font-medium text-brand-charcoal">{product.name}</td>
              <td className="px-3 py-2 text-brand-charcoal/65">{product.category || "—"}</td>
              <td className="px-3 py-2 text-brand-charcoal/75">{product.reason || "—"}</td>
              <td className="px-3 py-2 font-mono text-brand-charcoal/75">
                {product.price ? `¥${product.price}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Questionnaire({ data }: { data: AdvisorReportQuestionnaire | undefined }) {
  if (!data) {
    return <p className="text-xs text-brand-charcoal/55">本报告没有可展示的问卷档案。</p>;
  }
  return (
    <dl className="grid gap-x-6 sm:grid-cols-2">
      {QUESTIONNAIRE_FIELDS.map(({ key, label }) => {
        const value = data[key];
        if (value === undefined || value === null || value === "") return null;
        return (
          <Field
            key={key}
            label={label}
            value={Array.isArray(value) ? value.join("、") : String(value)}
          />
        );
      })}
    </dl>
  );
}

export function AdvisorReportDetailView({
  detail,
  onBack,
}: {
  detail: AdvisorReportDetail;
  onBack: () => void;
}) {
  const { summary, result, faceAnalysis } = detail;
  const consultant = result.consultantReport;
  const dimensions = faceAnalysis?.dimensions;
  const isV1 = !consultant;

  return (
    <div className="space-y-4">
      <div className="flex min-w-0 items-start gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={onBack}
          leftIcon={<ChevronLeft className="h-4 w-4" />}
          className="-ml-2 shrink-0"
        >
          返回
        </Button>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-brand-charcoal">完整测肤报告</h2>
            <Badge variant={isV1 ? "secondary" : "success"} size="sm">
              {versionLabel(result.reportVersion)}
            </Badge>
            {detail.expired && (
              <Badge variant="warning" size="sm">
                已过期
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-brand-charcoal/55">
            {formatDate(detail.completedAt)}
            {summary.dataSource
              ? ` · ${DATA_SOURCE_LABELS[summary.dataSource] || summary.dataSource}`
              : ""}
            {summary.percentile != null ? ` · 超过 ${summary.percentile}% 用户` : ""}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          {
            label: "综合评分",
            value: summary.overallScore ?? "—",
            tone: scoreTone(summary.overallScore),
          },
          { label: "肌肤年龄", value: summary.skinAge ?? "—", tone: "" },
          { label: "肤质", value: summary.skinTypeLabel || "—", tone: "" },
          { label: "派系", value: detail.personaLabel || "—", tone: "" },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-brand-charcoal/10 px-3 py-2">
            <p className="text-[11px] text-brand-charcoal/55">{item.label}</p>
            <p className={`mt-0.5 text-base font-semibold tabular-nums ${item.tone}`}>
              {item.value}
            </p>
          </div>
        ))}
      </div>

      <Section title="报告概览">
        <div className="space-y-3 text-xs leading-relaxed text-brand-charcoal/80">
          <p>{consultant?.overview || result.analysis.summary}</p>
          {result.analysis.details.length > 0 && (
            <ul className="space-y-1">
              {result.analysis.details.map((item) => (
                <li key={item} className="flex items-start gap-1.5">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-charcoal/35" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
          {result.analysis.lifestyleTips && result.analysis.lifestyleTips.length > 0 && (
            <p>
              <span className="font-medium text-brand-charcoal">生活建议：</span>
              {result.analysis.lifestyleTips.join("；")}
            </p>
          )}
          {consultant?.strengths && consultant.strengths.length > 0 && (
            <p>
              <span className="font-medium text-brand-charcoal">优势：</span>
              {consultant.strengths.join("；")}
            </p>
          )}
          {consultant?.routineNote && (
            <p>
              <span className="font-medium text-brand-charcoal">节奏说明：</span>
              {consultant.routineNote}
            </p>
          )}
        </div>
      </Section>

      {consultant?.issues && consultant.issues.length > 0 && (
        <Section
          title="顾问诊断"
          extra={<span className="text-[11px] text-brand-charcoal/45">展开查看完整推理</span>}
        >
          <div className="space-y-2">
            {consultant.issues.map((issue, index) => (
              <details
                key={`${issue.title}-${index}`}
                className="rounded-lg border border-brand-charcoal/10 bg-white"
              >
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs">
                  <span className="font-mono text-[11px] text-brand-charcoal/40">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="font-medium text-brand-charcoal">{issue.title}</span>
                  <Badge
                    variant={
                      issue.severity === "severe"
                        ? "danger"
                        : issue.severity === "moderate"
                          ? "warning"
                          : "secondary"
                    }
                    size="sm"
                  >
                    {SEVERITY_LABELS[issue.severity] || issue.severity}
                  </Badge>
                </summary>
                <div className="space-y-3 border-t border-brand-charcoal/[0.06] px-3 py-3 text-xs leading-relaxed text-brand-charcoal/80">
                  <p>
                    <span className="font-medium text-brand-charcoal">我看到的：</span>
                    {issue.observation}
                  </p>
                  <p>
                    <span className="font-medium text-brand-charcoal">直接原因：</span>
                    {issue.directCauses}
                  </p>
                  <p>
                    <span className="font-medium text-brand-charcoal">间接原因：</span>
                    {issue.indirectCauses}
                  </p>
                  <p>
                    <span className="font-medium text-brand-charcoal">护肤方案：</span>
                    {issue.skincarePlan}
                  </p>
                  <p>
                    <span className="font-medium text-brand-charcoal">生活方案：</span>
                    {issue.lifestylePlan}
                  </p>
                  {issue.medicalBoundary && (
                    <p>
                      <span className="font-medium text-brand-charcoal">就医边界：</span>
                      {issue.medicalBoundary}
                    </p>
                  )}
                </div>
              </details>
            ))}
          </div>
        </Section>
      )}

      <Section title="十维评分">
        {!faceAnalysis || !dimensions ? (
          <p className="text-xs text-brand-charcoal/55">该报告为问卷模式，没有面部十维数据。</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-brand-charcoal/10">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="bg-brand-charcoal/[0.03] text-brand-charcoal/55">
                <tr>
                  <th className="px-3 py-2 font-medium">维度</th>
                  <th className="px-3 py-2 font-medium">分数</th>
                  <th className="px-3 py-2 font-medium">等级</th>
                  <th className="px-3 py-2 font-medium">说明</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-charcoal/[0.06]">
                {DIMENSION_ORDER.map((key) => {
                  const item = dimensions[key];
                  if (!item || typeof item.score !== "number") return null;
                  return (
                    <tr key={key}>
                      <td className="px-3 py-2 text-brand-charcoal">
                        {DIMENSION_LABELS[key] || key}
                      </td>
                      <td
                        className={`px-3 py-2 font-mono font-medium tabular-nums ${scoreTone(
                          item.score
                        )}`}
                      >
                        {item.score}
                      </td>
                      <td className="px-3 py-2 text-brand-charcoal/65">
                        {item.grade ? GRADE_LABELS[item.grade] || item.grade : "—"}
                      </td>
                      <td className="px-3 py-2 text-brand-charcoal/65">{item.details || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {faceAnalysis && (
        <Section title="面部分析">
          <div className="space-y-3 text-xs text-brand-charcoal/80">
            <dl className="grid gap-x-6 sm:grid-cols-2">
              <Field
                label="面部评分"
                value={faceAnalysis.overallScore != null ? `${faceAnalysis.overallScore} 分` : "—"}
              />
              <Field
                label="肌肤年龄"
                value={
                  faceAnalysis.skinAge?.estimated != null
                    ? `${faceAnalysis.skinAge.estimated} 岁`
                    : "—"
                }
              />
              <Field
                label="水润度"
                value={
                  faceAnalysis.hydration
                    ? `${faceAnalysis.hydration.level}${
                        faceAnalysis.hydration.percent != null
                          ? `（${faceAnalysis.hydration.percent}%）`
                          : ""
                      }`
                    : "—"
                }
              />
              <Field label="面部结论" value={faceAnalysis.summary || "—"} />
            </dl>

            {faceAnalysis.skinConditions && faceAnalysis.skinConditions.length > 0 && (
              <div>
                <p className="mb-1 font-medium text-brand-charcoal">肌肤问题</p>
                <div className="divide-y divide-brand-charcoal/[0.06] rounded-lg border border-brand-charcoal/10">
                  {faceAnalysis.skinConditions.map((condition, index) => (
                    <div key={`${condition.condition}-${index}`} className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-brand-charcoal">
                          {condition.condition}
                        </span>
                        {condition.severity && (
                          <Badge
                            variant={
                              condition.severity === "severe"
                                ? "danger"
                                : condition.severity === "moderate"
                                  ? "warning"
                                  : "secondary"
                            }
                            size="sm"
                          >
                            {SEVERITY_LABELS[condition.severity]}
                          </Badge>
                        )}
                        {condition.area && (
                          <span className="text-brand-charcoal/55">{condition.area}</span>
                        )}
                      </div>
                      {condition.description && (
                        <p className="mt-0.5 text-brand-charcoal/65">{condition.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {faceAnalysis.zoneAnalysis && (
              <div>
                <p className="mb-1 font-medium text-brand-charcoal">区域观察</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(ZONE_LABELS).map(([key, label]) => {
                    const zone =
                      faceAnalysis.zoneAnalysis?.[key as keyof typeof faceAnalysis.zoneAnalysis];
                    if (!zone || (!zone.condition && !zone.advice)) return null;
                    return (
                      <div
                        key={key}
                        className="rounded-lg border border-brand-charcoal/10 px-3 py-2"
                      >
                        <p className="font-medium text-brand-charcoal">{label}</p>
                        {zone.condition && (
                          <p className="mt-0.5 text-brand-charcoal/75">{zone.condition}</p>
                        )}
                        {zone.advice && (
                          <p className="mt-1 text-brand-charcoal/60">建议：{zone.advice}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {faceAnalysis.labAnalysis && (
              <div>
                <p className="mb-1 font-medium text-brand-charcoal">实验室指标</p>
                <dl className="grid gap-x-6 sm:grid-cols-2">
                  {faceAnalysis.labAnalysis.glogau && (
                    <Field
                      label="Glogau 分级"
                      value={`${faceAnalysis.labAnalysis.glogau.value} · ${faceAnalysis.labAnalysis.glogau.status}`}
                    />
                  )}
                  {faceAnalysis.labAnalysis.homogeneity && (
                    <Field
                      label="均匀度"
                      value={`${faceAnalysis.labAnalysis.homogeneity.value ?? "—"}${
                        faceAnalysis.labAnalysis.homogeneity.unit ?? ""
                      } · ${faceAnalysis.labAnalysis.homogeneity.status}`}
                    />
                  )}
                  {faceAnalysis.labAnalysis.wrinkleGrade && (
                    <Field
                      label="皱纹等级"
                      value={`${faceAnalysis.labAnalysis.wrinkleGrade.value} · ${faceAnalysis.labAnalysis.wrinkleGrade.status}`}
                    />
                  )}
                </dl>
              </div>
            )}

            {faceAnalysis.recommendations && faceAnalysis.recommendations.length > 0 && (
              <p>
                <span className="font-medium text-brand-charcoal">面部建议：</span>
                {faceAnalysis.recommendations.join("；")}
              </p>
            )}
          </div>
        </Section>
      )}

      <Section title="产品推荐">
        <ProductTable products={result.products ?? []} />
      </Section>

      <Section title="问卷档案">
        <Questionnaire data={summary.questionnaire} />
      </Section>

      <p className="border-t border-brand-charcoal/10 pt-3 text-[11px] text-brand-charcoal/40">
        报告完成于 {formatDate(detail.completedAt)}
        {detail.expiresAt ? ` · 有效期至 ${formatDay(detail.expiresAt)}` : ""}
      </p>
    </div>
  );
}

export function AdvisorReports({ userId }: { userId: string }) {
  const takeLatestList = useLatestRequest();
  const takeLatestDetail = useLatestRequest();
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);
  const [payload, setPayload] = useState<AdvisorReportListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<AdvisorReportDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  useEffect(() => {
    const isLatest = takeLatestList();
    apiGet<AdvisorReportListPayload>(
      `/api/admin/users/${userId}/advisor/reports?page=${page}&limit=8`
    )
      .then((data) => {
        if (!isLatest()) return;
        setPayload(data);
        setError("");
      })
      .catch((err) => {
        if (!isLatest()) return;
        setPayload(null);
        setError(err instanceof ApiError ? err.message : "加载测肤报告失败，请稍后重试");
      })
      .finally(() => {
        if (isLatest()) setLoading(false);
      });
  }, [page, reloadToken, takeLatestList, userId]);

  const loadList = useCallback((nextPage: number) => {
    setPage(nextPage);
    setReloadToken((value) => value + 1);
    setLoading(true);
    setError("");
    setPayload(null);
  }, []);

  const openDetail = useCallback(
    (sessionId: string) => {
      const isLatest = takeLatestDetail();
      setDetailOpen(true);
      setDetail(null);
      setDetailLoading(true);
      setDetailError("");
      apiGet<AdvisorReportDetail>(`/api/admin/users/${userId}/advisor/reports/${sessionId}`)
        .then((data) => {
          if (!isLatest()) return;
          setDetail(data);
        })
        .catch((err) => {
          if (!isLatest()) return;
          setDetailError(err instanceof ApiError ? err.message : "加载报告失败，请稍后重试");
        })
        .finally(() => {
          if (isLatest()) setDetailLoading(false);
        });
    },
    [takeLatestDetail, userId]
  );

  if (detailOpen) {
    return (
      <div className="rounded-xl border border-brand-charcoal/10 bg-white p-3 sm:p-4">
        {detailLoading ? (
          <div className="space-y-3">
            <div className="h-8 w-40 animate-pulse rounded bg-brand-charcoal/[0.06]" />
            <div className="h-24 animate-pulse rounded-lg bg-brand-charcoal/[0.04]" />
            <div className="h-40 animate-pulse rounded-lg bg-brand-charcoal/[0.04]" />
          </div>
        ) : detailError ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-red-600">{detailError}</p>
            <Button size="sm" variant="outline" onClick={() => setDetailOpen(false)}>
              返回
            </Button>
          </div>
        ) : detail ? (
          <AdvisorReportDetailView detail={detail} onBack={() => setDetailOpen(false)} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-brand-charcoal/10 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-charcoal/10 px-3 py-2.5 sm:px-4">
        <div>
          <h3 className="text-sm font-semibold text-brand-charcoal">测肤报告</h3>
          <p className="mt-0.5 text-[11px] text-brand-charcoal/55">
            {payload ? `共 ${payload.pagination.total} 份可查看报告` : "已完成报告"}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => loadList(page)}
          leftIcon={<RefreshCw className="h-4 w-4" />}
        >
          刷新
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2 p-3 sm:p-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-9 animate-pulse rounded-lg bg-brand-charcoal/[0.04]" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
          <p className="text-xs text-brand-charcoal/65">{error}</p>
          <Button size="sm" variant="outline" onClick={() => loadList(page)}>
            重试
          </Button>
        </div>
      ) : !payload || payload.reports.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-brand-charcoal/55">暂无已完成测肤报告。</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="bg-brand-charcoal/[0.03] text-brand-charcoal/55">
                <tr>
                  <th className="px-3 py-2 font-medium">完成时间</th>
                  <th className="px-3 py-2 font-medium">评分</th>
                  <th className="px-3 py-2 font-medium">肤质</th>
                  <th className="px-3 py-2 font-medium">版本</th>
                  <th className="px-3 py-2 font-medium">状态</th>
                  <th className="px-3 py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-charcoal/[0.06]">
                {payload.reports.map((report) => (
                  <tr key={report.sessionId} className="hover:bg-brand-charcoal/[0.015]">
                    <td className="whitespace-nowrap px-3 py-2 text-brand-charcoal/75">
                      {formatDate(report.completedAt)}
                    </td>
                    <td
                      className={`px-3 py-2 font-mono font-medium tabular-nums ${scoreTone(
                        report.overallScore
                      )}`}
                    >
                      {report.overallScore ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-brand-charcoal/75">
                      {report.skinTypeLabel || "—"}
                    </td>
                    <td className="px-3 py-2 text-brand-charcoal/55">
                      {versionLabel(report.reportVersion)}
                    </td>
                    <td className="px-3 py-2">
                      {report.expired ? (
                        <Badge variant="warning" size="sm">
                          已过期
                        </Badge>
                      ) : (
                        <Badge variant="success" size="sm">
                          正常
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openDetail(report.sessionId)}
                      >
                        查看报告
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {payload.pagination.totalPages > 1 && (
            <div className="flex items-center justify-end gap-2 border-t border-brand-charcoal/10 px-3 py-2 sm:px-4">
              <Button
                size="sm"
                variant="ghost"
                disabled={page <= 1 || loading}
                onClick={() => loadList(page - 1)}
              >
                上一页
              </Button>
              <span className="text-xs tabular-nums text-brand-charcoal/55">
                {page}/{payload.pagination.totalPages}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={page >= payload.pagination.totalPages || loading}
                onClick={() => loadList(page + 1)}
              >
                下一页
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
