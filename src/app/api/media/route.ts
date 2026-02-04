import { NextResponse } from "next/server";

// GET /api/media - 获取媒体列表
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ message: "Media API - 待实现", data: [] });
}

// POST /api/media - 上传媒体文件
export async function POST() {
  return NextResponse.json({ message: "Upload Media API - 待实现" }, { status: 501 });
}
