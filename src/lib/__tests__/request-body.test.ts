import { describe, expect, it } from "vitest";
import { BodyTooLargeError, readJsonBody, readJsonBodyOrDefault } from "../request-body";

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
