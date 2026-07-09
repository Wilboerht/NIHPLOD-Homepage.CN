import { NextResponse } from "next/server";
import { z } from "zod";

export const cuidSchema = z.string().cuid();

export function validateCUID(id: string): boolean {
  return cuidSchema.safeParse(id).success;
}

export function invalidIdResponse(): NextResponse {
  return NextResponse.json(
    { success: false, error: { code: "INVALID_ID", message: "非法 ID 格式" } },
    { status: 400 }
  );
}
