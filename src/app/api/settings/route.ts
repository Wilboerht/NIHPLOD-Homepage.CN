import { NextResponse } from "next/server";

// GET /api/settings - 获取系统设置
export async function GET() {
  return NextResponse.json({ message: "Settings API - 待实现", data: {} });
}

// PUT /api/settings - 更新系统设置
export async function PUT() {
  return NextResponse.json({ message: "Update Settings API - 待实现" }, { status: 501 });
}
