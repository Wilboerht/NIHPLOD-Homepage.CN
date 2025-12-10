"use client";

import { forwardRef } from "react";
import type { FaceAnalysisResult as FaceAnalysisData } from "@/app/api/advisor/face-analyze/route";

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

interface ShareReportImageProps {
  skinType: string;
  skinTypeLabel: string;
  concerns: string[];
  skinAge?: number;
  summary: string;
  details: string[];
  faceAnalysis?: FaceAnalysisData | null;
  userImage?: string | null;
  routine: {
    morning: { order: number; step: string; description: string }[];
    evening: { order: number; step: string; description: string }[];
  };
}

/**
 * 分享报告图片组件 - 固定宽度布局，用于生成分享图片
 */
export const ShareReportImage = forwardRef<HTMLDivElement, ShareReportImageProps>(
  function ShareReportImage(
    { skinType, skinTypeLabel, concerns, skinAge, summary, details, faceAnalysis, userImage, routine },
    ref
  ) {
    const hydrationPercent = faceAnalysis?.hydration?.percent ?? 60;

    return (
      <div
        ref={ref}
        style={{
          width: "375px",
          backgroundColor: "#FAF8F5",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "24px 20px",
          boxSizing: "border-box",
        }}
      >
        {/* 标题 */}
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: "rgba(200, 170, 110, 0.1)",
              padding: "6px 16px",
              borderRadius: "20px",
              marginBottom: "8px",
            }}
          >
            <span style={{ color: "#C8AA6E", fontSize: "14px" }}>✨ AI 分析完成</span>
          </div>
          <h1 style={{ fontSize: "22px", color: "#2D2D2D", margin: "0", fontWeight: "500" }}>
            您的肌肤分析报告
          </h1>
        </div>

        {/* 肤质类型卡片 */}
        <div
          style={{
            backgroundColor: "#fff",
            borderRadius: "16px",
            padding: "16px",
            marginBottom: "16px",
            display: "flex",
            gap: "16px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          {userImage && (
            <div
              style={{
                width: "80px",
                height: "80px",
                borderRadius: "12px",
                overflow: "hidden",
                flexShrink: 0,
                backgroundColor: "#F5F3EE",
              }}
            >
              <img
                src={userImage}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                crossOrigin="anonymous"
              />
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>肤质类型</div>
            <div style={{ fontSize: "18px", color: "#2D2D2D", fontWeight: "500", marginBottom: "4px" }}>
              {skinTypeLabel || SKIN_TYPE_LABELS[skinType] || "混合性肌肤"}
            </div>
            {faceAnalysis && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#888" }}>
                <span>置信度</span>
                <div style={{ width: "60px", height: "4px", backgroundColor: "#E8E5DD", borderRadius: "2px", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${(faceAnalysis.skinType.confidence * 100)}%`,
                      height: "100%",
                      backgroundColor: "#C8AA6E",
                      borderRadius: "2px",
                    }}
                  />
                </div>
                <span>{Math.round(faceAnalysis.skinType.confidence * 100)}%</span>
              </div>
            )}
            {faceAnalysis?.skinType.description && (
              <p style={{ fontSize: "12px", color: "#666", margin: "8px 0 0", lineHeight: "1.5" }}>
                {faceAnalysis.skinType.description}
              </p>
            )}
          </div>
        </div>

        {/* 肌肤状态检测 */}
        {faceAnalysis && (
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: "16px",
              padding: "16px",
              marginBottom: "16px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <h3 style={{ fontSize: "14px", color: "#2D2D2D", margin: "0 0 12px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: "#C8AA6E" }}>◉</span> 检测到的肌肤状态
            </h3>
            
            {/* 水分状态 */}
            <div style={{ marginBottom: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                <span style={{ color: "#2D2D2D" }}>💧 水分状态</span>
                <span style={{ color: "#888" }}>{hydrationPercent}%</span>
              </div>
              <div style={{ height: "6px", backgroundColor: "#E8E5DD", borderRadius: "3px", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${hydrationPercent}%`,
                    height: "100%",
                    backgroundColor: hydrationPercent < 40 ? "#EF4444" : hydrationPercent < 70 ? "#F59E0B" : "#22C55E",
                    borderRadius: "3px",
                  }}
                />
              </div>
            </div>

            {/* 肌肤问题 */}
            {faceAnalysis.skinConditions.map((condition, i) => (
              <div key={i} style={{ fontSize: "12px", marginBottom: "8px", display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <span style={{ color: "#F59E0B" }}>⚠</span>
                <div>
                  <span style={{ color: "#2D2D2D", fontWeight: "500" }}>{condition.condition}</span>
                  <span style={{
                    fontSize: "10px",
                    marginLeft: "6px",
                    padding: "2px 6px",
                    backgroundColor: "#F5F5F5",
                    borderRadius: "4px",
                    color: condition.severity === "severe" ? "#EF4444" : condition.severity === "moderate" ? "#F59E0B" : "#22C55E"
                  }}>
                    {SEVERITY_LABELS[condition.severity] || "轻度"}
                  </span>
                  <div style={{ color: "#888", marginTop: "2px" }}>{condition.area}</div>
                </div>
              </div>
            ))}

            {/* 肌肤年龄 */}
            {faceAnalysis.skinAge.estimated > 0 && (
              <div style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
                <span style={{ color: "#8B5CF6" }}>📅</span>
                <span style={{ color: "#2D2D2D" }}>肌肤年龄</span>
                <span style={{ color: "#C8AA6E", fontWeight: "500", fontSize: "16px" }}>{faceAnalysis.skinAge.estimated} 岁</span>
              </div>
            )}
          </div>
        )}

        {/* 护肤建议 */}
        {faceAnalysis && faceAnalysis.recommendations.length > 0 && (
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: "16px",
              padding: "16px",
              marginBottom: "16px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <h3 style={{ fontSize: "14px", color: "#2D2D2D", margin: "0 0 12px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: "#C8AA6E" }}>💡</span> 护肤建议
            </h3>
            {faceAnalysis.recommendations.map((rec, i) => (
              <div key={i} style={{ fontSize: "12px", color: "#555", marginBottom: "8px", display: "flex", alignItems: "flex-start", gap: "8px", lineHeight: "1.5" }}>
                <span style={{ color: "#C8AA6E", marginTop: "2px" }}>•</span>
                <span>{rec}</span>
              </div>
            ))}
          </div>
        )}

        {/* 综合分析 */}
        <div
          style={{
            backgroundColor: "#fff",
            borderRadius: "16px",
            padding: "16px",
            marginBottom: "16px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <h3 style={{ fontSize: "14px", color: "#2D2D2D", margin: "0 0 12px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: "#C8AA6E" }}>✨</span> 综合分析
          </h3>
          <p style={{ fontSize: "12px", color: "#555", margin: "0 0 12px", lineHeight: "1.6" }}>{summary}</p>
          {details.map((detail, i) => (
            <div key={i} style={{ fontSize: "12px", color: "#666", marginBottom: "6px", display: "flex", alignItems: "flex-start", gap: "8px", lineHeight: "1.5" }}>
              <span style={{ color: "#C8AA6E", marginTop: "2px" }}>•</span>
              <span>{detail}</span>
            </div>
          ))}
        </div>

        {/* 护肤方案 */}
        <div
          style={{
            backgroundColor: "#fff",
            borderRadius: "16px",
            padding: "16px",
            marginBottom: "16px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <h3 style={{ fontSize: "14px", color: "#2D2D2D", margin: "0 0 12px" }}>专属护肤方案</h3>

          {/* 晨间护肤 */}
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "12px", color: "#C8AA6E", marginBottom: "8px", display: "flex", alignItems: "center", gap: "4px" }}>
              ☀️ 晨间护肤
            </div>
            {routine.morning.map((step) => (
              <div key={step.order} style={{ fontSize: "12px", marginBottom: "6px", display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <span style={{
                  width: "20px",
                  height: "20px",
                  backgroundColor: "rgba(200, 170, 110, 0.1)",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#C8AA6E",
                  fontSize: "11px",
                  flexShrink: 0,
                }}>{step.order}</span>
                <div>
                  <span style={{ color: "#2D2D2D", fontWeight: "500" }}>{step.step}</span>
                  <span style={{ color: "#888", marginLeft: "8px" }}>{step.description}</span>
                </div>
              </div>
            ))}
          </div>

          {/* 夜间护肤 */}
          <div>
            <div style={{ fontSize: "12px", color: "#C8AA6E", marginBottom: "8px", display: "flex", alignItems: "center", gap: "4px" }}>
              🌙 夜间护肤
            </div>
            {routine.evening.map((step) => (
              <div key={step.order} style={{ fontSize: "12px", marginBottom: "6px", display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <span style={{
                  width: "20px",
                  height: "20px",
                  backgroundColor: "rgba(200, 170, 110, 0.1)",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#C8AA6E",
                  fontSize: "11px",
                  flexShrink: 0,
                }}>{step.order}</span>
                <div>
                  <span style={{ color: "#2D2D2D", fontWeight: "500" }}>{step.step}</span>
                  <span style={{ color: "#888", marginLeft: "8px" }}>{step.description}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 免责声明 */}
        <div
          style={{
            backgroundColor: "rgba(251, 191, 36, 0.1)",
            borderRadius: "12px",
            padding: "12px",
            border: "1px solid rgba(251, 191, 36, 0.3)",
          }}
        >
          <div style={{ fontSize: "11px", color: "#92400E", lineHeight: "1.5" }}>
            <span style={{ fontWeight: "500" }}>⚠️ 温馨提示：</span>
            本分析报告由 AI 技术生成，仅供护肤品选购参考，不构成医学诊断或治疗建议。如有皮肤健康问题，请咨询专业皮肤科医生。
          </div>
        </div>

        {/* 底部品牌 */}
        <div style={{ textAlign: "center", marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #E8E5DD" }}>
          <div style={{ fontSize: "14px", color: "#C8AA6E", fontWeight: "500", letterSpacing: "2px" }}>NIHPLOD</div>
          <div style={{ fontSize: "10px", color: "#888", marginTop: "4px" }}>AI 智能护肤顾问</div>
        </div>
      </div>
    );
  }
);

