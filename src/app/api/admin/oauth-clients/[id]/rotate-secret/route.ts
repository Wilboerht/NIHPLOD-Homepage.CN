/**
 * OAuth Client 密钥轮换 API
 * POST /api/admin/oauth-clients/[id]/rotate-secret
 *
 * 安全特性：
 * - 仅 owner 角色可操作
 * - CSRF 校验 + confirm 二次确认
 * - 旧 secret 缓存 5 分钟过渡期（允许使用旧 secret 完成进行中的授权）
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { cacheOldSecret } from "@/lib/oauth-client";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { apiConsole } from "@/lib/logger";
import { z } from "zod";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

const rotateSchema = z.object({
  confirm: z.literal(true, {
    message: "必须确认密钥轮换操作（confirm: true）" as const,
  }),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    if (admin.role !== "owner") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可轮换密钥" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "oauth-rotate-secret");
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const body = await request.json();
    const parsed = rotateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }

    // 查找 client
    const client = await prisma.oAuthClient.findUnique({
      where: { id },
      select: { id: true, clientId: true, name: true, clientSecret: true },
    });

    if (!client) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Client 不存在" } },
        { status: 404 }
      );
    }

    // 生成新 secret（64 字节随机 base64url，~86 字符，远优于 UUID 格式）
    const newPlainSecret = randomBytes(64).toString("base64url");
    const bcrypt = await import("bcryptjs");
    const newHash = await bcrypt.hash(newPlainSecret, 12);

    // 缓存旧 hash（5 分钟过渡期）
    cacheOldSecret(client.clientId, client.clientSecret);

    // 写入新 hash
    await prisma.oAuthClient.update({
      where: { id },
      data: { clientSecret: newHash },
    });

    await createAuditLog({
      action: "oauth_client_rotate_secret",
      targetType: "oauth_client",
      targetId: client.id,
      detail: { clientId: client.clientId, name: client.name },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({
      success: true,
      data: {
        // 明文 secret 仅在轮换时返回一次
        plainSecret: newPlainSecret,
        message: "密钥已轮换，旧密钥将在 5 分钟内失效",
      },
    });
  } catch (error) {
    apiConsole.error("[OAuthRotateSecret] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
