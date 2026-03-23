import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { z } from "zod";

// 设置 keys
const SETTING_KEYS = ["site", "social", "contact", "seo"] as const;

// 各设置的默认值
const DEFAULT_SETTINGS: Record<string, unknown> = {
  site: {
    name: "NIHPLOD 旎柏",
    description: "源自摩纳哥的高端护肤品牌",
    logo: "/images/logo.svg",
    favicon: "/favicon.ico",
  },
  social: {
    wechat_qrcode: "",
    weibo: "",
    xiaohongshu: "",
    douyin: "",
    instagram: "",
  },
  contact: {
    email: "",
    phone: "",
    address: "",
    workingHours: "",
  },
  seo: {
    title: "NIHPLOD 旎柏",
    description: "源自摩纳哥的高端护肤品牌，为您带来奢华护肤体验。",
    keywords: "NIHPLOD,旎柏,护肤品,高端护肤,摩纳哥",
  },
};

// 更新设置 Schema
const UpdateSettingsSchema = z.object({
  site: z
    .object({
      name: z.string().max(100).optional(),
      description: z.string().max(500).optional(),
      logo: z.string().max(500).optional(),
      favicon: z.string().max(500).optional(),
    })
    .optional(),
  social: z
    .object({
      wechat_qrcode: z.string().max(500).optional(),
      weibo: z.string().max(500).optional(),
      xiaohongshu: z.string().max(500).optional(),
      douyin: z.string().max(500).optional(),
      instagram: z.string().max(500).optional(),
    })
    .optional(),
  contact: z
    .object({
      email: z.string().email().or(z.literal("")).optional(),
      phone: z.string().max(50).optional(),
      address: z.string().max(500).optional(),
      workingHours: z.string().max(100).optional(),
    })
    .optional(),
  seo: z
    .object({
      title: z.string().max(100).optional(),
      description: z.string().max(500).optional(),
      keywords: z.string().max(500).optional(),
    })
    .optional(),
});

// GET /api/admin/settings - 获取所有设置
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    // 获取所有设置
    const settings = await prisma.setting.findMany({
      where: { key: { in: [...SETTING_KEYS] } },
    });

    // 构建设置对象，使用默认值填充缺失的设置
    const settingsMap: Record<string, unknown> = {};
    for (const key of SETTING_KEYS) {
      const setting = settings.find((s) => s.key === key);
      if (setting) {
        settingsMap[key] = setting.value;
      } else {
        settingsMap[key] = DEFAULT_SETTINGS[key];
      }
    }



    return NextResponse.json({
      success: true,
      data: settingsMap,
    });
  } catch (error) {
    console.error("获取设置失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取设置失败" } },
      { status: 500 }
    );
  }
}

// PUT /api/admin/settings - 更新设置
export async function PUT(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validated = UpdateSettingsSchema.parse(body);

    // 更新每个设置
    const updates: Promise<unknown>[] = [];

    for (const [key, value] of Object.entries(validated)) {
      if (value === undefined) continue;

      // 获取现有设置
      const existing = await prisma.setting.findUnique({
        where: { key },
      });

      const currentValue = (existing?.value as Record<string, unknown>) || DEFAULT_SETTINGS[key];
      const newValue: Record<string, unknown> = { ...currentValue, ...value };

      updates.push(
        prisma.setting.upsert({
          where: { key },
          create: { key, value: newValue as object },
          update: { value: newValue as object },
        })
      );
    }

    await Promise.all(updates);

    return NextResponse.json({
      success: true,
      data: { message: "设置已保存" },
    });
  } catch (error) {
    console.error("更新设置失败:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: error.issues[0]?.message || "参数错误" } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "更新设置失败" } },
      { status: 500 }
    );
  }
}

