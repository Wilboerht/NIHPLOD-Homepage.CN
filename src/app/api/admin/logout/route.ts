import { NextResponse } from "next/server";

// POST /api/admin/logout - 管理员登出
export async function POST() {
  return NextResponse.json({ message: "Admin Logout API - 待实现" }, { status: 501 });
}
