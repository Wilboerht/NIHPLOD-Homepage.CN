import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/jobs - 获取已发布的招聘列表
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
    console.error("Failed to fetch jobs:", error);
    return NextResponse.json(
      { error: "获取职位列表失败" },
      { status: 500 }
    );
  }
}
