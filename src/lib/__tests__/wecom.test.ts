/**
 * 企业微信 Webhook 分发测试
 * 覆盖：综合管理群接收全部通知、运营群仅接收留言/积分申请/兑换申请、
 *       招聘群接收求职、同地址去重、部分失败与未配置场景。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { resolveWecomWebhookUrls, sendWecomNotification } from "@/lib/wecom";
import type { WecomNotificationType } from "@/lib/wecom";

const BOSS = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=boss";
const OPS = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=ops";
const JOBS = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=jobs";

const fetchMock = vi.fn();

function stubWebhooks(webhooks: { boss?: string; ops?: string; jobs?: string }): void {
  vi.stubEnv("WECOM_BOT_WEBHOOK", webhooks.boss ?? "");
  vi.stubEnv("WECOM_OPS_WEBHOOK", webhooks.ops ?? "");
  vi.stubEnv("WECOM_JOBS_WEBHOOK", webhooks.jobs ?? "");
}

describe("resolveWecomWebhookUrls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("综合管理群接收全部类型；未配置运营/招聘群时不追加", () => {
    stubWebhooks({ boss: BOSS });

    const types: WecomNotificationType[] = ["admin", "contact", "job", "points", "redemption"];
    for (const type of types) {
      expect(resolveWecomWebhookUrls(type)).toEqual([BOSS]);
    }
  });

  it("运营群接收留言、积分申请、兑换申请", () => {
    stubWebhooks({ boss: BOSS, ops: OPS });

    expect(resolveWecomWebhookUrls("contact")).toEqual([BOSS, OPS]);
    expect(resolveWecomWebhookUrls("points")).toEqual([BOSS, OPS]);
    expect(resolveWecomWebhookUrls("redemption")).toEqual([BOSS, OPS]);
    expect(resolveWecomWebhookUrls("admin")).toEqual([BOSS]);
    expect(resolveWecomWebhookUrls("job")).toEqual([BOSS]);
  });

  it("招聘群接收求职申请，综合管理群同时保留", () => {
    stubWebhooks({ boss: BOSS, jobs: JOBS });

    expect(resolveWecomWebhookUrls("job")).toEqual([BOSS, JOBS]);
    expect(resolveWecomWebhookUrls("contact")).toEqual([BOSS]);
  });

  it("运营群与综合管理群配置相同地址时去重", () => {
    stubWebhooks({ boss: BOSS, ops: BOSS, jobs: BOSS });

    expect(resolveWecomWebhookUrls("contact")).toEqual([BOSS]);
    expect(resolveWecomWebhookUrls("job")).toEqual([BOSS]);
  });
});

describe("sendWecomNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue({ json: async () => ({ errcode: 0 }) });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("按路由向综合管理群与运营群发送同一内容", async () => {
    stubWebhooks({ boss: BOSS, ops: OPS });

    const result = await sendWecomNotification("hello", "points");

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([BOSS, OPS]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).markdown.content).toBe("hello");
  });

  it("未配置任何 webhook 时返回失败且不请求", async () => {
    stubWebhooks({});

    const result = await sendWecomNotification("hello", "admin");

    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("任一目标失败时返回失败并携带错误", async () => {
    stubWebhooks({ boss: BOSS, ops: OPS });
    fetchMock
      .mockResolvedValueOnce({ json: async () => ({ errcode: 0 }) })
      .mockResolvedValueOnce({ json: async () => ({ errcode: 93000, errmsg: "invalid" }) });

    const result = await sendWecomNotification("hello", "contact");

    expect(result.success).toBe(false);
    expect(result.error).toContain("invalid");
  });
});
