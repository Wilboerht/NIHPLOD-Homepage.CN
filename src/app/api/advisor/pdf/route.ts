import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  generateSkincareRoutines,
  getClimateByRegion,
  adjustClimateForSeason,
  SCENARIO_LABELS,
  LEVEL_LABELS,
  type RoutineLevel,
  type RoutineScenario,
} from "@/lib/skincare-dosage";

// ===== 资源缓存 - 避免每次请求都读取文件 =====
let cachedFontBase64: string | null = null;
let cachedLogoBase64: string | null = null;
let cachedQrcodeBase64: string | null = null;
let jsPDFModule: typeof import("jspdf") | null = null;

/** 预加载并缓存资源 */
async function loadResources() {
  // 加载 jsPDF 模块
  if (!jsPDFModule) {
    jsPDFModule = await import("jspdf");
  }

  // 加载字体
  if (!cachedFontBase64) {
    const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansSC-Regular.ttf");
    if (fs.existsSync(fontPath)) {
      const fontBuffer = fs.readFileSync(fontPath);
      cachedFontBase64 = fontBuffer.toString("base64");
    } else {
      throw new Error(`Font file not found: ${fontPath}`);
    }
  }

  // 加载 logo
  if (!cachedLogoBase64) {
    const logoPath = path.join(process.cwd(), "public", "images", "logo.png");
    if (fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath);
      cachedLogoBase64 = logoBuffer.toString("base64");
    }
  }

  // 加载二维码
  if (!cachedQrcodeBase64) {
    const qrcodePath = path.join(process.cwd(), "public", "images", "qrcode.png");
    if (fs.existsSync(qrcodePath)) {
      const qrcodeBuffer = fs.readFileSync(qrcodePath);
      cachedQrcodeBase64 = qrcodeBuffer.toString("base64");
    }
  }

  return {
    jsPDF: jsPDFModule.jsPDF,
    fontBase64: cachedFontBase64,
    logoBase64: cachedLogoBase64 || "",
    qrcodeBase64: cachedQrcodeBase64 || "",
  };
}

// 在模块加载时预热资源（后台加载）
loadResources().catch(console.error);

