import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  canonicalizeQuery,
  checkAndRecordNonce,
  hashRequestBody,
  isProjectAllowed,
  isTimestampValid,
  verifyInternalApiSignature,
} from "@/lib/internal-api";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

const PATH = "/api/internal/legal/content-hash";
const ALLOWED_PROJECTS = ["advisor"] as const;
const DOCUMENT_MAP = {
  PRIVACY: "privacy",
  TERMS: "terms",
} as const;

function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(request: NextRequest) {
  const key = request.headers.get("x-internal-api-key");
  const signature = request.headers.get("x-internal-api-signature");
  const timestampHeader = request.headers.get("x-internal-api-timestamp");
  const nonce = request.headers.get("x-internal-api-nonce");
  if (!key || !signature || !timestampHeader || !nonce) {
    return jsonError("MISSING_AUTH", "缺少鉴权头", 401);
  }

  const timestamp = parseInt(timestampHeader, 10);
  if (Number.isNaN(timestamp) || !isTimestampValid(timestamp)) {
    return jsonError("INVALID_TIMESTAMP", "请求时间戳无效或已过期", 401);
  }

  const config = verifyInternalApiSignature(
    key,
    signature,
    "GET",
    PATH,
    timestamp,
    nonce,
    await hashRequestBody(""),
    { query: canonicalizeQuery(new URL(request.url).search) }
  );
  if (!config) {
    return jsonError("UNAUTHORIZED", "签名验证失败", 401);
  }
  if (!isProjectAllowed(config, ALLOWED_PROJECTS)) {
    return jsonError("FORBIDDEN_PROJECT", "无权访问此端点", 403);
  }
  if (!(await checkAndRecordNonce(nonce))) {
    return jsonError("REPLAY_ATTACK", "重复请求 nonce", 401);
  }

  const requested = request.nextUrl.searchParams.get("document") ?? "";
  const document = DOCUMENT_MAP[requested as keyof typeof DOCUMENT_MAP];
  if (!document) {
    return jsonError("INVALID_PARAMS", "document 无效", 400);
  }

  try {
    const legalDocument = await prisma.legalDocument.findUnique({
      where: { slug: document },
      select: { id: true, publishedVersion: true, publishedAt: true },
    });
    if (!legalDocument || legalDocument.publishedVersion < 1) {
      return jsonError("NOT_FOUND", "政策尚未发布", 404);
    }

    const version = await prisma.legalDocumentVersion.findUnique({
      where: {
        documentId_version: {
          documentId: legalDocument.id,
          version: legalDocument.publishedVersion,
        },
      },
      select: { contentHash: true },
    });
    if (!version?.contentHash) {
      return jsonError("NOT_FOUND", "政策内容哈希不存在", 404);
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          document: requested,
          version: legalDocument.publishedVersion,
          contentHash: version.contentHash,
          publishedAt: legalDocument.publishedAt?.toISOString() ?? null,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    apiConsole.error("[InternalLegalContentHash] 查询失败:", error);
    return jsonError("INTERNAL_ERROR", "服务器错误", 500);
  }
}
