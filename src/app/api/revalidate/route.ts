import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyAuth } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { pushUrlsToBaidu } from "@/lib/baidu-push";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";

const revalidateSchema = z.object({
  paths: z.array(z.string().min(1, "路径不能为空")).min(1, "至少提供一个路径"),
});

/**
 * POST /api/revalidate - 按需重新验证缓存
 * 当后台更新数据后调用此 API 立即刷新前台页面
 */
// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    if (!validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

    // 验证管理员身份
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsed = revalidateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "参数错误", details: parsed.error.issues },
        { status: 400 }
      );
    }
    const { paths } = parsed.data;

    // 重新验证指定路径（白名单校验）
    const ALLOWED_PATHS = [
      "/",
      "/about",
      "/products",
      "/services",
      "/guide",
      "/careers",
      "/contact",
      "/faq",
      "/terms",
      "/privacy",
    ];
    const isAllowed = (p: string) =>
      ALLOWED_PATHS.includes(p) || p.startsWith("/products/") || p.startsWith("/admin/");
    for (const path of paths) {
      if (!isAllowed(path)) {
        return NextResponse.json(
          { success: false, error: `路径不允许刷新: ${path}` },
          { status: 400 }
        );
      }
      revalidatePath(path);
    }

    // 内容更新后主动推送给百度加速收录（token 未配置时静默跳过）；
    // 排除后台路径与 noindex 页面；推送失败不影响主流程，故不 await
    const NOINDEX_PATHS = ["/services", "/terms", "/privacy"];
    const pushPaths = paths.filter((p) => !p.startsWith("/admin/") && !NOINDEX_PATHS.includes(p));
    if (pushPaths.length > 0) {
      void pushUrlsToBaidu(pushPaths);
    }

    return NextResponse.json({
      success: true,
      message: `已刷新 ${paths.length} 个页面缓存`,
      paths,
    });
  } catch (error) {
    apiConsole.error("重新验证失败:", error);
    return NextResponse.json({ success: false, error: "刷新缓存失败" }, { status: 500 });
  }
}