async function createPdf(data: ReportData): Promise<Buffer> {
  // 使用缓存的资源
  const { jsPDF, fontBase64, logoBase64, qrcodeBase64 } = await loadResources();

  // 创建 PDF (A4 尺寸)
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // 注册中文字体
  doc.addFileToVFS("NotoSansSC.ttf", fontBase64);
  doc.addFont("NotoSansSC.ttf", "NotoSansSC", "normal");
  doc.setFont("NotoSansSC", "normal");

  // ===== 页面设置 =====
  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 25;
  const marginTop = 20;
  const contentWidth = pageWidth - marginX * 2;
  let y = marginTop;

  // 颜色定义
  const gold = "#C8AA6E";
  const dark = "#333333";
  const gray = "#666666";
  const lightGray = "#999999";

  // 辅助函数
  const rgb = (hex: string): [number, number, number] => {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return r ? [parseInt(r[1], 16), parseInt(r[2], 16), parseInt(r[3], 16)] : [0, 0, 0];
  };

  const newPage = () => {
    doc.addPage();
    y = marginTop;
  };

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 25) newPage();
  };

  const today = new Date().toLocaleDateString("zh-CN");

  // ===== 封面页 =====
  // 背景渐变效果（用矩形模拟）
  doc.setFillColor(250, 248, 245); // cream 色
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  // 顶部装饰线
  doc.setDrawColor(...rgb(gold));
  doc.setLineWidth(1.5);
  doc.line(pageWidth / 2 - 30, 60, pageWidth / 2 + 30, 60);

  // Logo（按原图比例缩放）
  if (logoBase64) {
    try {
      const logoProps = doc.getImageProperties(`data:image/png;base64,${logoBase64}`);
      const maxLogoWidth = 50;
      const logoRatio = logoProps.height / logoProps.width;
      const logoWidth = maxLogoWidth;
      const logoHeight = maxLogoWidth * logoRatio;
      doc.addImage(`data:image/png;base64,${logoBase64}`, "PNG", pageWidth / 2 - logoWidth / 2, 75, logoWidth, logoHeight);
    } catch {
      doc.setFontSize(24);
      doc.setTextColor(...rgb(gold));
      doc.text("NIHPLOD", pageWidth / 2, 85, { align: "center" });
    }
  }

  // 主标题
  doc.setFontSize(32);
  doc.setTextColor(...rgb(dark));
  doc.text("肌肤分析报告", pageWidth / 2, 120, { align: "center" });

  // 英文副标题
  doc.setFontSize(12);
  doc.setTextColor(...rgb(lightGray));
  doc.text("Skin Analysis Report", pageWidth / 2, 132, { align: "center" });

  // 装饰线
  doc.setDrawColor(...rgb(gold));
  doc.setLineWidth(0.5);
  doc.line(pageWidth / 2 - 40, 145, pageWidth / 2 + 40, 145);

  // 肤质类型（大字显示）
  doc.setFontSize(18);
  doc.setTextColor(...rgb(gold));
  doc.text(data.skinTypeLabel, pageWidth / 2, 170, { align: "center" });

  // 综合评分（如果有）
  if (data.overallScore !== undefined) {
    doc.setFontSize(48);
    doc.setTextColor(...rgb(dark));
    doc.text(`${data.overallScore}`, pageWidth / 2, 210, { align: "center" });
    doc.setFontSize(12);
    doc.setTextColor(...rgb(lightGray));
    doc.text("综合评分 / 100", pageWidth / 2, 222, { align: "center" });
  }

  // 底部信息
  doc.setFontSize(10);
  doc.setTextColor(...rgb(gray));
  doc.text("生成日期", pageWidth / 2, pageHeight - 55, { align: "center" });
  doc.setFontSize(12);
  doc.setTextColor(...rgb(dark));
  doc.text(today, pageWidth / 2, pageHeight - 45, { align: "center" });

  // 底部装饰线
  doc.setDrawColor(...rgb(gold));
  doc.setLineWidth(0.5);
  doc.line(pageWidth / 2 - 25, pageHeight - 35, pageWidth / 2 + 25, pageHeight - 35);

  // 品牌口号
  doc.setFontSize(8);
  doc.setTextColor(...rgb(lightGray));
  doc.text("AI 智能护肤顾问 · 专属定制方案", pageWidth / 2, pageHeight - 25, { align: "center" });

  // ===== 内容页 =====
  newPage();

  // 辅助函数：绘制页眉
  const drawHeader = () => {
    const headerY = 15;
    const logoHeight = 7;
    if (logoBase64) {
      try {
        doc.addImage(`data:image/png;base64,${logoBase64}`, "PNG", marginX, headerY - 3, 22, logoHeight);
      } catch {
        doc.setFontSize(10);
        doc.setTextColor(...rgb(dark));
        doc.text("NIHPLOD", marginX, headerY);
      }
    }
    // 日期与logo底部对齐
    const dateY = headerY - 3 + logoHeight;
    doc.setFontSize(8);
    doc.setTextColor(...rgb(lightGray));
    doc.text(today, pageWidth - marginX, dateY, { align: "right" });
    doc.setDrawColor(...rgb(gold));
    doc.setLineWidth(0.4);
    doc.line(marginX, headerY + 5, pageWidth - marginX, headerY + 5);
  };

  // 辅助函数：绘制章节标题（左侧竖线样式）
  const drawSection = (title: string) => {
    ensureSpace(20);
    y += 8; // 章节前留白
    // 左侧金色竖线
    doc.setDrawColor(...rgb(gold));
    doc.setLineWidth(0.6);
    doc.line(marginX, y - 4, marginX, y + 2);
    // 标题文字
    doc.setFontSize(13);
    doc.setTextColor(...rgb(dark));
    doc.text(title, marginX + 5, y);
    y += 8;
  };

  // 辅助函数：绘制列表项
  const drawListItem = (text: string, indent = 0) => {
    doc.setFontSize(9);
    doc.setTextColor(...rgb(gray));
    doc.text("·", marginX + indent, y);
    doc.setTextColor(...rgb(dark));
    const lines = doc.splitTextToSize(text, contentWidth - indent - 5);
    lines.forEach((line: string, i: number) => {
      doc.text(line, marginX + indent + 4, y);
      if (i < lines.length - 1) y += 5;
    });
    y += 6;
  };

  drawHeader();
  y = 30;

  // ===== 一、基本信息 =====
  drawSection("一、基本信息");

  const hp = data.hydration?.percent ?? (data.hydration?.level === "low" ? 35 : data.hydration?.level === "high" ? 85 : 60);

  // 收集所有键值对
  const infoItems: { key: string; value: string }[] = [];
  infoItems.push({ key: "肤质类型", value: data.skinTypeLabel });
  if (data.skinTypeConfidence !== undefined) {
    infoItems.push({ key: "置信度", value: `${Math.round(data.skinTypeConfidence * 100)}%` });
  }
  if (data.overallScore !== undefined) {
    infoItems.push({ key: "综合评分", value: `${data.overallScore} / 100` });
  }
  infoItems.push({ key: "水分状态", value: `${hp}%` });
  if (data.skinAge) {
    infoItems.push({ key: "肌肤年龄", value: `${data.skinAge} 岁` });
  }

  // 两列布局
  doc.setFontSize(9);
  const colWidth = contentWidth / 2;
  infoItems.forEach((item, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = marginX + col * colWidth;
    const yy = y + row * 6;
    doc.setTextColor(...rgb(gray));
    doc.text(item.key, x, yy);
    doc.setTextColor(...rgb(dark));
    doc.text(item.value, x + 25, yy);
  });
  y += Math.ceil(infoItems.length / 2) * 6 + 2;

  if (data.skinTypeDescription) {
    doc.setFontSize(9);
    doc.setTextColor(...rgb(gray));
    const descLines = doc.splitTextToSize(data.skinTypeDescription, contentWidth);
    descLines.forEach((line: string) => {
      doc.text(line, marginX, y);
      y += 5;
    });
  }
  y += 6;

  // ===== 二、肌肤问题 =====
  const hasConditions = data.skinConditions && data.skinConditions.length > 0;
  const hasConcerns = data.concerns && data.concerns.length > 0;

  if (hasConditions || hasConcerns) {
    drawSection("二、肌肤问题");

    // 关注问题（放在前面，一行显示）
    if (hasConcerns) {
      doc.setFontSize(9);
      doc.setTextColor(...rgb(gray));
      doc.text("关注：", marginX, y);
      doc.setTextColor(...rgb(dark));
      const concernText = data.concerns!.join("、");
      const concernLines = doc.splitTextToSize(concernText, contentWidth - 15);
      concernLines.forEach((line: string, i: number) => {
        doc.text(line, marginX + (i === 0 ? 15 : 0), y);
        y += 5;
      });
      y += 4;
    }

    // 检测问题
    if (hasConditions) {
      const severityLabels: Record<string, string> = {
        mild: "轻微",
        moderate: "中等",
        severe: "严重",
      };

      for (const c of data.skinConditions!) {
        ensureSpace(14);
        const sevLabel = c.severity ? `（${severityLabels[c.severity] || c.severity}）` : "";
        doc.setFontSize(9);
        doc.setTextColor(...rgb(dark));
        doc.text(`${c.condition}${sevLabel} · ${c.area}`, marginX, y);
        y += 5;
        doc.setTextColor(...rgb(gray));
        const descLines = doc.splitTextToSize(c.description, contentWidth);
        descLines.forEach((line: string) => {
          doc.text(line, marginX, y);
          y += 5;
        });
        y += 4;
      }
    }
    y += 2;
  }

  // ===== 三、综合分析 =====
  if (data.summary) {
    drawSection("三、综合分析");

    doc.setFontSize(9);
    doc.setTextColor(...rgb(dark));
    const summaryLines = doc.splitTextToSize(data.summary, contentWidth);
    summaryLines.forEach((line: string) => {
      ensureSpace(6);
      doc.text(line, marginX, y);
      y += 5;
    });
    y += 4;

    if (data.details && data.details.length > 0) {
      for (const d of data.details) {
        ensureSpace(10);
        drawListItem(d);
      }
    }
    y += 4;
  }

  // ===== 四、护肤建议 =====
  if (data.recommendations && data.recommendations.length > 0) {
    drawSection("四、护肤建议");

    for (let i = 0; i < data.recommendations.length; i++) {
      ensureSpace(8);
      doc.setFontSize(9);
      doc.setTextColor(...rgb(dark));
      const recLines = doc.splitTextToSize(`${i + 1}. ${data.recommendations[i]}`, contentWidth);
      recLines.forEach((line: string) => {
        doc.text(line, marginX, y);
        y += 5;
      });
      y += 2;
    }
  }

  // ===== 五、专属护肤方案 =====
  if (data.skinType) {
    const climate = adjustClimateForSeason(getClimateByRegion());
    const routines = generateSkincareRoutines(data.skinType, climate);

    const levels: RoutineLevel[] = ["daily", "professional", "ultimate"];
    const scenarios: RoutineScenario[] = ["morning", "evening", "home", "travel"];

    // 新页开始护肤方案
    newPage();
    drawHeader();
    y = 30;

    doc.setFontSize(14);
    doc.setTextColor(...rgb(dark));
    doc.text("专属护肤方案", pageWidth / 2, y, { align: "center" });
    y += 6;
    doc.setFontSize(8);
    doc.setTextColor(...rgb(gray));
    doc.text("根据您的肤质与当前气候定制", pageWidth / 2, y, { align: "center" });
    y += 12;

    // 遍历所有级别
    for (const level of levels) {
      ensureSpace(30);
      y += 8;

      // 级别标题（左侧竖线样式）
      doc.setDrawColor(...rgb(gold));
      doc.setLineWidth(0.6);
      doc.line(marginX, y - 4, marginX, y + 2);
      doc.setFontSize(11);
      doc.setTextColor(...rgb(dark));
      doc.text(`${LEVEL_LABELS[level].name}（${LEVEL_LABELS[level].nameEn}）`, marginX + 5, y);
      doc.setFontSize(9);
      doc.setTextColor(...rgb(gray));
      doc.text(LEVEL_LABELS[level].desc, marginX + 65, y);
      y += 10;

      // 遍历所有场景
      for (const scenario of scenarios) {
        const routine = routines[level][scenario];
        if (!routine || !routine.steps || routine.steps.length === 0) continue;

        ensureSpace(20);

        // 场景标题
        doc.setFontSize(10);
        doc.setTextColor(...rgb(dark));
        doc.text(`${SCENARIO_LABELS[scenario].name}`, marginX, y);
        doc.setFontSize(9);
        doc.setTextColor(...rgb(gray));
        doc.text(`${routine.totalDuration}`, marginX + 25, y);
        y += 6;

        // 步骤列表
        routine.steps.forEach((step, i) => {
          ensureSpace(10);
          // 一行：序号+名称+频率+时长+描述
          let stepHead = `${i + 1}. ${step.name}`;
          if (step.frequency) stepHead += `（${step.frequency}）`;
          stepHead += ` ${step.duration}`;
          let descText = step.description;
          if (step.dosage) descText += `（${step.dosage.description}）`;
          const fullText = `${stepHead} · ${descText}`;

          doc.setFontSize(9);
          const lines = doc.splitTextToSize(fullText, contentWidth);
          lines.forEach((line: string, idx: number) => {
            if (idx === 0) {
              // 第一行：名称部分深色
              doc.setTextColor(...rgb(dark));
              doc.text(line, marginX, y);
            } else {
              // 续行：灰色
              doc.setTextColor(...rgb(gray));
              doc.text(line, marginX, y);
            }
            y += 5;
          });
          y += 1;
        });

        y += 6;
      }
    }
  }

  // ===== 免责声明 =====
  ensureSpace(25);
  doc.setFontSize(9);
  doc.setTextColor(...rgb(dark));
  doc.text("免责声明", marginX, y);
  y += 6;
  doc.setFontSize(8);
  doc.setTextColor(...rgb(gray));
  const disclaimer = "本分析报告由 AI 技术生成，仅供护肤品选购参考，不构成医学诊断或治疗建议。面部照片分析结果受拍摄光线、角度等因素影响，准确度有限。如有皮肤健康问题，请咨询专业皮肤科医生。";
  const discLines = doc.splitTextToSize(disclaimer, contentWidth);
  discLines.forEach((line: string) => {
    doc.text(line, marginX, y);
    y += 4;
  });

  // ===== 尾页 =====
  doc.addPage();

  // 简洁尾页
  let endY = 100;

  // Logo（按原图比例缩放）
  if (logoBase64) {
    try {
      const logoProps = doc.getImageProperties(`data:image/png;base64,${logoBase64}`);
      const maxLogoWidth = 50;
      const logoRatio = logoProps.height / logoProps.width;
      const logoWidth = maxLogoWidth;
      const logoHeight = maxLogoWidth * logoRatio;
      doc.addImage(`data:image/png;base64,${logoBase64}`, "PNG", pageWidth / 2 - logoWidth / 2, endY, logoWidth, logoHeight);
      endY += logoHeight + 10;
    } catch {
      doc.setFontSize(18);
      doc.setTextColor(...rgb(dark));
      doc.text("NIHPLOD", pageWidth / 2, endY + 10, { align: "center" });
      endY += 20;
    }
  }

  // 感谢语
  doc.setFontSize(14);
  doc.setTextColor(...rgb(dark));
  doc.text("感谢使用 NIHPLOD AI 护肤顾问", pageWidth / 2, endY, { align: "center" });
  endY += 15;

  // 分隔线
  doc.setDrawColor(...rgb(gold));
  doc.setLineWidth(0.5);
  doc.line(pageWidth / 2 - 30, endY, pageWidth / 2 + 30, endY);
  endY += 20;

  // 二维码
  if (qrcodeBase64) {
    try {
      const imgProps = doc.getImageProperties(`data:image/png;base64,${qrcodeBase64}`);
      const origWidth = imgProps.width;
      const origHeight = imgProps.height;
      const maxSize = 45;
      let qrWidth: number, qrHeight: number;
      if (origWidth >= origHeight) {
        qrWidth = maxSize;
        qrHeight = (origHeight / origWidth) * maxSize;
      } else {
        qrHeight = maxSize;
        qrWidth = (origWidth / origHeight) * maxSize;
      }
      const qrX = (pageWidth - qrWidth) / 2;
      doc.addImage(`data:image/png;base64,${qrcodeBase64}`, "PNG", qrX, endY, qrWidth, qrHeight);
      endY += qrHeight + 8;
      doc.setFontSize(9);
      doc.setTextColor(...rgb(gray));
      doc.text("扫码关注", pageWidth / 2, endY, { align: "center" });
      endY += 15;
    } catch {
      // 二维码加载失败
    }
  }

  // 网站
  doc.setFontSize(10);
  doc.setTextColor(...rgb(gold));
  doc.text("www.nihplod.cn", pageWidth / 2, endY, { align: "center" });

  // 底部版权信息
  doc.setFontSize(8);
  doc.setTextColor(...rgb(lightGray));
  doc.text(`© ${new Date().getFullYear()} NIHPLOD`, pageWidth / 2, pageHeight - 20, { align: "center" });

  // ===== 页脚（除封面和尾页外的页面）=====
  const pageCount = doc.getNumberOfPages();
  const contentPages = pageCount - 2; // 减去封面和尾页
  for (let i = 2; i <= pageCount - 1; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...rgb(lightGray));
    doc.text(`${i - 1} / ${contentPages}`, pageWidth - marginX, pageHeight - 10, { align: "right" });
  }

  return Buffer.from(doc.output("arraybuffer"));
}

