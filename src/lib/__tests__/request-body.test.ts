import { describe, expect, it } from "vitest";
import {
  BodyTooLargeError,
  parseAdminJsonBody,
  readJsonBody,
  readJsonBodyOrDefault,
} from "../request-body";

function chunkedRequest(chunks: string[]): Request {
  const encoder = new TextEncoder();
  return new Request("http://localhost/upload", {
    method: "POST",
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    duplex: "half",
  } as RequestInit);
}

describe("request-body", () => {
  it("在限制内读取 JSON", async () => {
    const request = new Request("http://localhost/test", {
      method: "POST",
      body: JSON.stringify({ ok: true }),
      headers: { "content-type": "application/json" },
    });
    await expect(readJsonBody(request, 1024)).resolves.toEqual({ ok: true });
  });

  it("Content-Length 超限时拒绝，不读取 body", async () => {
    const request = new Request("http://localhost/test", {
      method: "POST",
      body: "{}",
      headers: { "content-length": "2048", "content-type": "application/json" },
    });
    await expect(readJsonBody(request, 1024)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("chunked 请求超过上限时流式拒绝", async () => {
    const request = chunkedRequest(["a".repeat(600), "b".repeat(600)]);
    await expect(readJsonBody(request, 1024)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("parseAdminJsonBody 对合法 JSON 返回 ok", async () => {
    const request = new Request("http://localhost/test", {
      method: "POST",
      body: JSON.stringify({ ok: true }),
      headers: { "content-type": "application/json" },
    });

    await expect(parseAdminJsonBody(request)).resolves.toEqual({ ok: true, data: { ok: true } });
  });

  it("parseAdminJsonBody 对非法 JSON 返回 400", async () => {
    const request = new Request("http://localhost/test", { method: "POST", body: "not-json" });

    const result = await parseAdminJsonBody(request);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  });

  it("parseAdminJsonBody 对超限请求返回 413", async () => {
    const request = new Request("http://localhost/test", {
      method: "POST",
      body: "{}",
      headers: { "content-length": String(3 * 1024 * 1024) },
    });

    const result = await parseAdminJsonBody(request);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });

  it("格式错误返回 fallback，但超限错误不会被吞掉", async () => {
    const bad = new Request("http://localhost/test", { method: "POST", body: "not-json" });
    await expect(readJsonBodyOrDefault(bad, 1024, { fallback: true })).resolves.toEqual({
      fallback: true,
    });

    const huge = new Request("http://localhost/test", {
      method: "POST",
      body: "not-json",
      headers: { "content-length": "2048" },
    });
    await expect(readJsonBodyOrDefault(huge, 1024, { fallback: true })).rejects.toBeInstanceOf(
      BodyTooLargeError
    );
  });
});
