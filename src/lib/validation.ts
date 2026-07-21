import { NextResponse } from "next/server";
import { z } from "zod";

// cuid2 替代已废弃的 z.string().cuid()
// 注意：cuid2 格式与 cuid 不同，需配合 Prisma @default(cuid()) 确认兼容性。
// 当前使用 regex 匹配 Prisma cuid 格式 (c + 24 hex chars)
export const cuidSchema = z.string().regex(/^c[a-z0-9]{24}$/);

export function validateCUID(id: string): boolean {
  return cuidSchema.safeParse(id).success;
}

export function invalidIdResponse(): NextResponse {
  return NextResponse.json(
    { success: false, error: { code: "INVALID_ID", message: "非法 ID 格式" } },
    { status: 400 }
  );
}
