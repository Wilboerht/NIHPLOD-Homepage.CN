import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSupportAccess, supportError, supportReasonSchema } from "@/lib/admin-support";
import { linkRecordToUser, RecordLinkError } from "@/lib/record-account-links";
import { invalidIdResponse, validateCUID } from "@/lib/validation";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

const schema = z.object({
  userId: z.string().cuid().nullable(),
  expectedUserId: z.string().cuid().nullable().optional(),
  reason: supportReasonSchema,
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireAdminSupportAccess(request, "messages:write", {
      rateLimitKey: "message:account-link",
    });
    if (!access.ok) return access.response;
    const { id } = await params;
    if (!validateCUID(id)) return invalidIdResponse();
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return supportError("INVALID_PARAMS", "参数错误");
    const result = await linkRecordToUser({
      kind: "message",
      recordId: id,
      ...parsed.data,
      admin: access.admin,
      request,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof RecordLinkError)
      return supportError(error.code, error.message, error.status);
    apiConsole.error("[AdminMessageLink] 关联失败:", error);
    return supportError("INTERNAL_ERROR", "留言账户关联失败", 500);
  }
}
