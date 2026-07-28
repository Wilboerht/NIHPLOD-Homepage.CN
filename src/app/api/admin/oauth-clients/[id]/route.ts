/**
 * 管理端单个 OAuth Client API
 * GET    /api/admin/oauth-clients/[id] — 详情
 * PATCH  /api/admin/oauth-clients/[id] — 更新
 * DELETE /api/admin/oauth-clients/[id] — 软删除
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { getOAuthClientById, updateOAuthClient, deleteOAuthClient } from "@/lib/oauth-client";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const client = await getOAuthClientById(id);
    if (!client) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Client 不存在" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: { client } });
  } catch (error) {
    apiConsole.error("[AdminOAuthClient] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const admin = await verifyAuth(request);
    if (!admin || admin.role !== "owner") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可操作" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await context.params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const body = await request.json();
    const client = await updateOAuthClient(id, body);

    if (!client) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Client 不存在" } },
        { status: 404 }
      );
    }

    await createAuditLog({
      action: "oauth_client_update",
      targetType: "oauth_client",
      targetId: id,
      detail: { changes: body, clientId: client.clientId },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({ success: true, data: { client } });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }
    apiConsole.error("[AdminOAuthClient PATCH] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const admin = await verifyAuth(request);
    if (!admin || admin.role !== "owner") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可操作" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await context.params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const client = await getOAuthClientById(id);
    if (!client) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Client 不存在" } },
        { status: 404 }
      );
    }

    await deleteOAuthClient(id);

    await createAuditLog({
      action: "oauth_client_delete",
      targetType: "oauth_client",
      targetId: id,
      detail: { clientId: client.clientId, name: client.name },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({ success: true, data: { message: "Client 已删除" } });
  } catch (error) {
    apiConsole.error("[AdminOAuthClient DELETE] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
