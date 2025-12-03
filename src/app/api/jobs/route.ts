import { NextResponse } from "next/server";

// GET /api/jobs - 获取招聘列表
export async function GET() {
  return NextResponse.json({ message: "Jobs API - 待实现", data: [] });
}

// POST /api/jobs - 创建招聘职位
export async function POST() {
  return NextResponse.json({ message: "Create Job API - 待实现" }, { status: 501 });
}
