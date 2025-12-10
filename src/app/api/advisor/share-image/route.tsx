/**
 * 生成分享报告图片 API
 * 使用 @vercel/og (ImageResponse) 生成 PNG 图片
 */

import { ImageResponse } from "@vercel/og";
import { NextRequest, NextResponse } from "next/server";

// 配置 Edge Runtime
export const runtime = "edge";

/** 肤质类型映射 */
const SKIN_TYPE_LABELS: Record<string, string> = {
  dry: "干性肌肤",
  oily: "油性肌肤",
  combination: "混合性肌肤",
  normal: "中性肌肤",
  sensitive: "敏感性肌肤",
};

/** 严重程度映射 */
const SEVERITY_LABELS: Record<string, string> = {
  mild: "轻度",
  moderate: "中度",
  severe: "重度",
};

interface ShareImageRequest {
  skinType: string;
  skinTypeLabel?: string;
  concerns: string[];
  skinAge?: number;
  summary: string;
  details: string[];
  faceAnalysis?: {
    skinType: { type: string; confidence: number; description?: string };
    hydration?: { percent: number };
    skinConditions: { condition: string; severity: string; area: string }[];
    skinAge: { estimated: number };
    recommendations: string[];
  } | null;
  userImage?: string | null;
  routine: {
    morning: { order: number; step: string; description: string }[];
    evening: { order: number; step: string; description: string }[];
  };
}

