import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createAuditLogTx } from "@/lib/audit";
import { enqueueSecurityActionNotification } from "@/lib/security-notify";
import { apiConsole } from "@/lib/logger";
import { requireAdminSupportAccess, supportError, supportReasonSchema } from "@/lib/admin-support";
import { invalidIdResponse, validateCUID } from "@/lib/validation";

export const dynamic = "force-dynamic";

const schema = z.object({
  provider: z.enum(["wechat_open", "wechat_mp", "wechat_miniprogram", "douyin"]),
  subjectId: z.string().trim().min(1).max(200),
  unionId: z.string().trim().min(1).max(200).nullable().optional(),
  mpClientId: z.string().trim().min(1).max(100).optional(),
  reason: supportReasonSchema,
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireAdminSupportAccess(request, "users:security:write", {
      rateLimitKey: "user:identity-bind",
    });
    if (!access.ok) return access.response;
    const { id } = await params;
    if (!validateCUID(id)) return invalidIdResponse();
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return supportError("INVALID_PARAMS", parsed.error.issues[0]?.message || "参数错误");
    const input = parsed.data;
    if (input.mpClientId) {
      const client = await prisma.oAuthClient.findUnique({
        where: { clientId: input.mpClientId },
        select: { clientId: true },
      });
      if (!client) return supportError("INVALID_CLIENT", "来源小程序不存在");
    }
    const result = await prisma.$transaction(async (tx) => {
      const users = await tx.$queryRaw<
        {
          phone: string;
          status: string;
          wechatOpenId: string | null;
          wechatUnionId: string | null;
        }[]
      >`
        SELECT phone, status, "wechatOpenId", "wechatUnionId" FROM "User" WHERE id = ${id} FOR UPDATE
      `;
      const user = users[0];
      if (!user) throw new Error("USER_NOT_FOUND");
      if (user.status === "DELETED") throw new Error("USER_DELETED");
      const occupied = await tx.externalIdentity.findUnique({
        where: { provider_subjectId: { provider: input.provider, subjectId: input.subjectId } },
        select: { id: true, userId: true },
      });
      if (occupied && occupied.userId !== id) throw new Error("IDENTITY_OCCUPIED");
      if (
        user.wechatOpenId &&
        user.wechatOpenId !== input.subjectId &&
        input.provider.startsWith("wechat")
      ) {
        throw new Error("LEGACY_IDENTITY_CONFLICT");
      }
      if (user.wechatUnionId && input.unionId && user.wechatUnionId !== input.unionId) {
        throw new Error("UNION_ID_CONFLICT");
      }
      const identity =
        occupied ??
        (await tx.externalIdentity.create({
          data: {
            userId: id,
            provider: input.provider,
            subjectId: input.subjectId,
            unionId: input.unionId ?? null,
            metadata: input.mpClientId ? { mpClientId: input.mpClientId } : undefined,
          },
        }));
      if (input.provider.startsWith("wechat")) {
        await tx.user.update({
          where: { id },
          data: {
            ...(!user.wechatOpenId ? { wechatOpenId: input.subjectId } : {}),
            ...(!user.wechatUnionId && input.unionId ? { wechatUnionId: input.unionId } : {}),
          },
        });
      }
      await createAuditLogTx(tx, {
        action: "user_identity_bind",
        targetType: "user",
        targetId: id,
        detail: {
          identityId: identity.id,
          provider: input.provider,
          subjectId: input.subjectId,
          reason: input.reason,
        },
        actorType: "ADMIN",
        actorEmail: access.admin.email,
        actorName: access.admin.name,
        actorRole: access.admin.role,
        authMethod: "step_up",
        adminId: access.admin.id,
        request,
      });
      return { identity, phone: user.phone };
    });
    await enqueueSecurityActionNotification({
      userId: id,
      phone: result.phone,
      action: "第三方身份已绑定",
      reference: `identity-admin-bind:${result.identity.id}`,
    }).catch((error) => apiConsole.warn("[AdminIdentityBind] 通知入队失败:", error));
    return NextResponse.json({ success: true, data: { identity: result.identity } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return supportError("IDENTITY_OCCUPIED", "该外部身份已绑定其他账户", 409);
    }
    if (error instanceof Error) {
      const responses: Record<string, [string, string, number]> = {
        USER_NOT_FOUND: ["NOT_FOUND", "用户不存在", 404],
        USER_DELETED: ["USER_DELETED", "已注销用户不可绑定", 409],
        IDENTITY_OCCUPIED: ["IDENTITY_OCCUPIED", "该外部身份已绑定其他账户", 409],
        LEGACY_IDENTITY_CONFLICT: [
          "LEGACY_IDENTITY_CONFLICT",
          "该账户已有不同的微信 OpenID，请先通过账户合并预检处理",
          409,
        ],
        UNION_ID_CONFLICT: ["UNION_ID_CONFLICT", "UnionID 与账户现有值不一致", 409],
      };
      const matched = responses[error.message];
      if (matched) return supportError(...matched);
    }
    apiConsole.error("[AdminIdentityBind] 绑定失败:", error);
    return supportError("INTERNAL_ERROR", "外部身份绑定失败", 500);
  }
}
