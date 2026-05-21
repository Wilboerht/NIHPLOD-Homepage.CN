/**
 * 收货地址 API
 * GET /api/user/addresses - 获取地址列表
 * POST /api/user/addresses - 添加新地址
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";

// 地址参数验证
const addressSchema = z.object({
  name: z.string().min(1, "请填写收货人姓名").max(20),
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请填写正确的手机号"),
  province: z.string().min(1, "请选择省份"),
  city: z.string().min(1, "请选择城市"),
  district: z.string().min(1, "请选择区县"),
  detail: z.string().min(1, "请填写详细地址").max(200),
  isDefault: z.boolean().optional(),
});

// 获取地址列表
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const payload = await verifyUserAuth(request);
    
    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const addresses = await prisma.address.findMany({
      where: { userId: payload.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({
      success: true,
      data: { addresses },
    });
  } catch (error) {
    apiConsole.error("[GetAddresses] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

// 添加新地址
export async function POST(request: NextRequest) {
  try {
    const payload = await verifyUserAuth(request);
    
    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    const result = addressSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: result.error.issues[0]?.message || "参数错误" } },
        { status: 400 }
      );
    }

    const { name, phone, province, city, district, detail, isDefault } = result.data;

    // 如果设为默认，先取消其他默认地址
    if (isDefault) {
      await prisma.address.updateMany({
        where: { userId: payload.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    // 检查是否是第一个地址，如果是则默认设为默认
    const count = await prisma.address.count({ where: { userId: payload.id } });
    const shouldDefault = isDefault || count === 0;

    const address = await prisma.address.create({
      data: {
        userId: payload.id,
        name,
        phone,
        province,
        city,
        district,
        detail,
        isDefault: shouldDefault,
      },
    });

    return NextResponse.json({
      success: true,
      data: { address },
    });
  } catch (error) {
    apiConsole.error("[CreateAddress] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