export async function POST(request: NextRequest) {
  try {
    const data: ShareImageRequest = await request.json();

    const {
      skinType,
      skinTypeLabel,
      summary,
      details,
      faceAnalysis,
      routine,
    } = data;

    const hydrationPercent = faceAnalysis?.hydration?.percent ?? 60;
    const displaySkinType = skinTypeLabel || SKIN_TYPE_LABELS[skinType] || "混合性肌肤";

    // 加载字体
    const fontData = await fetch(
      new URL("https://fonts.gstatic.com/s/notosanssc/v36/k3kCo84MPvpLmixcA63oeAL7Iqp5IZJF9bmaG9_FnYxNbPzS5HE.ttf")
    ).then((res) => res.arrayBuffer());

    // 计算动态高度
    const baseHeight = 750; // 基础高度
    const conditionsHeight = faceAnalysis ? faceAnalysis.skinConditions.length * 32 : 0;
    const detailsHeight = details.length * 28;
    const morningSteps = routine.morning.length;
    const eveningSteps = routine.evening.length;
    const routineHeight = (morningSteps + eveningSteps) * 28;
    const totalHeight = baseHeight + conditionsHeight + detailsHeight + routineHeight;

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            backgroundColor: "#FAF8F5",
            fontFamily: "Noto Sans SC",
            padding: "48px 40px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* 标题 */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "40px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                backgroundColor: "rgba(200, 170, 110, 0.1)",
                padding: "12px 32px",
                borderRadius: "40px",
                marginBottom: "16px",
              }}
            >
              <span style={{ color: "#C8AA6E", fontSize: "28px" }}>✨ AI 分析完成</span>
            </div>
            <div style={{ fontSize: "44px", color: "#2D2D2D", fontWeight: "500" }}>您的肌肤分析报告</div>
          </div>

          {/* 肤质类型卡片 */}
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: "24px",
              padding: "32px",
              marginBottom: "24px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ fontSize: "24px", color: "#666", marginBottom: "8px" }}>肤质类型</div>
            <div style={{ fontSize: "36px", color: "#2D2D2D", fontWeight: "500", marginBottom: "8px" }}>
              {displaySkinType}
            </div>
            {faceAnalysis?.skinType?.description && (
              <div style={{ fontSize: "24px", color: "#666", lineHeight: "1.5" }}>
                {faceAnalysis.skinType.description}
              </div>
            )}
          </div>

          {/* 肌肤状态检测 */}
          {faceAnalysis && (
            <div
              style={{
                backgroundColor: "#fff",
                borderRadius: "24px",
                padding: "32px",
                marginBottom: "24px",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ fontSize: "28px", color: "#2D2D2D", marginBottom: "24px", display: "flex", alignItems: "center" }}>
                ◉ 检测到的肌肤状态
              </div>

              {/* 水分状态 */}
              <div style={{ marginBottom: "24px", display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "24px", marginBottom: "8px" }}>
                  <span style={{ color: "#2D2D2D" }}>💧 水分状态</span>
                  <span style={{ color: "#888" }}>{hydrationPercent}%</span>
                </div>
                <div style={{ height: "12px", backgroundColor: "#E8E5DD", borderRadius: "6px", overflow: "hidden", display: "flex" }}>
                  <div
                    style={{
                      width: `${hydrationPercent}%`,
                      height: "100%",
                      backgroundColor: hydrationPercent < 40 ? "#EF4444" : hydrationPercent < 70 ? "#F59E0B" : "#22C55E",
                      borderRadius: "6px",
                    }}
                  />
                </div>
              </div>

              {/* 肌肤问题 */}
              {faceAnalysis.skinConditions.slice(0, 3).map((condition, i) => (
                <div key={i} style={{ fontSize: "24px", marginBottom: "16px", display: "flex", alignItems: "center" }}>
                  <span style={{ color: "#F59E0B", marginRight: "16px" }}>⚠</span>
                  <span style={{ color: "#2D2D2D", fontWeight: "500" }}>{condition.condition}</span>
                  <span
                    style={{
                      fontSize: "20px",
                      marginLeft: "12px",
                      padding: "4px 12px",
                      backgroundColor: "#F5F5F5",
                      borderRadius: "8px",
                      color: condition.severity === "severe" ? "#EF4444" : condition.severity === "moderate" ? "#F59E0B" : "#22C55E",
                    }}
                  >
                    {SEVERITY_LABELS[condition.severity] || "轻度"}
                  </span>
                </div>
              ))}

              {/* 肌肤年龄 */}
              {faceAnalysis.skinAge.estimated > 0 && (
                <div style={{ fontSize: "24px", display: "flex", alignItems: "center", marginTop: "16px" }}>
                  <span style={{ color: "#8B5CF6", marginRight: "16px" }}>📅</span>
                  <span style={{ color: "#2D2D2D" }}>肌肤年龄 </span>
                  <span style={{ color: "#C8AA6E", fontWeight: "500", fontSize: "32px" }}>{faceAnalysis.skinAge.estimated} 岁</span>
                </div>
              )}
            </div>
          )}

          {/* 综合分析 */}
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: "24px",
              padding: "32px",
              marginBottom: "24px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ fontSize: "28px", color: "#2D2D2D", marginBottom: "24px", display: "flex", alignItems: "center" }}>
              ✨ 综合分析
            </div>
            <div style={{ fontSize: "24px", color: "#555", marginBottom: "24px", lineHeight: "1.6" }}>{summary}</div>
            {details.slice(0, 2).map((detail, i) => (
              <div
                key={i}
                style={{ fontSize: "22px", color: "#666", marginBottom: "12px", display: "flex", alignItems: "flex-start", lineHeight: "1.5" }}
              >
                <span style={{ color: "#C8AA6E", marginRight: "16px" }}>•</span>
                <span>{detail}</span>
              </div>
            ))}
          </div>

          {/* 护肤方案 */}
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: "24px",
              padding: "32px",
              marginBottom: "24px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ fontSize: "28px", color: "#2D2D2D", marginBottom: "24px" }}>专属护肤方案</div>

            {/* 晨间护肤 */}
            <div style={{ marginBottom: "24px", display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: "24px", color: "#C8AA6E", marginBottom: "16px", display: "flex", alignItems: "center" }}>
                ☀️ 晨间护肤
              </div>
              {routine.morning.slice(0, 4).map((step) => (
                <div key={step.order} style={{ fontSize: "22px", marginBottom: "12px", display: "flex", alignItems: "center" }}>
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      backgroundColor: "rgba(200, 170, 110, 0.1)",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#C8AA6E",
                      fontSize: "20px",
                      marginRight: "16px",
                    }}
                  >
                    {step.order}
                  </div>
                  <span style={{ color: "#2D2D2D" }}>{step.step}</span>
                </div>
              ))}
            </div>

            {/* 夜间护肤 */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: "24px", color: "#C8AA6E", marginBottom: "16px", display: "flex", alignItems: "center" }}>
                🌙 夜间护肤
              </div>
              {routine.evening.slice(0, 4).map((step) => (
                <div key={step.order} style={{ fontSize: "22px", marginBottom: "12px", display: "flex", alignItems: "center" }}>
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      backgroundColor: "rgba(200, 170, 110, 0.1)",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#C8AA6E",
                      fontSize: "20px",
                      marginRight: "16px",
                    }}
                  >
                    {step.order}
                  </div>
                  <span style={{ color: "#2D2D2D" }}>{step.step}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 底部品牌 */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              marginTop: "auto",
              paddingTop: "32px",
              borderTop: "2px solid #E8E5DD",
            }}
          >
            <div style={{ fontSize: "32px", color: "#C8AA6E", fontWeight: "500", letterSpacing: "4px" }}>NIHPLOD</div>
            <div style={{ fontSize: "20px", color: "#888", marginTop: "8px" }}>AI 智能护肤顾问</div>
          </div>
        </div>
      ),
      {
        width: 750,
        height: Math.max(totalHeight, 1400),
        fonts: [
          {
            name: "Noto Sans SC",
            data: fontData,
            weight: 400,
            style: "normal",
          },
        ],
      }
    );
  } catch (error) {
    console.error("Error generating share image:", error);
    return NextResponse.json({ error: "Failed to generate image" }, { status: 500 });
  }
}

