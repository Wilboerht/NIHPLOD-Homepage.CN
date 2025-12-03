import { NextResponse } from "next/server";

// POST /api/admin/login - 管理员登录
export async function POST() {
  return NextResponse.json({ message: "Admin Login API - 待实现" }, { status: 501 });
}
