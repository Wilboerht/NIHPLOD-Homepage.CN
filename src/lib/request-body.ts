/**
 * 有上限的请求体读取工具。
 *
 * 说明：Next.js Route Handler 没有默认 body size limit。middleware 的
 * Content-Length 检查只能覆盖普通请求；本模块通过流式读取为 chunked /
 * 缺失 Content-Length 的请求提供硬上限，避免一次性把超大 body 缓冲进内存。
 */
import { NextResponse } from "next/server";

export class BodyTooLargeError extends Error {
  readonly code = "PAYLOAD_TOO_LARGE";
  readonly status = 413;
  readonly limit: number;

  constructor(limit: number) {
    super(`请求体超过上限（${limit} 字节）`);
    this.name = "BodyTooLargeError";
    this.limit = limit;
  }
}

export function isBodyTooLargeError(error: unknown): error is BodyTooLargeError {
  return error instanceof BodyTooLargeError;
}

export function payloadTooLargeResponse(limit?: number): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: limit ? `请求体超过上限（${limit} 字节）` : "请求体过大",
      },
    },
    { status: 413 }
  );
}

function assertContentLength(headers: Headers, maxBytes: number): void {
  const raw = headers.get("content-length");
  if (!raw) return;
  const value = Number(raw);
  if (Number.isFinite(value) && value > maxBytes) {
    throw new BodyTooLargeError(maxBytes);
  }
}

async function readBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  assertContentLength(request.headers, maxBytes);

  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new BodyTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

export async function readTextBody(
  request: Request,
  maxBytes: number
): Promise<string> {
  const bytes = await readBytes(request, maxBytes);
  return new TextDecoder().decode(bytes);
}

/** 内部 API 统一 1MB 上限（签名校验前也不能无界缓冲 body）。 */
export function readInternalApiBody(request: Request): Promise<string> {
  return readTextBody(request, 1024 * 1024);
}

export async function readJsonBody<T = unknown>(
  request: Request,
  maxBytes: number
): Promise<T> {
  const text = await readTextBody(request, maxBytes);
  return JSON.parse(text) as T;
}

/**
 * 解析失败时返回 fallback，但请求体超限仍抛 BodyTooLargeError，
 * 防止调用方把 DoS 当成普通格式错误静默吞掉。
 */
export async function readJsonBodyOrDefault<T>(
  request: Request,
  maxBytes: number,
  fallback: T
): Promise<T> {
  try {
    return await readJsonBody<T>(request, maxBytes);
  } catch (error) {
    if (isBodyTooLargeError(error)) throw error;
    return fallback;
  }
}

export async function readFormDataBody(
  request: Request,
  maxBytes: number
): Promise<FormData> {
  const bytes = await readBytes(request, maxBytes);
  const contentType = request.headers.get("content-type");
  if (!contentType) {
    throw new Error("缺少 Content-Type");
  }

  const bounded = new Request("http://internal.invalid/body", {
    method: "POST",
    headers: { "content-type": contentType },
    body: bytes.buffer as ArrayBuffer,
  });
  return bounded.formData();
}
