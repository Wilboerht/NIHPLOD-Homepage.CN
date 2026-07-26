/**
 * 管理端 OAuth Client CRUD API
 * GET  /api/admin/oauth-clients — 分页列表
 * POST /api/admin/oauth-clients — 创建新 Client
 *
 * 权限：仅 owner 角色可操作
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { createOAuthClient, listOAuthClients } from "@/lib/oauth-client";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
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
        { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可管理 OAuth Client" } },
        { status: 403 }
      );
    }

    const { searchParams } = request.nextUrl;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "20", 10), 100);

    const result = await listOAuthClients({ page, pageSize });

    return NextResponse.json({
      success: true,
      data: {
        clients: result.clients,
        pagination: { page, pageSize, total: result.total },
      },
    });
  } catch (error) {
    apiConsole.error("[AdminOAuthClients] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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
        { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可管理 OAuth Client" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const result = await createOAuthClient(body);

    await createAuditLog({
      action: "oauth_client_create",
      targetType: "oauth_client",
      targetId: result.client.id,
      detail: { name: result.client.name, clientId: result.client.clientId },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({
      success: true,
      data: {
        client: result.client,
        // 明文 secret 仅在创建时返回一次
        plainSecret: result.plainSecret,
      },
    });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误", details: error.issues } },
        { status: 400 }
      );
    }
    apiConsole.error("[AdminOAuthClients POST] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
