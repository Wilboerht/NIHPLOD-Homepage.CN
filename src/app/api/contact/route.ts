import { NextResponse } from "next/server";

// POST /api/contact - 提交联系表单
export async function POST() {
  return NextResponse.json({ message: "Contact API - 待实现" }, { status: 501 });
}
