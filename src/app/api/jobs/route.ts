import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";

// GET /api/jobs - 获取已发布的招聘列表
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const jobs = await prisma.job.findMany({
      where: { published: true },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        titleEn: true,
        location: true,
        type: true,
        description: true,
        requirements: true,
        salary: true,
      },
    });

    return NextResponse.json({ data: jobs });
  } catch (error) {
    apiConsole.error("Failed to fetch jobs:", error);
    return NextResponse.json(
      { error: "获取职位列表失败" },
      { status: 500 }
    );
  }
}
