import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";

// GET /api/admin/job-locations - 获取已有职位的工作地点列表（去重）
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const jobs = await prisma.job.findMany({
      select: { location: true },
      distinct: ["location"],
      orderBy: { location: "asc" },
    });

    const locations = jobs.map((j) => j.location);

    return NextResponse.json({ success: true, data: locations });
  } catch (error) {
    apiConsole.error("获取工作地点失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取工作地点失败" } },
      { status: 500 }
    );
  }
}
