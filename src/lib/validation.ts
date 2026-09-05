import { NextResponse } from "next/server";
import { z } from "zod";

// 兼容两种 ID 格式：
// - CUID v1（Prisma 6 之前 cuid() 默认）：c + 24 位 base36，共 25 位
// - CUID2（Prisma 6+ cuid() 默认生成）：24 位小写字母，无固定前缀
// 注：Prisma 6 起 @default(cuid()) 生成 CUID2，若只校验 v1 会导致新数据全部 400
export const cuidSchema = z.string().regex(/^(c[a-z0-9]{24}|[a-z][a-z0-9]{23})$/);

export function validateCUID(id: string): boolean {
  return cuidSchema.safeParse(id).success;
}

export function invalidIdResponse(): NextResponse {
  return NextResponse.json(
    { success: false, error: { code: "INVALID_ID", message: "非法 ID 格式" } },
    { status: 400 }
  );
}
