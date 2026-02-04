import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyAuth } from "@/lib/auth";

/**
 * POST /api/revalidate - 按需重新验证缓存
 * 当后台更新数据后调用此 API 立即刷新前台页面
 */
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // 验证管理员身份
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: "未授权" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { paths } = body;

    if (!paths || !Array.isArray(paths)) {
      return NextResponse.json(
        { success: false, error: "请提供要刷新的路径数组" },
        { status: 400 }
      );
    }

    // 重新验证指定路径
    for (const path of paths) {
      revalidatePath(path);
    }

    return NextResponse.json({
      success: true,
      message: `已刷新 ${paths.length} 个页面缓存`,
      paths,
    });
  } catch (error) {
    console.error("重新验证失败:", error);
    return NextResponse.json(
      { success: false, error: "刷新缓存失败" },
      { status: 500 }
    );
  }
}

