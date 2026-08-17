import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";

const mockRecordSsoEvent = vi.fn();
const globalFetch = vi.fn();

global.fetch = globalFetch as unknown as typeof fetch;

vi.mock("@/lib/logger", () => ({
  apiConsole: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/sso-audit", () => ({
  recordSsoEvent: (...args: unknown[]) => mockRecordSsoEvent(...args),
}));

import {
  dispatchStatusChangeWebhook,
  getStatusChangeWebhookTargets,
  signWebhookPayload,
} from "@/lib/webhook";

const change = { userId: "user-1", oldStatus: "active", newStatus: "banned", source: "admin" };
const target = {
  url: "https://sub.example.com/webhook",
  clientId: "sub-app",
  clientName: "Sub App",
};

describe("webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalFetch.mockResolvedValue({ ok: true, status: 200 });
    delete process.env.SSO_WEBHOOK_SECRET;
    delete process.env.SSO_STATUS_CHANGE_WEBHOOK_URLS;
  });

  afterEach(() => {
    delete process.env.SSO_WEBHOOK_SECRET;
    delete process.env.SSO_STATUS_CHANGE_WEBHOOK_URLS;
  });

  it("signWebhookPayload 应生成 <ts>.<payload> 的 HMAC-SHA256 hex", () => {
    const body = JSON.stringify({ event: "account_status_change" });
    const expected = createHmac("sha256", "secret-1").update(`1700000000.${body}`).digest("hex");
    expect(signWebhookPayload("secret-1", 1700000000, body)).toBe(expected);
  });

  it("配置 SSO_WEBHOOK_SECRET 时应携带 X-Webhook-Signature 且可验证", async () => {
    process.env.SSO_WEBHOOK_SECRET = "env-secret";

    await dispatchStatusChangeWebhook(change, [target]);

    expect(globalFetch).toHaveBeenCalledTimes(1);
    const [url, init] = globalFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(target.url);
    const headers = init.headers as Record<string, string>;
    const signature = headers["X-Webhook-Signature"];
    expect(signature).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);

    const t = Number(signature.split(",")[0].slice(2));
    const v1 = signature.split(",")[1].slice(3);
    const expected = createHmac("sha256", "env-secret")
      .update(`${t}.${init.body as string}`)
      .digest("hex");
    expect(v1).toBe(expected);

    // payload 携带事件类型与 timestamp
    const payload = JSON.parse(init.body as string);
    expect(payload.event).toBe("account_status_change");
    expect(payload.sub).toBe("user-1");
    expect(payload.new_status).toBe("banned");
    expect(payload.timestamp).toEqual(expect.any(String));
  });

  it("目标级 secret 优先于环境变量", async () => {
    process.env.SSO_WEBHOOK_SECRET = "env-secret";

    await dispatchStatusChangeWebhook(change, [{ ...target, secret: "target-secret" }]);

    const [, init] = globalFetch.mock.calls[0] as [string, RequestInit];
    const signature = (init.headers as Record<string, string>)["X-Webhook-Signature"];
    const t = signature.split(",")[0].slice(2);
    const expected = createHmac("sha256", "target-secret")
      .update(`${t}.${init.body as string}`)
      .digest("hex");
    expect(signature).toBe(`t=${t},v1=${expected}`);
  });

  it("未配置密钥时不带签名头", async () => {
    await dispatchStatusChangeWebhook(change, [target]);

    const [, init] = globalFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-Webhook-Signature"]).toBeUndefined();
  });

  it("投递失败重试耗尽后记录失败审计", async () => {
    vi.useFakeTimers();
    try {
      globalFetch.mockResolvedValue({ ok: false, status: 500 });

      const promise = dispatchStatusChangeWebhook(change, [target]);
      await vi.advanceTimersByTimeAsync(30000);
      await promise;

      // 初次 + 3 次重试
      expect(globalFetch).toHaveBeenCalledTimes(4);
      expect(mockRecordSsoEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "status_change",
          userId: "user-1",
          clientId: "sub-app",
          success: false,
          detail: expect.objectContaining({ error: "max_retries_exceeded" }),
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("投递成功时记录成功审计", async () => {
    await dispatchStatusChangeWebhook(change, [target]);

    expect(mockRecordSsoEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "status_change",
        userId: "user-1",
        clientId: "sub-app",
        success: true,
      })
    );
  });

  it("空目标列表时不发送请求", async () => {
    await dispatchStatusChangeWebhook(change, []);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("getStatusChangeWebhookTargets 解析逗号分隔的 URL 列表", () => {
    expect(getStatusChangeWebhookTargets()).toEqual([]);

    process.env.SSO_STATUS_CHANGE_WEBHOOK_URLS =
      " https://a.example.com/hook , https://b.example.com/hook ";
    const targets = getStatusChangeWebhookTargets();
    expect(targets).toHaveLength(2);
    expect(targets[0]).toEqual({
      url: "https://a.example.com/hook",
      clientId: "a.example.com",
      clientName: "a.example.com",
    });
  });
});
