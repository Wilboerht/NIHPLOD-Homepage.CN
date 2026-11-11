import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { apiConsole } from "@/lib/logger";
import { isAllowedAvatarUrl, updateProfileSchema } from "@/lib/profile-schema";
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
    const parsed = profileCorrectionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return supportError("INVALID_PARAMS", parsed.error.issues[0]?.message || "参数错误");
    if (parsed.data.avatar && !isAllowedAvatarUrl(parsed.data.avatar)) {
      return supportError("INVALID_AVATAR", "头像地址不合法");
    }

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
