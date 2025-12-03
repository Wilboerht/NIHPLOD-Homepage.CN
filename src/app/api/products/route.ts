import { NextResponse } from "next/server";

// GET /api/products - 获取作品列表
export async function GET() {
  // TODO: 实现数据库查询
  return NextResponse.json({ message: "Products API - 待实现", data: [] });
}

// POST /api/products - 创建作品
export async function POST() {
  // TODO: 实现创建逻辑
  return NextResponse.json({ message: "Create Product API - 待实现" }, { status: 501 });
}
