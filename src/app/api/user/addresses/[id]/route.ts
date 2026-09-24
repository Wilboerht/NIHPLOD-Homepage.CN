/**
 * 用户收货地址单条操作 API
 * PATCH  /api/user/addresses/[id] - 编辑地址（isDefault=true 时取消其他默认）
 * DELETE /api/user/addresses/[id] - 删除地址（删除默认地址时自动将最早一条设为默认）
 *
 * 数据操作与 OAuth 资源端点（/api/oauth/addresses/[id]）共用。
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuth } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { updateAddressResponse, deleteAddressResponse } from "@/lib/points-mall-api";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  const user = await verifyUserAuth(request);
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  return updateAddressResponse(user.id, id, request);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  const user = await verifyUserAuth(request);
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  return deleteAddressResponse(user.id, id);
}
