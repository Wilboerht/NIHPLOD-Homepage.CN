import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/settings - 获取系统设置（公开）
export async function GET() {
  try {
    const settings = await prisma.setting.findMany();

    // 转换为 key-value 对象
    const settingsMap = settings.reduce(
      (acc, setting) => {
        acc[setting.key] = setting.value;
        return acc;
      },
      {} as Record<string, unknown>
    );

    return NextResponse.json({
      success: true,
      data: settingsMap,
    });
  } catch (error) {
    console.error("获取设置失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "FETCH_ERROR", message: "获取设置失败" } },
      { status: 500 }
    );
  }
}

// PUT /api/settings - 更新系统设置（需要管理员权限）
export async function PUT() {
  return NextResponse.json(
    { success: false, error: { code: "NOT_IMPLEMENTED", message: "待实现" } },
    { status: 501 }
  );
}
