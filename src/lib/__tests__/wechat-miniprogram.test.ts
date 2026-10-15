/**
 * wechat.ts 多小程序凭证与 access_token 缓存测试
 * 覆盖：显式凭证传递（code2session / getMiniprogramPhone）、
 * 按 appId 隔离的 token 缓存、未配置凭证抛错
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { code2session, getMiniprogramPhone, sendMiniprogramSubscribeMessage } from "@/lib/wechat";

const fetchMock = vi.fn();

function tokenResponse(accessToken: string) {
  return { ok: true, json: async () => ({ access_token: accessToken, expires_in: 7200 }) };
}
function phoneResponse(phone: string) {
  return { ok: true, json: async () => ({ phone_info: { purePhoneNumber: phone } }) };
}

const CRED_A = { appId: "wxaaaaaaaaaaaaaaaa", appSecret: "secret-a-0123456789abcdef" };
const CRED_B = { appId: "wxbbbbbbbbbbbbbbbb", appSecret: "secret-b-0123456789abcdef" };
const CRED_C = { appId: "wxcccccccccccccccc", appSecret: "secret-c-0123456789abcdef" };
const CRED_D = { appId: "wxdddddddddddddddd", appSecret: "secret-d-0123456789abcdef" };
const CRED_E = { appId: "wxeeeeeeeeeeeeeeee", appSecret: "secret-e-0123456789abcdef" };

function tokenCalls() {
  return fetchMock.mock.calls.filter((c) => String(c[0]).includes("/cgi-bin/token"));
}

describe("wechat.ts 多小程序凭证", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("code2session 使用传入凭证的 appId", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ openid: "openid-a", unionid: "union-a", session_key: "sk" }),
    });

    const info = await code2session("code-1", CRED_A);

    expect(info.openid).toBe("openid-a");
    expect(String(fetchMock.mock.calls[0][0])).toContain(`appid=${CRED_A.appId}`);
  });

  it("getMiniprogramPhone：按凭证取 token 并缓存（同 appId 二次调用不再取 token）", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse("tok-a"))
      .mockResolvedValueOnce(phoneResponse("13800138000"))
      .mockResolvedValueOnce(phoneResponse("13800138001"));

    expect(await getMiniprogramPhone("pc-1", CRED_A)).toBe("13800138000");
    expect(await getMiniprogramPhone("pc-2", CRED_A)).toBe("13800138001");

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(tokenCalls()).toHaveLength(1);
    expect(urls.filter((u) => u.includes("getuserphonenumber"))).toHaveLength(2);
    expect(urls[0]).toContain(`appid=${CRED_A.appId}`);
  });

  it("不同 appId 的 access_token 缓存相互隔离", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse("tok-b"))
      .mockResolvedValueOnce(phoneResponse("13800138002"))
      .mockResolvedValueOnce(tokenResponse("tok-c"))
      .mockResolvedValueOnce(phoneResponse("13800138003"));

    expect(await getMiniprogramPhone("pc-3", CRED_B)).toBe("13800138002");
    expect(await getMiniprogramPhone("pc-4", CRED_C)).toBe("13800138003");

    expect(tokenCalls()).toHaveLength(2);
  });

  it("未传凭证且未配置旧变量时应抛错", async () => {
    const savedId = process.env.WECHAT_MINIPROGRAM_APP_ID;
    const savedSecret = process.env.WECHAT_MINIPROGRAM_APP_SECRET;
    const savedFallbackId = process.env.WECHAT_APP_ID;
    const savedFallbackSecret = process.env.WECHAT_APP_SECRET;
    delete process.env.WECHAT_MINIPROGRAM_APP_ID;
    delete process.env.WECHAT_MINIPROGRAM_APP_SECRET;
    delete process.env.WECHAT_APP_ID;
    delete process.env.WECHAT_APP_SECRET;
    try {
      await expect(getMiniprogramPhone("pc-x")).rejects.toThrow("未配置");
    } finally {
      if (savedId !== undefined) process.env.WECHAT_MINIPROGRAM_APP_ID = savedId;
      if (savedSecret !== undefined) process.env.WECHAT_MINIPROGRAM_APP_SECRET = savedSecret;
      if (savedFallbackId !== undefined) process.env.WECHAT_APP_ID = savedFallbackId;
      if (savedFallbackSecret !== undefined) process.env.WECHAT_APP_SECRET = savedFallbackSecret;
    }
  });

  it("sendMiniprogramSubscribeMessage：成功时 POST body 含 touser/template_id/page/data", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse("tok-sub-d"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ errcode: 0, errmsg: "ok" }) });

    const result = await sendMiniprogramSubscribeMessage({
      openid: "openid-1",
      templateId: "tmpl-1",
      page: "pages/records/records",
      data: { thing1: { value: "面霜小样" } },
      credentials: CRED_D,
    });

    expect(result).toEqual({ ok: true, errcode: 0, errmsg: "ok" });
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toContain("/cgi-bin/message/subscribe/send");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      touser: "openid-1",
      template_id: "tmpl-1",
      page: "pages/records/records",
      data: { thing1: { value: "面霜小样" } },
    });
  });

  it("sendMiniprogramSubscribeMessage：用户未订阅（43101）返回 ok=false（不抛错）", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse("tok-sub-e"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ errcode: 43101, errmsg: "user refuse to accept the msg" }),
      });

    const result = await sendMiniprogramSubscribeMessage({
      openid: "openid-2",
      templateId: "tmpl-1",
      data: { thing1: { value: "x" } },
      credentials: CRED_E,
    });

    expect(result.ok).toBe(false);
    expect(result.errcode).toBe(43101);
  });
});
