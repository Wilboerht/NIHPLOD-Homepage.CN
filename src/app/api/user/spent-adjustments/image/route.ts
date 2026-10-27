/**
 * 私有凭证图片访问端点（用户端）
 * GET /api/user/spent-adjustments/image?key=<key>
 *
 * 仅允许凭证所属用户查看：验证登录态 + key 归属后：
 * - 本地私有对象：流式返回文件；
 * - 历史私有 OSS 对象：302 到短时效签名 URL。
 */
import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { verifyUserAuth } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";
import { resolveSpentProofImage } from "@/lib/spent-adjustment-files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
} as const;

export async function GET(request: NextRequest) {
  try {
    const payload = await verifyUserAuth(request);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const key = request.nextUrl.searchParams.get("key") ?? "";
    const result = await resolveSpentProofImage(payload.id, key);

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: { code: result.code, message: result.message } },
        { status: result.status, headers: NO_STORE_HEADERS }
      );
    }

    if (result.kind === "redirect") {
      return NextResponse.redirect(result.signedUrl, {
        status: 302,
        headers: NO_STORE_HEADERS,
      });
    }

    const fileStat = await stat(result.path);
    const stream = Readable.toWeb(createReadStream(result.path)) as unknown as ReadableStream;

    return new NextResponse(stream, {
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": result.contentType,
        "Content-Length": String(fileStat.size),
        "Content-Disposition": 'inline; filename="receipt.webp"',
      },
    });
  } catch (error) {
    apiConsole.error("[SpentAdjustment] 凭证图片访问失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
