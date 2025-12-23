"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Users,
  CheckCircle,
  Camera,
  SkipForward,
  Sparkles,
  Share2,
  TrendingUp,
  Calendar,
  RefreshCw,
  Smartphone,
  Monitor,
  Tablet,
  AlertCircle,
  Eye,
  Brain,
  FileText,
  Loader2,
  X,
  Copy,
  Check,
  Download,
  Clock,
  ChevronRight,
  MessageCircle,
  Send,
  FileDown,
  MapPin,
  Globe,
  BarChart3,
  Grid3X3,
  Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

// 动态导入 ECharts 地图组件（避免 SSR 问题）
const ChinaMap = dynamic(() => import("@/components/charts/ChinaMap").then((mod) => mod.ChinaMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-[350px] items-center justify-center text-gray-400">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  ),
});

interface AnalyticsData {
  overview: {
    totalSessions: number;
    completedSessions: number;
    conversionRate: number;
    faceScanUsed: number;
    faceScanSkipped: number;
    faceScanRate: number;
    aiAnalysisCount: number;
    fallbackAnalysisCount: number;
    aiUsageRate: number;
    totalShares: number;
  };
  comparison?: {
    totalSessionsChange: number | null;
    completedSessionsChange: number | null;
    conversionRateChange: number | null;
    faceScanRateChange: number | null;
    aiUsageRateChange: number | null;
    totalSharesChange: number | null;
    prev: {
      totalSessions: number;
      completedSessions: number;
      conversionRate: number;
      faceScanUsed: number;
      faceScanSkipped: number;
      faceScanRate: number;
      aiAnalysisCount: number;
      fallbackAnalysisCount: number;
      aiUsageRate: number;
      totalShares: number;
    };
  };
  funnel: {
    started: number;
    completedQuestionnaire: number;
    startedFaceScan: number;
    completedFaceScan: number;
    skippedFaceScan: number;
    completedAnalysis: number;
    viewedResult: number;
    shared: number;
  };
  daily: Array<{
    date: string;
    sessions: number;
    completed: number;
    faceScanUsed: number;
    faceScanSkipped: number;
  }>;
  answerDistribution: Record<string, Record<string, number>>;
  deviceDistribution: {
    desktop: number;
    mobile: number;
    tablet: number;
  };
  hourlyDistribution?: Record<string, number>; // 24小时时段分布
  weeklyHeatmap?: Record<string, Record<string, number>>; // 7天×24小时热力图数据
  provinceDistribution?: Array<{ province: string; count: number }>; // 省份地域分布
  cityDistribution?: Array<{ city: string; count: number }>; // 城市分布
  dateRange?: {
    start: string;
    end: string;
    prevStart?: string;
    prevEnd?: string;
  };
}

type DateRange = "today" | "yesterday" | "7days" | "30days" | "90days";

