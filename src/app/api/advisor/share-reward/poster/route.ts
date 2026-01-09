import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import sharp from "sharp";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

/**
 * GET /api/advisor/share-reward/poster
 * 生成专属海报
 * Query: campaignId, skinScore, percentile, nickname, contact (用于生成专属码)
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const campaignId = searchParams.get("campaignId");
        const skinScore = parseInt(searchParams.get("skinScore") || "0");
        const percentile = parseInt(searchParams.get("percentile") || "0");
        const nickname = searchParams.get("nickname") || "User";
        const contact = searchParams.get("contact") || "guest"; // 用于生成专属链接内容

        if (!campaignId) {
            return NextResponse.json({ error: "参数缺失" }, { status: 400 });
        }

        // 1. 获取活动配置
        const campaign = await prisma.shareRewardCampaign.findUnique({
            where: { id: campaignId },
        });

        if (!campaign || !campaign.posterTemplate) {
            return NextResponse.json({ error: "活动配置无效" }, { status: 404 });
        }

        // 2. 获取模板图片
        let templateImgUrl = campaign.posterTemplate;
        if (templateImgUrl.startsWith("/")) {
            const origin = new URL(request.url).origin;
            templateImgUrl = `${origin}${templateImgUrl}`;
        }
        const templateRes = await fetch(templateImgUrl);
        if (!templateRes.ok) throw new Error("无法加载模板图片");
        const templateBuffer = await templateRes.arrayBuffer();

        // 3. 解析配置
        const config = campaign.posterConfig as Record<string, { x: number; y: number; fontSize?: number; color?: string; width?: number; height?: number }> | null;
        // 默认配置兜底
        const scoreCfg = config?.score || { x: 540, y: 800, fontSize: 80, color: "#D4A574" };
        const perCfg = config?.percentile || { x: 540, y: 950, fontSize: 40, color: "#333333" };
        const codeCfg = config?.code || { x: 540, y: 1500, width: 200, height: 200 };
        const nickCfg = config?.nickname || { x: 540, y: 400, fontSize: 40, color: "#333333" };

        // 4. 生成二维码
        // 二维码内容可以是首页带参数，或者特定的活动落地页
        const qrContent = `https://nihplod.cn/advisor?ref=${contact}&camp=${campaignId}`;
        const qrBuffer = await QRCode.toBuffer(qrContent, {
            width: codeCfg.width || 200,
            margin: 1,
            color: {
                dark: "#000000",
                light: "#00000000" // 透明背景
            }
        });

        // 5. 生成 SVG 文字层
        // 注意：SVG文本垂直居中较难，dominant-baseline 在 sharp 中支持有限，通常用 dy 调整
        const svgOverlay = `
      <svg width="1080" height="1920">
        <style>
          .score { fill: ${scoreCfg.color}; font-size: ${scoreCfg.fontSize}px; font-family: sans-serif; font-weight: bold; }
          .percent { fill: ${perCfg.color}; font-size: ${perCfg.fontSize}px; font-family: sans-serif; }
          .nickname { fill: ${nickCfg.color}; font-size: ${nickCfg.fontSize}px; font-family: sans-serif; font-weight: bold; }
        </style>
        
        <!-- 昵称 -->
        <text x="${nickCfg.x}" y="${nickCfg.y}" text-anchor="middle" class="nickname">${nickname}</text>
        
        <!-- 分数 -->
        <text x="${scoreCfg.x}" y="${scoreCfg.y}" text-anchor="middle" class="score">${skinScore}</text>
        
        <!-- 超越比例 -->
        <text x="${perCfg.x}" y="${perCfg.y}" text-anchor="middle" class="percent">超越了 ${percentile}% 的同龄人</text>
      </svg>
    `;

        // 6. 合成图片
        const compositeList: sharp.OverlayOptions[] = [
            { input: Buffer.from(svgOverlay), top: 0, left: 0 },
            {
                input: qrBuffer,
                top: Math.round(codeCfg.y),
                left: Math.round(codeCfg.x - (codeCfg.width || 200) / 2) // 假设配置的是中心点X? 不，通常是左上角。
                // 等等，用户配置的是什么？
                // 假设表单里配置的是左上角。
                // 如果是左上角： left: codeCfg.x
            }
        ];

        // 修正二维码坐标逻辑：通常用户配置习惯不同。
        // 如果看上面的 SVG text-anchor="middle"，我假设 x 是中心点。
        // 对于 image overlay (二维码)，sharp 需要 top/left。
        // 如果用户输入的 x 是中心点，则 left = x - width/2。
        // 为了简单，我们假设用户输入的是 左上角 坐标用于二维码，中心点 坐标用于文字。
        // 让我们统一一下：
        // 代码里 SVG 使用 text-anchor="middle"，说明 x 是中心 x。
        // 对于二维码，我们让用户输入 左上角 吧，因为可视化配置通常是拖拽左上角。
        // 这里为了保险，把二维码的 left 设为 codeCfg.x。
        compositeList[1].left = Number(codeCfg.x);
        compositeList[1].top = Number(codeCfg.y);

        // 6. 合成图片
        // 确保底图大小为 1080x1920，以匹配 SVG 和坐标系
        const finalImage = await sharp(Buffer.from(templateBuffer))
            .resize(1080, 1920, { fit: 'fill' })
            .composite(compositeList)
            .png()
            .toBuffer();

        // 7. 返回图片
        return new NextResponse(new Uint8Array(finalImage), {
            headers: {
                "Content-Type": "image/png",
                "Cache-Control": "public, max-age=3600", // 缓存1小时
            },
        });

    } catch (error) {
        console.error("生成海报失败:", error);
        return NextResponse.json({ error: "生成失败" }, { status: 500 });
    }
}
