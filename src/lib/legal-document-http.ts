import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { apiConsole } from "@/lib/logger";
import { LegalDocumentError } from "@/lib/legal-document-errors";

export const LEGAL_NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private",
} as const;

export function legalErrorResponse(error: unknown, fallbackMessage: string): NextResponse {
  if (error instanceof LegalDocumentError) {
    return NextResponse.json(
      { success: false, error: { code: error.code, message: error.message } },
      { status: error.status, headers: LEGAL_NO_STORE_HEADERS }
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: error.issues[0]?.message ?? "参数错误",
          details: error.issues,
        },
      },
      { status: 400, headers: LEGAL_NO_STORE_HEADERS }
    );
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_JSON", message: "请求体不是合法 JSON" } },
      { status: 400, headers: LEGAL_NO_STORE_HEADERS }
    );
  }
  apiConsole.error(fallbackMessage, error);
  return NextResponse.json(
    { success: false, error: { code: "INTERNAL_ERROR", message: fallbackMessage } },
    { status: 500, headers: LEGAL_NO_STORE_HEADERS }
  );
}

export function illegalSlugResponse(): NextResponse {
  return NextResponse.json(
    { success: false, error: { code: "INVALID_SLUG", message: "非法的法务文档标识" } },
    { status: 400, headers: LEGAL_NO_STORE_HEADERS }
  );
}
