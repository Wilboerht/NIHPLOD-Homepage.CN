/**
 * POST /api/oss/sign
 *
 * 已下线：旧的 OSS PUT 预签名无法限制实际上传大小，已存在存储成本滥用风险。
 * 主站不再签发任何直传 PUT 签名；上传统一走服务端处理（/api/upload、
 * /api/user/profile、/api/oauth/userinfo/avatar 等）或子站 PostObject policy。
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GONE_RESPONSE = {
  success: false,
  error: {
    code: "ENDPOINT_GONE",
    message: "该上传签名端点已下线，请使用服务端上传接口",
  },
} as const;

export async function POST() {
  return NextResponse.json(GONE_RESPONSE, {
    status: 410,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  return NextResponse.json(GONE_RESPONSE, {
    status: 410,
    headers: { "Cache-Control": "no-store" },
  });
}
