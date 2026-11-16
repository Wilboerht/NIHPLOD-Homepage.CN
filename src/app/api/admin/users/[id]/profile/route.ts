import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { apiConsole } from "@/lib/logger";
import { updateProfileSchema } from "@/lib/profile-schema";
import {
  checkNicknameContent,
  NICKNAME_BANNED_MESSAGE,
  NICKNAME_INVALID_CHARS_MESSAGE,
} from "@/lib/nickname-policy";
import { auditNicknameBlocked } from "@/lib/nickname-audit";
import { normalizeGender, sendProfileUpdateWebhook } from "@/lib/profile-webhook";
import { requireAdminSupportAccess, supportError, supportReasonSchema } from "@/lib/admin-support";
import { AdminCorrectionError, correctUserProfile } from "@/lib/admin-user-corrections";
import { invalidIdResponse, validateCUID } from "@/lib/validation";

export const dynamic = "force-dynamic";

const profileCorrectionSchema = updateProfileSchema
  .extend({ reason: supportReasonSchema })
  .refine(
    (value) =>
      value.nickname !== undefined ||
      value.avatar !== undefined ||
      value.birthday !== undefined ||
      value.gender !== undefined,
    { message: "未提供可更新的资料字段" }
  );

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireAdminSupportAccess(request, "users:write", {
      rateLimitKey: "user:profile-correction",
    });
    if (!access.ok) return access.response;
    const { id } = await params;
    if (!validateCUID(id)) return invalidIdResponse();
    const rawBody = await request.json().catch(() => null);

    // 昵称内容风控：先于 schema 校验检查，保证命中时返回明确错误码并写审计
    const rawNickname =
      rawBody && typeof rawBody === "object" && "nickname" in rawBody
        ? (rawBody as { nickname?: unknown }).nickname
        : undefined;
    if (typeof rawNickname === "string" && rawNickname.trim()) {
      const nicknameCheck = checkNicknameContent(rawNickname);
      if (!nicknameCheck.ok) {
        await auditNicknameBlocked({
          request,
          userId: id,
          admin: access.admin,
          source: "admin_correction",
          reason: nicknameCheck.reason,
          category: nicknameCheck.category,
        });
        return supportError(
          "NICKNAME_REJECTED",
          nicknameCheck.reason === "invalid_chars"
            ? NICKNAME_INVALID_CHARS_MESSAGE
            : NICKNAME_BANNED_MESSAGE
        );
      }
    }

    const parsed = profileCorrectionSchema.safeParse(rawBody);
    if (!parsed.success)
      return supportError("INVALID_PARAMS", parsed.error.issues[0]?.message || "参数错误");

    const result = await correctUserProfile(id, parsed.data, {
      admin: access.admin,
      request,
      reason: parsed.data.reason,
    });
    if (result.changedFields.length > 0) {
      revalidateTag("user-profile", { expire: 0 });
      void sendProfileUpdateWebhook(id, {
        nickname: result.user.nickname,
        avatar: result.user.avatar,
        birthday: result.user.birthday?.toISOString() ?? null,
        gender: normalizeGender(result.user.gender),
      }).catch((error) => apiConsole.warn("[AdminUserProfile] 资料同步失败:", error));
    }
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof AdminCorrectionError) {
      return supportError(error.code, error.message, error.status);
    }
    apiConsole.error("[AdminUserProfile] 修改失败:", error);
    return supportError("INTERNAL_ERROR", "用户资料修改失败", 500);
  }
}
