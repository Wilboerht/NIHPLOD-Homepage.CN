import { NextResponse } from "next/server";
import { AdminApprovalError } from "./admin-approval-errors";
import { apiConsole } from "./logger";

export function approvalErrorResponse(error: unknown): NextResponse {
  if (error instanceof AdminApprovalError) {
    return NextResponse.json(
      { success: false, error: { code: error.code, message: error.message } },
      { status: error.status }
    );
  }
  apiConsole.error("[AdminApproval] 未处理异常:", error);
  return NextResponse.json(
    { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
    { status: 500 }
  );
}