interface ReportData {
  skinType?: string;
  skinTypeLabel: string;
  skinTypeDescription?: string;
  skinTypeConfidence?: number;
  skinAge?: number;
  skinAgeFactors?: string[];
  hydration?: { level: string; percent?: number; description?: string };
  overallScore?: number;
  priorityAreas?: string[];
  dimensions?: { name: string; score: number }[];
  skinConditions?: { condition: string; area: string; description: string; severity?: string }[];
  concerns?: string[];
  summary?: string;
  details?: string[];
  recommendations?: string[];
}

export async function POST(request: NextRequest) {
  try {
    // 诊断：打印请求头信息
    const userAgent = request.headers.get("user-agent") || "unknown";
    const contentLengthHeader = request.headers.get("content-length");
    const requestId = Math.random().toString(36).substring(7);

    // 检测可疑的 User-Agent（如 IE11 或其他异常来源）
    const isIE = userAgent.includes("Trident") || userAgent.includes("MSIE");
    if (isIE) {
      console.warn(`[${requestId}] Rejecting request from IE/Trident browser`);
      return NextResponse.json({ error: "Browser not supported" }, { status: 400 });
    }

    // 读取请求体 - 先读取文本再解析，以便更好地诊断问题
    let data: ReportData;
    try {
      const rawBody = await request.text();
      const actualLength = new TextEncoder().encode(rawBody).length;
      const declaredLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : null;

      console.log(`[${requestId}] Content-Length header: ${declaredLength}, Actual bytes: ${actualLength}`);

      // 检查 Content-Length 是否匹配实际内容
      if (declaredLength !== null && Math.abs(declaredLength - actualLength) > 10) {
        console.error(`[${requestId}] Content-Length mismatch! Declared: ${declaredLength}, Actual: ${actualLength}`);
        return NextResponse.json({ error: "Content-Length mismatch" }, { status: 400 });
      }

      if (!rawBody || rawBody.trim() === "") {
        console.error(`[${requestId}] Empty request body received`);
        return NextResponse.json({ error: "Empty request body" }, { status: 400 });
      }

      // 尝试解析 JSON
      data = JSON.parse(rawBody);
      console.log(`[${requestId}] JSON parsed successfully for:`, data.skinTypeLabel);
    } catch (parseError) {
      console.error(`[${requestId}] JSON parse error:`, parseError);
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }

    // 验证必要字段
    if (!data || typeof data !== "object") {
      return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
    }

    if (!data.skinTypeLabel) {
      return NextResponse.json({ error: "Missing required field: skinTypeLabel" }, { status: 400 });
    }

    console.log("Generating PDF for:", data.skinTypeLabel);

    // 生成 PDF
    const pdfBuffer = await createPdf(data);

    console.log("PDF generated successfully, size:", pdfBuffer.length);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="NIHPLOD-Skin-Report.pdf"',
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (error) {
    console.error("PDF generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

