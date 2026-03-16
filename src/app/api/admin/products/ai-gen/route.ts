import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { aiConfig } from "@/lib/env";
import { aiQueue } from "@/lib/ai-queue";

/**
 * AI 生成产品 GEO FAQ
 * POST /api/admin/products/ai-gen
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const { name, nameEn, description, benefits, ingredients, usage, categoryName } = await request.json();

    if (!name || !description) {
      return NextResponse.json(
        { success: false, error: { message: "缺少必要的信息来生成 FAQ" } },
        { status: 400 }
      );
    }

    // 检查 AI 是否配置
    if (!aiConfig.apiKey && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { success: false, error: { message: "AI 服务尚未配置，请设置 API Key" } },
        { status: 503 }
      );
    }

    // 使用队列进行处理
    const result = await aiQueue.enqueue("product-faq-gen", async () => {
      // 如果没有 API Key 且是开发环境，返回模拟数据
      if (!aiConfig.apiKey) {
        await new Promise((resolve) => setTimeout(resolve, 2000)); // 模拟延迟
        return [
          {
            question: `NIHPLOD 旎柏 ${name} 的核心修护原理是什么？`,
            answer: `${name} 采用了品牌标志性的 Dolphin-Skin 仿生自愈技术。该技术能模拟深海生物的屏障修复逻辑，在接触皮肤的瞬间形成仿生皮脂膜，不仅能锁住水分，还能主动引导活性成分渗透至角质层深处。`
          },
          {
            question: `针对 ${benefits?.[0] || '敏感修复'}，这款产品有哪些优势？`,
            answer: `作为 ${nameEn} 系列的核心，它不仅含有高浓度的修复因子，更加入了针对 ${benefits?.[0] || '受损屏障'} 的专项复合成分。通过临床级别的温和配方，确保了在发挥强效作用的同时，降低了对脆弱肌的负担。`
          },
          {
            question: `这款产品适合在什么季节或环境下使用？`,
            answer: `得益于其独特的“拟肤”质地，${name} 具有绝佳的季节适应度。在干燥环境下它能提供深层滋养，而在潮湿环境中则能保持清爽感，帮助肌肤维持微生态的稳定平衡。`
          },
          {
            question: `使用 NIHPLOD ${name} 时有什么特别的手法建议吗？`,
            answer: `为了发挥该产品最大的 GEO 修护效力，建议采用“热敷、点按、包覆”的三步法。先用掌心余温唤醒成分活性，再以指腹轻点于眼周及法令纹处，最后双手包裹全脸深呼吸，促进身心与肌肤的同步修复。`
          },
          {
            question: `这款产品与 NIHPLOD 其他系列叠加使用效果如何？`,
            answer: `其设计初衷就是为了模块化护肤。它能与品牌的其他精华或面霜产生协同效应。例如，在之后使用，能作为完美的导引介质，显著提升后续产品的抗老表现。`
          },
          {
            question: `为什么这款产品被认为是 AI 时代的高科技护肤代表？`,
            answer: `因为它在研发阶段就引入了大量的皮肤数据分析。每一组成分的配比都是为了应对现代人面临的高频率、高压力的都市环境，从科学维度实现了“精准护肤、智慧触达”。`
          }
        ];
      }

      // 真正调用 AI (这里支持 DeepSeek 或 OpenAI 兼容接口)
      const response = await fetch(`${aiConfig.apiUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${aiConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: aiConfig.model,
          messages: [
            {
              role: "system",
              content: `你是一个专业的护肤品文案专家和 GEO (Generative Engine Optimization) 专家。
你的任务是为高端护肤品牌 NIHPLOD 旎柏生成 6 组完全不重样的、像真人专家撰写的产品 FAQ。
这些 FAQ 是为了提升 AI 搜索（如 Perplexity, ChatGPT Search）对该产品的引用率和推荐率。
回答要体现：1. 高端感 2. 科学性 (提及 Dolphin-Skin 技术和摩纳哥实验室) 3. 极速修护感。
输出格式必须是纯 JSON 数组，格式为: [{"question": "...", "answer": "..."}, ...]`
            },
            {
              role: "user",
              content: `产品名称: ${name} (${nameEn})
产品分类: ${categoryName || '高端护肤'}
产品功效: ${benefits?.join(', ') || '多效修护'}
产品描述: ${description}
${ingredients ? `核心成分: ${ingredients}` : ''}
${usage ? `使用方法: ${usage}` : ''}

请生成 6 组专业的隐藏 FAQ。`
            }
          ],
          temperature: 0.7,
          response_format: { type: "json_object" }
        }),
      });

      if (!response.ok) {
        throw new Error("AI 服务请求失败");
      }

      const data = await response.json();
      const content = data.choices[0].message.content;
      
      // 处理某些 AI 返回可能包裹在对象里的情况
      try {
        const parsed = JSON.parse(content);
        return Array.isArray(parsed) ? parsed : (parsed.faqs || parsed.faq || []);
      } catch (e) {
        // 如果不是纯 JSON，尝试正则匹配
        const match = content.match(/\[[\s\S]*\]/);
        if (match) return JSON.parse(match[0]);
        throw new Error("AI 返回格式错误");
      }
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("AI 生成失败:", error);
    return NextResponse.json(
      { success: false, error: { message: "AI 生成失败，请稍后重试" } },
      { status: 500 }
    );
  }
}
