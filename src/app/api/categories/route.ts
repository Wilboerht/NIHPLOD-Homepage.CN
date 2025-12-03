import { NextResponse } from "next/server";

// GET /api/categories - 获取分类列表
export async function GET() {
  return NextResponse.json({ message: "Categories API - 待实现", data: [] });
}

// POST /api/categories - 创建分类
export async function POST() {
  return NextResponse.json({ message: "Create Category API - 待实现" }, { status: 501 });
}