export default function AdvisorAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>("30days");

  // AI 分析报告状态
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportGeneratedAt, setReportGeneratedAt] = useState<Date | null>(null);
  const [copied, setCopied] = useState(false);
  const [reportMinimized, setReportMinimized] = useState(false); // 是否收起到右下角
  const [minimizeAnimating, setMinimizeAnimating] = useState(false); // 收起动画进行中
  const reportAbortController = useRef<AbortController | null>(null); // 用于取消请求

  // 追问功能状态
  const [chatHistory, setChatHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/advisor/analytics?range=${dateRange}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      }
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

  // 取消正在进行的 AI 分析
  const cancelReportGeneration = () => {
    if (reportAbortController.current) {
      reportAbortController.current.abort();
      reportAbortController.current = null;
    }
  };

  // 生成 AI 分析报告 (流式输出)
  const generateAIReport = async () => {
    if (!data) return;

    // 取消之前的请求（如果有）
    cancelReportGeneration();

    // 创建新的 AbortController
    const abortController = new AbortController();
    reportAbortController.current = abortController;

    setReportModalOpen(true);
    setReportLoading(true);
    setReportError(null);
    setReportContent("");
    setReportGeneratedAt(null);
    setChatHistory([]); // 重置追问历史
    setReportMinimized(false);

    try {
      const res = await fetch("/api/admin/advisor/analytics/report/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analyticsData: data }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "生成报告失败");
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("无法获取响应流");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";

      setReportLoading(false); // 开始接收内容后取消加载状态
      setReportGeneratedAt(new Date());

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // 检查是否被取消
        if (abortController.signal.aborted) {
          reader.cancel();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            const dataStr = trimmed.slice(6);
            if (dataStr === "[DONE]") continue;
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.error) {
                throw new Error(parsed.error);
              }
              if (parsed.content) {
                fullContent += parsed.content;
                setReportContent(fullContent);
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue; // 忽略 JSON 解析错误
              throw e;
            }
          }
        }
      }
    } catch (error) {
      // 如果是用户主动取消，不显示错误
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Failed to generate report:", error);
      setReportError(error instanceof Error ? error.message : "网络错误，请稍后重试");
      setReportLoading(false);
    } finally {
      // 清理 controller 引用
      if (reportAbortController.current === abortController) {
        reportAbortController.current = null;
      }
    }
  };

  // 复制报告内容
  const copyReport = async () => {
    if (!reportContent) return;
    try {
      await navigator.clipboard.writeText(reportContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Copy failed:", error);
    }
  };

  // 下载报告为 Markdown 文件
  const downloadReport = () => {
    if (!reportContent) return;
    const blob = new Blob([reportContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `AI分析报告_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 导出 PDF (使用浏览器打印功能)
  const exportToPDF = () => {
    if (!reportContent) return;

    // 创建打印窗口
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("请允许弹出窗口以导出 PDF");
      return;
    }

    const dateStr = new Date().toLocaleDateString("zh-CN");
    const dateRange = data?.dateRange
      ? `${new Date(data.dateRange.start).toLocaleDateString("zh-CN")} - ${new Date(data.dateRange.end).toLocaleDateString("zh-CN")}`
      : "";

    // 将 Markdown 转换为简单 HTML
    const htmlContent = reportContent
      .replace(/^# (.+)$/gm, '<h1 style="font-size:24px;font-weight:bold;margin:24px 0 16px;border-bottom:2px solid #d4af37;padding-bottom:8px;">$1</h1>')
      .replace(/^## (.+)$/gm, '<h2 style="font-size:18px;font-weight:bold;margin:20px 0 12px;color:#333;">$1</h2>')
      .replace(/^### (.+)$/gm, '<h3 style="font-size:14px;font-weight:bold;margin:16px 0 8px;color:#555;">$1</h3>')
      .replace(/^- (.+)$/gm, '<li style="margin:4px 0;padding-left:8px;">$1</li>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\n\n/g, '</p><p style="margin:12px 0;line-height:1.6;">')
      .replace(/\n/g, '<br>');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>NIHPLOD AI分析报告 - ${dateStr}</title>
        <style>
          @page { margin: 20mm; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
            font-size: 12px;
            line-height: 1.6;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #d4af37;
            padding-bottom: 16px;
            margin-bottom: 24px;
          }
          .logo { font-size: 24px; font-weight: bold; color: #d4af37; }
          .meta { text-align: right; font-size: 11px; color: #666; }
          table { width: 100%; border-collapse: collapse; margin: 16px 0; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 11px; }
          th { background: #f5f5f5; font-weight: bold; }
          ul { padding-left: 20px; }
          .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 10px; color: #999; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">NIHPLOD</div>
          <div class="meta">
            <div>AI 智能分析报告</div>
            <div>生成时间：${dateStr}</div>
            ${dateRange ? `<div>数据范围：${dateRange}</div>` : ""}
          </div>
        </div>
        <div class="content">
          <p style="margin:12px 0;line-height:1.6;">${htmlContent}</p>
        </div>
        <div class="footer">
          © ${new Date().getFullYear()} NIHPLOD 旎柏护肤 · AI 分析报告 · 仅供内部参考
        </div>
      </body>
      </html>
    `);

    printWindow.document.close();

    // 等待内容加载后打印
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  // 追问功能
  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading || !reportContent) return;

    const question = chatInput.trim();
    setChatInput("");
    setChatLoading(true);

    // 添加用户消息
    const newHistory = [...chatHistory, { role: "user" as const, content: question }];
    setChatHistory(newHistory);

    try {
      const res = await fetch("/api/admin/advisor/analytics/report/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          reportContent,
          chatHistory,
          analyticsData: data,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "请求失败");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("无法获取响应流");

      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";

      // 添加空的助手消息
      setChatHistory([...newHistory, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            const dataStr = trimmed.slice(6);
            if (dataStr === "[DONE]") continue;
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.error) throw new Error(parsed.error);
              if (parsed.content) {
                assistantContent += parsed.content;
                setChatHistory([...newHistory, { role: "assistant", content: assistantContent }]);
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue;
              throw e;
            }
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      setChatHistory([
        ...newHistory,
        { role: "assistant", content: `抱歉，发生错误：${error instanceof Error ? error.message : "未知错误"}` },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // 从报告内容提取章节目录
  const extractSections = (content: string): { title: string; id: string }[] => {
    const sections: { title: string; id: string }[] = [];
    const lines = content.split("\n");
    lines.forEach((line, index) => {
      if (line.startsWith("## ") && !line.startsWith("### ")) {
        const title = line.slice(3).trim();
        sections.push({ title, id: `section-${index}` });
      }
    });
    return sections;
  };

  const dateRangeOptions: { value: DateRange; label: string }[] = [
    { value: "today", label: "今天" },
    { value: "yesterday", label: "昨天" },
    { value: "7days", label: "近7天" },
    { value: "30days", label: "近30天" },
    { value: "90days", label: "近90天" },
  ];

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/admin/advisor">
            <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
              返回
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">用户行为统计</h1>
            <p className="mt-1 text-sm text-gray-500">AI 护肤顾问使用数据分析</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-1">
            {dateRangeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setDateRange(option.value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  dateRange === option.value
                    ? "bg-brand-gold text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />}
            onClick={fetchData}
            disabled={loading}
          >
            刷新
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Brain className="h-4 w-4" />}
            onClick={() => {
              // 如果有收起的报告，直接展开
              if (reportMinimized && reportContent) {
                setReportModalOpen(true);
                setReportMinimized(false);
              } else {
                // 否则生成新报告
                generateAIReport();
              }
            }}
            disabled={loading || !data}
          >
            AI 分析报告
          </Button>
        </div>
      </div>

      {/* 收起动画 */}
      {minimizeAnimating && (
        <div className="fixed inset-0 z-[60] pointer-events-none flex items-center justify-center">
          <div className="h-[80vh] w-[90vw] max-w-4xl rounded-xl bg-white shadow-2xl animate-minimize-window" />
        </div>
      )}

      {/* AI 分析报告收起后的悬浮按钮（只有收起状态才显示） */}
      {reportMinimized && reportContent && !reportModalOpen && !minimizeAnimating && (
        <button
          onClick={() => {
            setReportModalOpen(true);
            setReportMinimized(false);
          }}
          className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-white shadow-lg transition-all duration-200 hover:bg-amber-600 hover:shadow-xl hover:scale-105 active:scale-95 animate-fade-scale-in"
          title="展开 AI 分析报告"
        >
          <Brain className="h-5 w-5" />
        </button>
      )}

      {/* AI 分析报告 Modal */}
      <Modal
        open={reportModalOpen}
        onClose={() => {
          // 取消正在进行的请求
          cancelReportGeneration();
          // 关闭时清除报告内容和收起状态
          setReportModalOpen(false);
          setReportMinimized(false);
          setReportLoading(false);
          setReportContent(null);
          setReportError(null);
          setReportGeneratedAt(null);
          setChatHistory([]);
        }}
        title=""
        size="full"
      >
        <div className="flex h-[80vh] flex-col -mx-6 -my-4 overflow-hidden rounded-b-xl">
          {reportLoading ? (
            <div className="flex flex-1 flex-col items-center justify-center">
              <div className="relative">
                <Brain className="h-10 w-10 text-gray-300" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-12 w-12 animate-spin rounded-full border-2 border-gray-200 border-t-gray-400" />
                </div>
              </div>
              <p className="mt-6 text-sm font-medium text-gray-700">AI 正在分析数据...</p>
              <p className="mt-1 text-xs text-gray-400">预计需要 15-30 秒</p>
            </div>
          ) : reportError ? (
            <div className="flex flex-1 flex-col items-center justify-center">
              <AlertCircle className="h-10 w-10 text-red-300" />
              <p className="mt-6 text-sm font-medium text-gray-700">生成失败</p>
              <p className="mt-1 text-xs text-red-500">{reportError}</p>
              <button
                onClick={generateAIReport}
                className="mt-4 rounded-md bg-gray-100 px-4 py-2 text-sm text-gray-600 hover:bg-gray-200"
              >
                重新生成
              </button>
            </div>
          ) : reportContent ? (
            <div className="flex h-full">
              {/* 左侧导航 */}
              <div className="hidden w-52 shrink-0 border-r bg-gray-50/50 lg:block rounded-bl-xl overflow-hidden">
                <div className="p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">目录</p>
                  <nav className="mt-3 space-y-1">
                    {extractSections(reportContent).map((section, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          const el = document.getElementById(section.id);
                          el?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      >
                        <ChevronRight className="h-3 w-3 text-gray-400" />
                        <span className="truncate">{section.title}</span>
                      </button>
                    ))}
                  </nav>
                </div>
              </div>

              {/* 主内容区 */}
              <div className="flex flex-1 flex-col overflow-hidden">
                {/* 顶部操作栏 */}
                <div className="flex shrink-0 items-center justify-between border-b bg-white px-6 py-3">
                  <div className="flex items-center gap-4">
                    <h2 className="text-sm font-medium text-gray-800">AI 分析报告</h2>
                    {reportGeneratedAt && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="h-3 w-3" />
                        {reportGeneratedAt.toLocaleString("zh-CN", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                    {data?.dateRange && (
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                        数据范围: {new Date(data.dateRange.start).toLocaleDateString("zh-CN")} - {new Date(data.dateRange.end).toLocaleDateString("zh-CN")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={copyReport}
                      className={cn(
                        "flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition-colors",
                        copied
                          ? "bg-green-50 text-green-600"
                          : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                      )}
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? "已复制" : "复制"}
                    </button>
                    <button
                      onClick={downloadReport}
                      className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    >
                      <Download className="h-3.5 w-3.5" />
                      下载MD
                    </button>
                    <button
                      onClick={exportToPDF}
                      className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    >
                      <FileDown className="h-3.5 w-3.5" />
                      导出PDF
                    </button>
                    <button
                      onClick={generateAIReport}
                      className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      重新生成
                    </button>
                    <div className="mx-1 h-4 w-px bg-gray-200" />
                    <button
                      onClick={() => {
                        // 先关闭 Modal
                        setReportModalOpen(false);
                        // 开始动画
                        setMinimizeAnimating(true);
                        // 动画结束后显示悬浮按钮
                        setTimeout(() => {
                          setMinimizeAnimating(false);
                          setReportMinimized(true);
                        }, 500);
                      }}
                      className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs text-amber-600 hover:bg-amber-50"
                      title="收起到右下角"
                    >
                      <Minimize2 className="h-3.5 w-3.5" />
                      收起
                    </button>
                  </div>
                </div>

                {/* 报告内容 */}
                <div className="flex-1 overflow-y-auto bg-white px-8 py-6 scrollbar-thin">
                  <div className="mx-auto max-w-3xl pb-4">
                    <MarkdownRenderer content={reportContent} />

                    {/* 追问区域 */}
                    {chatHistory.length > 0 && (
                      <div className="mt-8 border-t pt-6">
                        <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-gray-700">
                          <MessageCircle className="h-4 w-4" />
                          追问对话
                        </h3>
                        <div className="space-y-4">
                          {chatHistory.map((msg, i) => (
                            <div
                              key={i}
                              className={cn(
                                "rounded-lg p-3",
                                msg.role === "user"
                                  ? "ml-8 bg-brand-gold/10 text-gray-800"
                                  : "mr-8 bg-gray-50 text-gray-700"
                              )}
                            >
                              <div className="mb-1 text-xs font-medium text-gray-500">
                                {msg.role === "user" ? "您的问题" : "AI 回复"}
                              </div>
                              {msg.role === "assistant" ? (
                                <MarkdownRenderer content={msg.content || "正在思考..."} />
                              ) : (
                                <p className="text-sm">{msg.content}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 追问输入框 */}
                <div className="shrink-0 border-t bg-white px-6 py-3">
                  <div className="mx-auto flex max-w-3xl items-center gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendChatMessage()}
                      placeholder="对报告内容有疑问？输入问题继续追问..."
                      className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold"
                      disabled={chatLoading}
                    />
                    <button
                      onClick={sendChatMessage}
                      disabled={!chatInput.trim() || chatLoading}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                        chatInput.trim() && !chatLoading
                          ? "bg-brand-gold text-white hover:bg-brand-gold/90"
                          : "bg-gray-100 text-gray-400 cursor-not-allowed"
                      )}
                    >
                      {chatLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      发送
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </Modal>

      {loading && !data ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
        </div>
      ) : data ? (
        <>
          {/* 查询范围提示 */}
          {data.dateRange && (
            <div className="rounded-lg bg-gray-50 px-4 py-2 text-xs text-gray-500">
              查询范围: {new Date(data.dateRange.start).toLocaleDateString()} ~ {new Date(data.dateRange.end).toLocaleDateString()}
            </div>
          )}

          {/* 核心指标卡片 */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={<Users className="h-5 w-5" />}
              label="总会话数"
              value={data.overview.totalSessions}
              color="blue"
              change={data.comparison?.totalSessionsChange}
            />
            <StatCard
              icon={<CheckCircle className="h-5 w-5" />}
              label="完成率"
              value={formatPercent(data.overview.conversionRate)}
              subValue={`${data.overview.completedSessions} 完成`}
              color="green"
              change={data.comparison?.conversionRateChange}
            />
            <StatCard
              icon={<Camera className="h-5 w-5" />}
              label="面部扫描率"
              value={formatPercent(data.overview.faceScanRate)}
              subValue={`${data.overview.faceScanUsed} 扫描 · ${data.overview.faceScanSkipped} 跳过`}
              color="purple"
              change={data.comparison?.faceScanRateChange}
            />
            <StatCard
              icon={<Sparkles className="h-5 w-5" />}
              label="AI 分析率"
              value={formatPercent(data.overview.aiUsageRate)}
              subValue={`${data.overview.aiAnalysisCount} AI · ${data.overview.fallbackAnalysisCount} 规则`}
              color="amber"
              change={data.comparison?.aiUsageRateChange}
            />
          </div>

          {/* 智能洞察 */}
          <InsightCard data={data} formatPercent={formatPercent} />

          {/* 转化漏斗 & 设备分布 & 每日趋势 */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* 转化漏斗 */}
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-base font-semibold text-gray-900">转化漏斗</h3>
              <FunnelChart data={data} />
              <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
                <span className="text-xs text-gray-400">整体转化率 = 查看结果 / 开始会话</span>
                <span className="text-sm font-semibold text-green-600">{formatPercent(data.overview.conversionRate)}</span>
              </div>
            </div>

            {/* 右侧：设备分布 + 每日趋势 */}
            <div className="flex flex-col gap-4">
              {/* 设备分布 */}
              <div className="rounded-xl bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-base font-semibold text-gray-900">设备分布</h3>
                <DeviceDistribution data={data.deviceDistribution} total={data.overview.totalSessions} />
              </div>

              {/* 每日趋势 */}
              <div className="flex-1 rounded-xl bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-gray-900">每日趋势</h3>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> 会话
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> 完成
                    </span>
                  </div>
                </div>
                <DailyTrendChart data={data.daily} />
              </div>
            </div>
          </div>

          {/* 时段分布和地域分布 */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* 时段分布 - 支持柱状图/热力图切换 */}
            {data.hourlyDistribution && (
              <TimeDistributionCard
                hourlyData={data.hourlyDistribution}
                heatmapData={data.weeklyHeatmap}
              />
            )}

            {/* 省份地域分布 - 中国地图 */}
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-brand-gold" />
                  <h3 className="text-base font-semibold text-gray-900">地域分布</h3>
                </div>
                <span className="text-xs text-gray-400">
                  {data.provinceDistribution && data.provinceDistribution.length > 0
                    ? `覆盖 ${data.provinceDistribution.length} 个省份`
                    : "暂无地域数据"}
                </span>
              </div>
              <ChinaMap data={data.provinceDistribution || []} height={350} />
              {/* 省份排行榜 */}
              {data.provinceDistribution && data.provinceDistribution.length > 0 && (
                <div className="mt-4 border-t pt-4">
                  <div className="text-xs text-gray-500 mb-2">TOP 省份</div>
                  <div className="flex flex-wrap gap-2">
                    {data.provinceDistribution.slice(0, 8).map((item, i) => (
                      <span
                        key={item.province}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs",
                          i === 0 ? "bg-brand-gold/10 text-brand-gold font-medium" : "bg-gray-100 text-gray-600"
                        )}
                      >
                        {i < 3 && <span className="font-bold">{i + 1}</span>}
                        {item.province}
                        <span className="text-gray-400">({item.count})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 问卷答案分布 */}
          {Object.keys(data.answerDistribution).length > 0 && (
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-base font-semibold text-gray-900">问卷答案分布</h3>
              <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
                {Object.entries(data.answerDistribution)
                  .filter(([, dist]) => Object.keys(dist).length > 0)
                  .map(([field, distribution]) => (
                    <AnswerDistribution key={field} field={field} distribution={distribution} />
                  ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex h-64 flex-col items-center justify-center rounded-2xl bg-white text-gray-400">
          <AlertCircle className="mb-2 h-10 w-10" />
          <p>暂无数据</p>
        </div>
      )}
    </div>
  );
}

// 统计卡片组件 - 支持同期对比
function StatCard({ icon, label, value, subValue, color, highlight, change }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subValue?: string;
  color: "blue" | "green" | "purple" | "amber";
  highlight?: boolean;
  change?: number | null; // 同期变化百分比
}) {
  const colorClasses = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
    amber: "bg-amber-50 text-amber-600",
  };

  // 格式化涨跌幅显示
  const formatChange = (val: number | null | undefined) => {
    if (val === null || val === undefined) return null;
    const sign = val >= 0 ? "+" : "";
    return `${sign}${val.toFixed(1)}%`;
  };

  const changeText = formatChange(change);
  const isPositive = change !== null && change !== undefined && change >= 0;

  return (
    <div className={cn(
      "rounded-xl bg-white p-5 shadow-sm",
      highlight && "ring-2 ring-purple-300"
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn("rounded-lg p-2", colorClasses[color])}>
            {icon}
          </div>
          <span className="text-sm text-gray-500">{label}</span>
        </div>
        {changeText && (
          <span className={cn(
            "flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium",
            isPositive ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
          )}>
            {isPositive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingUp className="h-3 w-3 rotate-180" />
            )}
            {changeText}
          </span>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {subValue && <p className="mt-1 text-xs text-gray-400">{subValue}</p>}
      </div>
    </div>
  );
}

// 智能洞察卡片
function InsightCard({ data, formatPercent }: { data: AnalyticsData; formatPercent: (v: number) => string }) {
  const insights: { type: "success" | "warning" | "info"; title: string; desc: string }[] = [];

  // 根据数据生成洞察
  if (data.overview.conversionRate > 0.7) {
    insights.push({ type: "success", title: "转化率优秀", desc: `当前转化率 ${formatPercent(data.overview.conversionRate)}，高于行业平均水平` });
  } else if (data.overview.conversionRate < 0.3) {
    insights.push({ type: "warning", title: "转化率待优化", desc: `当前转化率 ${formatPercent(data.overview.conversionRate)}，建议优化问卷流程` });
  }

  if (data.overview.faceScanRate < 0.5) {
    insights.push({
      type: "info",
      title: "缓存策略建议",
      desc: `${formatPercent(1 - data.overview.faceScanRate)} 用户跳过面部扫描，可考虑实现结果缓存以节省 AI 成本`,
    });
  }

  if (data.overview.aiUsageRate < 0.8 && data.overview.aiAnalysisCount + data.overview.fallbackAnalysisCount > 0) {
    insights.push({
      type: "warning",
      title: "AI 服务降级较多",
      desc: `${formatPercent(1 - data.overview.aiUsageRate)} 的分析使用了规则降级，请检查 AI 服务状态`,
    });
  }

  if (insights.length === 0) {
    insights.push({ type: "success", title: "运行良好", desc: "各项指标正常，继续保持" });
  }

  const typeStyles = {
    success: "border-green-200 bg-green-50",
    warning: "border-amber-200 bg-amber-50",
    info: "border-blue-200 bg-blue-50",
  };
  const iconStyles = {
    success: "bg-green-100 text-green-600",
    warning: "bg-amber-100 text-amber-600",
    info: "bg-blue-100 text-blue-600",
  };
  const textStyles = {
    success: "text-green-900",
    warning: "text-amber-900",
    info: "text-blue-900",
  };
  const descStyles = {
    success: "text-green-700",
    warning: "text-amber-700",
    info: "text-blue-700",
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {insights.map((insight, i) => (
        <div key={i} className={cn("rounded-xl border p-4", typeStyles[insight.type])}>
          <div className="flex items-start gap-3">
            <div className={cn("rounded-lg p-2", iconStyles[insight.type])}>
              <TrendingUp className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <h3 className={cn("font-medium", textStyles[insight.type])}>{insight.title}</h3>
              <p className={cn("mt-1 text-sm", descStyles[insight.type])}>{insight.desc}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// 转化漏斗图
function FunnelChart({ data }: { data: AnalyticsData }) {
  const steps = [
    { label: "开始会话", value: data.funnel.started, color: "bg-blue-500", lightBg: "bg-blue-50", textColor: "text-blue-600" },
    { label: "完成问卷", value: data.funnel.completedQuestionnaire, color: "bg-indigo-500", lightBg: "bg-indigo-50", textColor: "text-indigo-600" },
    { label: "完成分析", value: data.funnel.completedAnalysis, color: "bg-purple-500", lightBg: "bg-purple-50", textColor: "text-purple-600" },
    { label: "查看结果", value: data.funnel.viewedResult, color: "bg-emerald-500", lightBg: "bg-emerald-50", textColor: "text-emerald-600" },
    { label: "分享结果", value: data.funnel.shared, color: "bg-amber-500", lightBg: "bg-amber-50", textColor: "text-amber-600" },
  ];

  const maxValue = Math.max(...steps.map(s => s.value), 1);

  return (
    <div className="space-y-4">
      {steps.map((step, index) => {
        const percent = data.funnel.started > 0 ? (step.value / data.funnel.started) * 100 : 0;
        const width = Math.max((step.value / maxValue) * 100, 2);

        return (
          <div key={step.label}>
            {/* 主行 */}
            <div className="flex items-center gap-3">
              {/* 序号 */}
              <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white", step.color)}>
                {index + 1}
              </div>
              {/* 标签 */}
              <div className="w-20 shrink-0 text-sm text-gray-600">{step.label}</div>
              {/* 进度条 */}
              <div className="relative h-6 flex-1 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={cn("h-full rounded-full transition-all duration-500", step.color)}
                  style={{ width: `${width}%` }}
                />
              </div>
              {/* 数值 */}
              <div className="flex w-24 shrink-0 items-center justify-end gap-2 text-sm">
                <span className="font-semibold text-gray-900">{step.value}</span>
                <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", step.lightBg, step.textColor)}>
                  {percent.toFixed(0)}%
                </span>
              </div>
            </div>
            {/* 分支：面部扫描 */}
            {step.label === "完成问卷" && (
              <div className="ml-9 mt-1.5 flex gap-4 text-xs">
                <div className="flex items-center gap-1.5 text-purple-600">
                  <Camera className="h-3.5 w-3.5" />
                  <span>扫描 {data.funnel.completedFaceScan}</span>
                </div>
                <div className="flex items-center gap-1.5 text-gray-400">
                  <SkipForward className="h-3.5 w-3.5" />
                  <span>跳过 {data.funnel.skippedFaceScan}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// 设备分布组件 - 横向紧凑布局
function DeviceDistribution({ data, total }: { data: AnalyticsData["deviceDistribution"]; total: number }) {
  const devices = [
    { key: "mobile", label: "移动端", icon: Smartphone, value: data.mobile, color: "bg-blue-500", lightColor: "bg-blue-50", textColor: "text-blue-600" },
    { key: "desktop", label: "桌面端", icon: Monitor, value: data.desktop, color: "bg-green-500", lightColor: "bg-green-50", textColor: "text-green-600" },
    { key: "tablet", label: "平板", icon: Tablet, value: data.tablet, color: "bg-purple-500", lightColor: "bg-purple-50", textColor: "text-purple-600" },
  ];

  const safeTotal = Math.max(total, 1);

  return (
    <div className="flex items-center gap-6">
      {/* 堆叠条形图 */}
      <div className="flex-1">
        <div className="mb-3 flex h-3 overflow-hidden rounded-full bg-gray-100">
          {devices.map((device) => {
            const percent = (device.value / safeTotal) * 100;
            return (
              <div
                key={device.key}
                className={cn("transition-all", device.color)}
                style={{ width: `${percent}%` }}
              />
            );
          })}
        </div>
        {/* 图例 */}
        <div className="flex flex-wrap gap-4">
          {devices.map((device) => {
            const Icon = device.icon;
            const percent = total > 0 ? (device.value / total) * 100 : 0;
            return (
              <div key={device.key} className="flex items-center gap-2">
                <div className={cn("rounded p-1.5", device.lightColor, device.textColor)}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="text-sm">
                  <span className="text-gray-600">{device.label}</span>
                  <span className="ml-1.5 font-medium text-gray-900">{device.value}</span>
                  <span className="ml-1 text-gray-400">({percent.toFixed(0)}%)</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* 总数 */}
      <div className="text-center">
        <div className="text-2xl font-bold text-gray-900">{total}</div>
        <div className="text-xs text-gray-500">总会话</div>
      </div>
    </div>
  );
}

// 每日趋势图 - 紧凑版
function DailyTrendChart({ data }: { data: AnalyticsData["daily"] }) {
  const displayData = data.slice(-7);
  const maxValue = Math.max(...displayData.map(d => Math.max(d.sessions, d.completed)), 1);

  return (
    <div className="flex items-end gap-1">
      {displayData.map((day) => {
        const sessionHeight = (day.sessions / maxValue) * 100;
        const completedHeight = (day.completed / maxValue) * 100;

        return (
          <div key={day.date} className="group flex flex-1 flex-col items-center">
            {/* 柱状图 */}
            <div className="relative flex h-24 w-full items-end justify-center gap-0.5">
              <div
                className="w-3 rounded-t bg-blue-500 transition-all group-hover:bg-blue-600"
                style={{ height: `${Math.max(sessionHeight, 4)}%` }}
                title={`会话: ${day.sessions}`}
              />
              <div
                className="w-3 rounded-t bg-green-500 transition-all group-hover:bg-green-600"
                style={{ height: `${Math.max(completedHeight, 4)}%` }}
                title={`完成: ${day.completed}`}
              />
            </div>
            {/* 日期 */}
            <span className="mt-1.5 text-[10px] text-gray-400">
              {day.date.slice(5)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// 答案分布组件
function AnswerDistribution({ field, distribution }: { field: string; distribution: Record<string, number> }) {
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  const entries = Object.entries(distribution).sort((a, b) => b[1] - a[1]).slice(0, 6);

  // 字段标签
  const fieldLabels: Record<string, string> = {
    skinType: "肤质类型",
    primaryConcern: "主要困扰",
    ageRange: "年龄段",
    currentRoutine: "护肤习惯",
    allergies: "成分敏感",
    budget: "预算范围",
    pregnancyStatus: "特殊时期",
    medicationHistory: "用药经历",
  };

  // 选项值到中文标签的映射
  const valueLabels: Record<string, Record<string, string>> = {
    skinType: {
      dry: "干性", oily: "油性", combination: "混合性",
      sensitive: "敏感性", normal: "中性", unknown: "不确定",
    },
    primaryConcern: {
      aging: "抗老", dull: "提亮", hydration: "保湿",
      pores: "毛孔", sensitive: "修护", acne: "净痘",
    },
    ageRange: {
      "18-24": "18-24岁", "25-30": "25-30岁", "31-40": "31-40岁",
      "41-50": "41-50岁", "50+": "50+岁",
    },
    currentRoutine: {
      minimal: "极简", basic: "基础", complete: "完整",
      advanced: "进阶", none: "起步",
    },
    allergies: {
      none: "无敏感", fragrance: "香精", alcohol: "酒精",
      acid: "酸类", multiple: "多重", unknown: "不清楚",
    },
    budget: {
      budget: "精明", mid: "品质", premium: "臻享",
      luxury: "奢享", unknown: "不确定",
    },
    pregnancyStatus: {
      yes: "是", no: "否", private: "不透露",
    },
    medicationHistory: {
      routine: "日常", occasional: "偶有", ongoing: "持续", complex: "复杂",
    },
  };

  const getValueLabel = (fieldName: string, value: string): string => {
    // 处理多选值（逗号分隔）
    if (value.includes(",")) {
      const parts = value.split(",");
      return parts.map((p) => valueLabels[fieldName]?.[p.trim()] || p.trim()).join("+");
    }
    return valueLabels[fieldName]?.[value] || value;
  };

  const label = fieldLabels[field] || field;

  if (entries.length === 0) return null;

  return (
    <div>
      {/* 标题行 */}
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-800">{label}</span>
        <span className="text-xs text-gray-400">{total} 人</span>
      </div>
      {/* 分布条 */}
      <div className="space-y-2">
        {entries.map(([value, count]) => {
          const percent = total > 0 ? (count / total) * 100 : 0;
          return (
            <div key={value} className="flex items-center gap-2.5 text-xs">
              <span className="w-14 shrink-0 truncate text-gray-600" title={getValueLabel(field, value)}>
                {getValueLabel(field, value)}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-blue-400 transition-all duration-300"
                  style={{ width: `${Math.max(percent, 2)}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right tabular-nums text-gray-500">
                {percent.toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 时段分布组件 - 24小时柱状图（极简版）
function HourlyDistribution({ data }: { data: Record<string, number> }) {
  const hours = Object.entries(data).sort(([a], [b]) => a.localeCompare(b));
  const maxValue = Math.max(...Object.values(data), 1);
  const total = Object.values(data).reduce((sum, v) => sum + v, 0);

  // 找出峰值时段
  const peakHour = hours.reduce((prev, curr) => curr[1] > prev[1] ? curr : prev, hours[0]);

  return (
    <div className="space-y-2">
      {/* 24小时柱状图 */}
      <div className="flex items-end gap-[3px] h-40 px-1">
        {hours.map(([hour, count]) => {
          const height = maxValue > 0 ? (count / maxValue) * 100 : 0;
          const isPeak = hour === peakHour[0] && count > 0;
          return (
            <div
              key={hour}
              className="group relative flex-1 flex flex-col justify-end h-full"
            >
              <div
                className={cn(
                  "w-full rounded-sm transition-all cursor-pointer",
                  isPeak
                    ? "bg-brand-gold"
                    : count > 0
                      ? "bg-blue-400 hover:bg-blue-500"
                      : "bg-gray-200"
                )}
                style={{ height: count > 0 ? `${Math.max(height, 6)}%` : "3px" }}
              />
              {/* 悬浮提示 */}
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
                <div className="rounded bg-gray-800 px-2 py-1 text-xs text-white whitespace-nowrap shadow-lg">
                  {hour}:00 · {count}次
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 时间刻度 */}
      <div className="flex justify-between text-[10px] text-gray-400 px-1">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>24:00</span>
      </div>

      {/* 底部统计 */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <div className="text-xs text-gray-500">
          共 <span className="font-semibold text-gray-700">{total}</span> 次访问
        </div>
        {peakHour && peakHour[1] > 0 && (
          <div className="text-xs text-gray-500">
            🔥 峰值 <span className="font-medium text-brand-gold">{peakHour[0]}:00</span>
            <span className="text-gray-400 ml-0.5">({peakHour[1]}次)</span>
          </div>
        )}
      </div>
    </div>
  );
}

// 周热力图组件 - 7天×24小时热力矩阵
function WeeklyHeatmap({ data }: { data: Record<string, Record<string, number>> }) {
  // 星期名称（周一开始）
  const dayNames = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  // 将数据按周一到周日重新排序（原数据0=周日）
  const reorderedDays = [1, 2, 3, 4, 5, 6, 0]; // 周一到周日

  // 计算最大值用于颜色映射
  const allValues = Object.values(data).flatMap((hours) => Object.values(hours));
  const maxValue = Math.max(...allValues, 1);
  const total = allValues.reduce((sum, v) => sum + v, 0);

  // 找出峰值单元格
  let peakDay = 0;
  let peakHour = "00";
  let peakValue = 0;
  reorderedDays.forEach((dayIndex, i) => {
    Object.entries(data[String(dayIndex)] || {}).forEach(([hour, count]) => {
      if (count > peakValue) {
        peakValue = count;
        peakDay = i;
        peakHour = hour;
      }
    });
  });

  // 获取热力颜色
  const getHeatColor = (value: number) => {
    if (value === 0) return "bg-gray-100";
    const intensity = value / maxValue;
    if (intensity < 0.2) return "bg-blue-100";
    if (intensity < 0.4) return "bg-blue-200";
    if (intensity < 0.6) return "bg-blue-300";
    if (intensity < 0.8) return "bg-blue-400";
    return "bg-blue-500";
  };

  // 获取文字颜色
  const getTextColor = (value: number) => {
    if (value === 0) return "text-gray-300";
    const intensity = value / maxValue;
    return intensity >= 0.6 ? "text-white" : "text-gray-700";
  };

  // 时间段标签（每4小时一个）
  const hourLabels = ["00", "04", "08", "12", "16", "20"];

  // 悬浮提示状态
  const [hoveredCell, setHoveredCell] = useState<{ day: number; hour: string; value: number; x: number; y: number } | null>(null);

  return (
    <div className="space-y-2 relative">
      {/* 热力图矩阵 */}
      <div className="overflow-x-auto">
        {/* 全局悬浮提示 - 使用 fixed 定位不影响布局 */}
        {hoveredCell && (
          <div
            className="fixed z-50 pointer-events-none"
            style={{ left: hoveredCell.x, top: hoveredCell.y - 35 }}
          >
            <div className="rounded bg-gray-800 px-2 py-1 text-xs text-white whitespace-nowrap shadow-lg -translate-x-1/2">
              {dayNames[hoveredCell.day]} {hoveredCell.hour}:00 · {hoveredCell.value}次
            </div>
          </div>
        )}
        <div className="min-w-[500px]">
          {/* 小时标签行 */}
          <div className="flex mb-1">
            <div className="w-10 shrink-0" /> {/* 空白占位 */}
            <div className="flex-1 flex">
              {hourLabels.map((hour) => (
                <div
                  key={hour}
                  className="text-[10px] text-gray-400 text-center"
                  style={{ width: `${100 / 6}%` }}
                >
                  {hour}:00
                </div>
              ))}
            </div>
          </div>

          {/* 热力图行 */}
          {reorderedDays.map((dayIndex, rowIndex) => {
            const dayData = data[String(dayIndex)] || {};
            const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
            const dayTotal = hours.reduce((sum, h) => sum + (dayData[h] || 0), 0);

            return (
              <div key={dayIndex} className="flex items-center mb-[2px]">
                {/* 星期标签 */}
                <div className="w-10 shrink-0 text-[11px] text-gray-500 pr-2 text-right">
                  {dayNames[rowIndex]}
                </div>
                {/* 24小时格子 */}
                <div className="flex-1 flex gap-[1px]">
                  {hours.map((hour) => {
                    const value = dayData[hour] || 0;
                    const isPeak = rowIndex === peakDay && hour === peakHour && value > 0;
                    return (
                      <div
                        key={hour}
                        className={cn(
                          "flex-1 h-6 rounded-[2px] flex items-center justify-center cursor-pointer transition-all hover:ring-1 hover:ring-brand-gold/50",
                          getHeatColor(value),
                          isPeak && "ring-2 ring-brand-gold"
                        )}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHoveredCell({
                            day: rowIndex,
                            hour,
                            value,
                            x: rect.left + rect.width / 2,
                            y: rect.top,
                          });
                        }}
                        onMouseLeave={() => setHoveredCell(null)}
                      >
                        {/* 大于0时显示数字（hover时显示） */}
                        <span
                          className={cn(
                            "text-[9px] font-medium transition-opacity",
                            hoveredCell?.day === rowIndex && hoveredCell?.hour === hour
                              ? "opacity-100"
                              : "opacity-0",
                            getTextColor(value)
                          )}
                        >
                          {value > 0 ? value : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {/* 该天总数 */}
                <div className="w-10 shrink-0 text-[10px] text-gray-400 pl-2 text-left">
                  {dayTotal}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 图例和统计 */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        {/* 颜色图例 */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-400 mr-1">少</span>
          <div className="w-4 h-3 rounded-[2px] bg-gray-100" />
          <div className="w-4 h-3 rounded-[2px] bg-blue-100" />
          <div className="w-4 h-3 rounded-[2px] bg-blue-200" />
          <div className="w-4 h-3 rounded-[2px] bg-blue-300" />
          <div className="w-4 h-3 rounded-[2px] bg-blue-400" />
          <div className="w-4 h-3 rounded-[2px] bg-blue-500" />
          <span className="text-[10px] text-gray-400 ml-1">多</span>
        </div>

        {/* 峰值提示 */}
        {peakValue > 0 && (
          <div className="text-xs text-gray-500">
            🔥 固定高峰：
            <span className="font-medium text-brand-gold">
              {dayNames[peakDay]} {peakHour}:00
            </span>
            <span className="ml-1 text-gray-400">({peakValue}次)</span>
          </div>
        )}
      </div>

      {/* 总计 */}
      <div className="text-center text-xs text-gray-400">
        共 <span className="font-medium text-gray-600">{total}</span> 次访问
      </div>
    </div>
  );
}

// 时段分布卡片 - 支持柱状图和热力图切换
function TimeDistributionCard({
  hourlyData,
  heatmapData,
}: {
  hourlyData: Record<string, number>;
  heatmapData?: Record<string, Record<string, number>>;
}) {
  const [viewMode, setViewMode] = useState<"bar" | "heatmap">("bar");

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm flex flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-brand-gold" />
          <h3 className="text-base font-semibold text-gray-900">使用时段分布</h3>
        </div>
        {/* 视图切换按钮 */}
        {heatmapData && (
          <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
            <button
              onClick={() => setViewMode("bar")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all",
                viewMode === "bar"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
              title="24小时柱状图"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">柱状图</span>
            </button>
            <button
              onClick={() => setViewMode("heatmap")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all",
                viewMode === "heatmap"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
              title="7天×24小时热力图"
            >
              <Grid3X3 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">热力图</span>
            </button>
          </div>
        )}
      </div>

      {/* 视图内容 - 垂直居中 */}
      <div className="flex-1 flex items-center">
        <div className="w-full">
          {viewMode === "bar" ? (
            <HourlyDistribution data={hourlyData} />
          ) : heatmapData ? (
            <WeeklyHeatmap data={heatmapData} />
          ) : (
            <HourlyDistribution data={hourlyData} />
          )}
        </div>
      </div>
    </div>
  );
}

// Markdown 渲染器 - 简洁风格
function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: { text: string; ordered: boolean; num?: number }[] = [];
  let tableRows: string[][] = [];
  let tableHeaders: string[] = [];
  let inTable = false;
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  // 内联样式
  const renderInline = (text: string): React.ReactNode => {
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i} className="font-medium text-gray-800">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
        return <em key={i}>{part.slice(1, -1)}</em>;
      }
      return part;
    });
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    const isOrdered = listItems[0].ordered;
    const ListTag = isOrdered ? "ol" : "ul";
    elements.push(
      <ListTag key={`list-${elements.length}`} className={cn("my-3 space-y-1.5", isOrdered ? "list-decimal pl-5" : "list-disc pl-5")}>
        {listItems.map((item, i) => (
          <li key={i} className="text-sm text-gray-600 pl-1">{renderInline(item.text)}</li>
        ))}
      </ListTag>
    );
    listItems = [];
  };

  const flushCodeBlock = () => {
    if (codeBlockLines.length > 0) {
      elements.push(
        <pre key={`code-${elements.length}`} className="my-4 overflow-x-auto rounded bg-gray-100 p-3 text-xs">
          <code className="text-gray-700">{codeBlockLines.join("\n")}</code>
        </pre>
      );
      codeBlockLines = [];
    }
    inCodeBlock = false;
  };

  // 渲染单元格，支持百分比进度条
  const renderCell = (cell: string, isHeader: boolean = false): React.ReactNode => {
    // 检测百分比格式，如 "45.5%" 或 "**45.5%**"
    const percentMatch = cell.match(/^\*?\*?(\d+\.?\d*)%\*?\*?$/);
    if (percentMatch && !isHeader) {
      const value = parseFloat(percentMatch[1]);
      return (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-gray-400"
              style={{ width: `${Math.min(value, 100)}%` }}
            />
          </div>
          <span className="text-xs tabular-nums text-gray-600">{value}%</span>
        </div>
      );
    }
    return renderInline(cell);
  };

  const flushTable = () => {
    if (tableHeaders.length === 0 && tableRows.length === 0) return;
    elements.push(
      <div key={`table-${elements.length}`} className="my-4 overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full text-sm">
          {tableHeaders.length > 0 && (
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {tableHeaders.map((h, i) => (
                  <th key={i} className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                    {renderCell(h, true)}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {tableRows.map((row, ri) => (
              <tr key={ri} className="border-b border-gray-50 last:border-0">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-2 text-gray-600">
                    {renderCell(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableHeaders = [];
    tableRows = [];
    inTable = false;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // 代码块开始/结束 ```
    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        flushCodeBlock();
      } else {
        flushList();
        flushTable();
        inCodeBlock = true;
      }
      return;
    }

    // 在代码块中
    if (inCodeBlock) {
      codeBlockLines.push(line);
      return;
    }

    // 空行
    if (!trimmed) {
      flushList();
      flushTable();
      return;
    }

    // 分隔线 ---
    if (/^-{3,}$/.test(trimmed) && !inTable) {
      flushList();
      elements.push(<hr key={index} className="my-6 border-gray-200" />);
      return;
    }

    // 表格分隔符行 |---|---|
    if (/^\|[-:\s|]+\|$/.test(trimmed)) {
      inTable = true;
      return; // 跳过分隔符行
    }

    // 表格行 | col1 | col2 |
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = trimmed.slice(1, -1).split("|").map(c => c.trim());
      if (!inTable && tableHeaders.length === 0) {
        tableHeaders = cells;
        inTable = true;
      } else {
        tableRows.push(cells);
      }
      return;
    }

    // 如果之前在表格中，但当前行不是表格，先flush
    if (inTable) {
      flushTable();
    }

    // 标题 # (h1)
    if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) {
      flushList();
      elements.push(
        <h1 key={index} className="mb-4 pb-3 border-b text-lg font-semibold text-gray-800">
          {renderInline(trimmed.slice(2))}
        </h1>
      );
      return;
    }

    // 标题 ## (h2) - 添加 id 用于导航跳转
    if (trimmed.startsWith("## ") && !trimmed.startsWith("### ")) {
      flushList();
      elements.push(
        <h2 key={index} id={`section-${index}`} className="mt-8 mb-3 text-sm font-semibold text-gray-800 scroll-mt-4">
          {renderInline(trimmed.slice(3))}
        </h2>
      );
      return;
    }

    // 标题 ### (h3)
    if (trimmed.startsWith("### ") && !trimmed.startsWith("#### ")) {
      flushList();
      elements.push(
        <h3 key={index} className="mt-4 mb-2 text-sm font-medium text-gray-700">
          {renderInline(trimmed.slice(4))}
        </h3>
      );
      return;
    }

    // 标题 #### (h4)
    if (trimmed.startsWith("#### ")) {
      flushList();
      elements.push(
        <h4 key={index} className="mt-3 mb-1 text-sm text-gray-600">
          {renderInline(trimmed.slice(5))}
        </h4>
      );
      return;
    }

    // 引用 >
    if (trimmed.startsWith("> ")) {
      flushList();
      elements.push(
        <blockquote key={index} className="my-3 border-l-2 border-gray-200 pl-3 text-sm text-gray-500 italic">
          {renderInline(trimmed.slice(2))}
        </blockquote>
      );
      return;
    }

    // 列表项 - 或 *
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      listItems.push({ text: trimmed.slice(2), ordered: false });
      return;
    }

    // 数字列表 1. 2. 等
    if (/^\d+\.\s/.test(trimmed)) {
      listItems.push({ text: trimmed.replace(/^\d+\.\s/, ""), ordered: true });
      return;
    }

    // 普通段落
    flushList();
    elements.push(
      <p key={index} className="my-2 text-sm text-gray-600 leading-relaxed">
        {renderInline(trimmed)}
      </p>
    );
  });

  // 处理最后的内容
  flushList();
  flushTable();
  flushCodeBlock();

  return <div>{elements}</div>;
}
