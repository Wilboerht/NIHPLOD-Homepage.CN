import { NextResponse } from "next/server";

// GET /api/pages - 获取页面列表
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ message: "Pages API - 待实现", data: [] });
}

// POST /api/pages - 创建页面
export async function POST() {
  return NextResponse.json({ message: "Create Page API - 待实现" }, { status: 501 });
}
