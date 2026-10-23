import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import AdmZip from "adm-zip";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    user: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    externalIdentity: { findMany: vi.fn().mockResolvedValue([]) },
    oAuthClient: { findMany: vi.fn().mockResolvedValue([]) },
    pointLedger: { findMany: vi.fn().mockResolvedValue([]) },
    pointRedemption: { findMany: vi.fn().mockResolvedValue([]) },
    userAddress: { findMany: vi.fn().mockResolvedValue([]) },
    spentAdjustmentApplication: { findMany: vi.fn().mockResolvedValue([]) },
    membershipLevelChange: { findMany: vi.fn().mockResolvedValue([]) },
    loginAttempt: { findMany: vi.fn().mockResolvedValue([]) },
    accountDeletionRequest: { findMany: vi.fn().mockResolvedValue([]) },
  };
  return { prisma, default: prisma };
});

vi.mock("@/lib/auth", () => ({ verifyAuth: vi.fn() }));
vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("@/lib/audit", () => ({
  beginAuditLog: vi.fn().mockResolvedValue("audit-1"),
  finishAuditLog: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/advisor-internal", () => ({ advisorRequest: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { GET } from "../route";
import { verifyAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { advisorRequest } from "@/lib/advisor-internal";

const NOW = new Date("2024-01-02T03:04:05.000Z");
const OWNER = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };
const FINANCE = { id: "admin-2", email: "finance@test.com", name: "Finance", role: "finance" };

const USER = {
  id: "user-1",
  phone: "13800138000",
  phoneVerified: true,
  nickname: "张三",
  avatar: "https://example.com/avatar.jpg",
  gender: "male",
  status: "ACTIVE",
  membershipLevel: "GOLD",
  totalSpent: 12345,
  silverActivatedAt: NOW,
  goldActivatedAt: NOW,
  diamondActivatedAt: null,
  wechatOpenId: "openid-123456",
  wechatUnionId: "union-123456",
  birthday: NOW,
  birthdayLocked: true,
  createdAt: NOW,
  updatedAt: NOW,
  pointBalance: { available: 100, updatedAt: NOW },
  accountDeletionRequest: { status: "FAILED" },
  _count: {
    externalIdentities: 1,
    pointLedger: 1,
    pointRedemptions: 1,
    addresses: 1,
    spentAdjustmentApplications: 1,
    membershipLevelChanges: 1,
    loginAttempts: 1,
  },
};

const SESSION = {
  sessionId: "session-1",
  completedAt: NOW.toISOString(),
  analysisResult: {
    faceAnalysis: { overallScore: 88, skinAge: 28 },
    skinProfile: { typeLabel: "混合肌", concerns: ["干燥"] },
  },
};

const DIARY = {
  id: "diary-1",
  date: NOW.toISOString(),
  skinState: "good",
  tags: ["补水"],
  note: "状态不错",
  sessionId: "session-1",
};

const OVERVIEW = {
  account: {
    role: "user",
    dailyTestLimit: 10,
    createdAt: NOW.toISOString(),
    lastActiveAt: NOW.toISOString(),
  },
  usage: {
    level: "GOLD",
    totalUsed: 5,
    todayUsed: 1,
    quota: { dailyLimit: 3, lifetimeLimit: null, unlimited: false },
    remaining: 2,
    todayCheckedIn: true,
  },
  counts: { sessions: 1, completedSessions: 1, diaryEntries: 1 },
  recentSessions: [],
  recentDiary: [],
};

function createRequest(query = "") {
  return new NextRequest(`http://localhost/api/admin/users/export${query}`, {
    method: "GET",
  } as never);
}

const mockUserFindMany = prisma.user.findMany as ReturnType<typeof vi.fn>;
const mockUserCount = prisma.user.count as ReturnType<typeof vi.fn>;

function setupData() {
  mockUserFindMany.mockImplementation((args: { select?: Record<string, unknown> }) => {
    const select = args.select ?? {};
    if ("phone" in select) return Promise.resolve([USER]);
    if ("membershipLevel" in select) {
      return Promise.resolve([
        {
          id: USER.id,
          createdAt: USER.createdAt,
          membershipLevel: USER.membershipLevel,
          totalSpent: USER.totalSpent,
        },
      ]);
    }
    return Promise.resolve([{ id: USER.id, createdAt: USER.createdAt }]);
  });
  mockUserCount.mockResolvedValue(1);
  vi.mocked(prisma.externalIdentity.findMany).mockResolvedValue([
    {
      id: "identity-1",
      userId: USER.id,
      provider: "wechat_mp",
      subjectId: "subject-123456",
      unionId: "union-123456",
      metadata: { mpClientId: "mp-1", nickname: "微信昵称" },
      createdAt: NOW,
      updatedAt: NOW,
    },
  ] as never);
  vi.mocked(prisma.oAuthClient.findMany).mockResolvedValue([
    { clientId: "mp-1", name: "积分商城小程序" },
  ] as never);
  vi.mocked(prisma.pointLedger.findMany).mockResolvedValue([
    {
      id: "ledger-1",
      userId: USER.id,
      type: "CONSUME",
      amount: 100,
      remaining: 80,
      reference: "order-1",
      note: "消费发放",
      frozenUntil: null,
      releasedAt: NOW,
      expiresAt: null,
      createdAt: NOW,
    },
  ] as never);
  vi.mocked(prisma.pointRedemption.findMany).mockResolvedValue([
    {
      id: "redemption-1",
      userId: USER.id,
      productId: null,
      productName: "面霜",
      priceYuan: 100,
      points: 100,
      level: "GOLD",
      redeemRate: 1.5,
      clientId: "mp-1",
      status: "FULFILLED",
      reference: "redeem-1",
      recipient: "张三",
      phone: "13900139000",
      address: "上海市普陀区某路 1 号",
      carrier: "SF",
      waybillNo: "SF123456",
      fulfilledAt: NOW,
      cancelledAt: null,
      cancelNote: null,
      createdAt: NOW,
    },
  ] as never);
  vi.mocked(prisma.userAddress.findMany).mockResolvedValue([
    {
      id: "address-1",
      userId: USER.id,
      recipient: "张三",
      phone: "13900139000",
      region: "上海市普陀区",
      detail: "某路 1 号 101 室",
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ] as never);
  vi.mocked(prisma.spentAdjustmentApplication.findMany).mockResolvedValue([
    {
      id: "spent-1",
      userId: USER.id,
      channel: "TMALL",
      orderNo: "ORDER-123456",
      dealerName: "官方旗舰店",
      amountClaimed: 500,
      purchasedAt: NOW,
      images: ["spent-adjustments/proof-1.jpg"],
      note: "消费补录",
      status: "APPROVED",
      reviewAmount: 500,
      reviewNote: "通过",
      reviewedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
      reviewedBy: { name: "审核员", email: "review@test.com" },
    },
  ] as never);
  vi.mocked(prisma.membershipLevelChange.findMany).mockResolvedValue([
    {
      id: "level-1",
      userId: USER.id,
      fromLevel: "SILVER",
      toLevel: "GOLD",
      reference: "order-1",
      note: "累计消费达标",
      createdAt: NOW,
    },
  ] as never);
  vi.mocked(prisma.loginAttempt.findMany).mockResolvedValue([
    {
      id: "login-1",
      userId: USER.id,
      type: "password",
      success: true,
      reason: null,
      ipAddress: "1.2.3.4",
      userAgent: "Mozilla/5.0",
      clientId: "mp-1",
      createdAt: NOW,
    },
  ] as never);
  vi.mocked(prisma.accountDeletionRequest.findMany).mockResolvedValue([
    {
      id: "deletion-1",
      userId: USER.id,
      status: "FAILED",
      reason: "用户申请",
      requestedAt: NOW,
      scheduledAt: NOW,
      cancelledAt: null,
      completedAt: null,
      attempts: 1,
      lastError: "子站不可达",
    },
  ] as never);
}

function mockAdvisorOk() {
  vi.mocked(advisorRequest).mockImplementation(async (path: string) => {
    if (path.includes("user-overview")) {
      return { ok: true, status: 200, data: { data: OVERVIEW } } as never;
    }
    if (path.includes("test-history")) {
      return {
        ok: true,
        status: 200,
        data: { history: [SESSION], pagination: { totalPages: 1 } },
      } as never;
    }
    if (path.includes("diary")) {
      return {
        ok: true,
        status: 200,
        data: { data: [DIARY], pagination: { hasMore: false } },
      } as never;
    }
    return { ok: false, status: 500, code: "UPSTREAM_ERROR", message: "unexpected" } as never;
  });
}

function zipEntries(buffer: Buffer): Map<string, string> {
  const zip = new AdmZip(buffer);
  return new Map(
    zip.getEntries().map((entry) => [entry.entryName, entry.getData().toString("utf8")])
  );
}

async function readResponse(response: Response) {
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, entries: zipEntries(buffer) };
}

describe("GET /api/admin/users/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
    vi.mocked(beginAuditLog).mockResolvedValue("audit-1");
    vi.mocked(finishAuditLog).mockResolvedValue(true);
    setupData();
    mockAdvisorOk();
  });

  it("check=1 返回导出预检且不写审计", async () => {
    const res = await GET(createRequest("?check=1&include=profile,identities"));
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.data.total).toBe(1);
    expect(payload.data.groups).toEqual(["profile", "identities"]);
    expect(payload.data.files).toContain("users.csv");
    expect(beginAuditLog).not.toHaveBeenCalled();
  });

  it("生成默认业务数据 ZIP，包含 BOM、完整手机号和所有明细文件", async () => {
    const res = await GET(
      createRequest(
        "?include=profile,identities,points,redemptions,addresses,spent,growth,logins,deletions"
      )
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    expect(res.headers.get("Cache-Control")).toContain("no-store");

    const { entries } = await readResponse(res);
    expect(entries.has("export-info.csv")).toBe(true);
    expect(entries.has("users.csv")).toBe(true);
    expect(entries.has("external-identities.csv")).toBe(true);
    expect(entries.has("points-ledger.csv")).toBe(true);
    expect(entries.has("point-redemptions.csv")).toBe(true);
    expect(entries.has("addresses.csv")).toBe(true);
    expect(entries.has("spent-adjustments.csv")).toBe(true);
    expect(entries.has("level-changes.csv")).toBe(true);
    expect(entries.has("login-attempts.csv")).toBe(true);
    expect(entries.has("account-deletions.csv")).toBe(true);
    expect(entries.has("advisor-sessions.csv")).toBe(false);
    expect(entries.has("manifest.csv")).toBe(true);

    const users = entries.get("users.csv") ?? "";
    expect(users.startsWith("\uFEFF")).toBe(true);
    expect(users).toContain("\r\n");
    expect(users).toContain("13800138000");
    expect(users).not.toContain("138****8000");
    expect(users).toContain("12345");

    const redemptions = entries.get("point-redemptions.csv") ?? "";
    expect(redemptions).toContain("13900139000");
    expect(redemptions).toContain("上海市普陀区某路 1 号");

    const manifest = entries.get("manifest.csv") ?? "";
    expect(manifest).toContain("users.csv,1,已导出");

    await vi.waitFor(() => expect(finishAuditLog).toHaveBeenCalled());
    expect(beginAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user_export",
        adminId: "admin-1",
        detail: expect.objectContaining({ sensitive: true, format: "zip" }),
      })
    );
    expect(finishAuditLog).toHaveBeenCalledWith("audit-1", "SUCCESS", expect.any(Object));
  });

  it("无敏感权限时导出脱敏字段", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(FINANCE as never);
    const res = await GET(createRequest("?include=profile,redemptions,addresses"));
    const { entries } = await readResponse(res);
    const users = entries.get("users.csv") ?? "";
    expect(users).toContain("138****8000");
    expect(users).not.toContain("13800138000");

    const redemptions = entries.get("point-redemptions.csv") ?? "";
    expect(redemptions).toContain("139****9000");
    expect(redemptions).not.toContain("13900139000");
    expect(redemptions).toContain("上海市普陀区****");

    const addresses = entries.get("addresses.csv") ?? "";
    expect(addresses).toContain("****");
    expect(addresses).toContain("139****9000");
    expect(addresses).toContain("某路 1 号****");
  });

  it("测肤默认只导出业务摘要，完整分析需显式勾选", async () => {
    const res = await GET(createRequest("?include=advisorAccount,advisorSessions,advisorDiary"));
    const { entries } = await readResponse(res);
    const sessions = entries.get("advisor-sessions.csv") ?? "";
    expect(sessions).toContain("session-1");
    expect(sessions).toContain("88");
    expect(sessions).toContain("混合肌");
    expect(sessions).not.toContain("faceAnalysis");
    expect(entries.has("advisor-session-analysis.jsonl")).toBe(false);

    const accounts = entries.get("advisor-accounts.csv") ?? "";
    expect(accounts).toContain("金卡会员");
    expect(accounts).toContain("成功");

    const diary = entries.get("advisor-diary.csv") ?? "";
    expect(diary).toContain("不错");
    expect(diary).toContain("补水");
  });

  it("勾选完整分析时输出独立 JSONL", async () => {
    const res = await GET(createRequest("?include=advisorFullAnalysis"));
    const { entries } = await readResponse(res);
    expect(entries.has("advisor-sessions.csv")).toBe(true);
    const jsonl = entries.get("advisor-session-analysis.jsonl") ?? "";
    expect(jsonl).toContain('"sessionId":"session-1"');
    expect(jsonl).toContain('"faceAnalysis"');
    expect(jsonl.startsWith("\uFEFF")).toBe(false);
  });

  it("测肤权限不足时拒绝请求", async () => {
    vi.mocked(verifyAuth).mockResolvedValue({
      ...FINANCE,
      permissionOverrides: ["!advisor:users:read"],
    } as never);
    const res = await GET(createRequest("?include=advisorSessions"));
    expect(res.status).toBe(403);
    const payload = await res.json();
    expect(payload.error.code).toBe("FORBIDDEN");
  });

  it("无测肤权限时默认范围自动排除测肤文件", async () => {
    vi.mocked(verifyAuth).mockResolvedValue({
      ...FINANCE,
      permissionOverrides: ["!advisor:users:read"],
    } as never);
    const res = await GET(createRequest());
    expect(res.status).toBe(200);
    const { entries } = await readResponse(res);
    expect(entries.has("users.csv")).toBe(true);
    expect(entries.has("advisor-accounts.csv")).toBe(false);
    expect(entries.has("advisor-errors.csv")).toBe(false);
    expect(advisorRequest).not.toHaveBeenCalled();
  });

  it("测肤子站失败时仍导出主数据并记录错误", async () => {
    vi.mocked(advisorRequest).mockImplementation(async (path: string) => {
      if (path.includes("user-overview")) {
        return {
          ok: false,
          status: 502,
          code: "UPSTREAM_ERROR",
          message: "测肤子站暂时不可用",
        } as never;
      }
      if (path.includes("test-history")) {
        return {
          ok: true,
          status: 200,
          data: { history: [SESSION], pagination: { totalPages: 1 } },
        } as never;
      }
      return {
        ok: true,
        status: 200,
        data: { data: [DIARY], pagination: { hasMore: false } },
      } as never;
    });

    const res = await GET(createRequest("?include=profile,advisorSessions"));
    const { entries } = await readResponse(res);
    expect(entries.has("users.csv")).toBe(true);
    expect(entries.has("advisor-sessions.csv")).toBe(true);
    const errors = entries.get("advisor-errors.csv") ?? "";
    expect(errors).toContain("overview");
    expect(errors).toContain("测肤子站暂时不可用");
  });

  it("超过 200 用户时分批读取且不使用 10000 截断", async () => {
    const users = Array.from({ length: 201 }).map((_, index) => ({
      ...USER,
      id: `user-${index + 1}`,
      phone: `138001380${String(index).padStart(2, "0")}`,
      createdAt: new Date(NOW.getTime() - index * 1000),
    }));
    let call = 0;
    mockUserFindMany.mockImplementation((args: { select?: Record<string, unknown> }) => {
      const select = args.select ?? {};
      if (!("phone" in select))
        return Promise.resolve([{ id: users[0].id, createdAt: users[0].createdAt }]);
      call += 1;
      if (call === 1) return Promise.resolve(users.slice(0, 200));
      if (call === 2) return Promise.resolve(users.slice(200));
      return Promise.resolve([]);
    });
    mockUserCount.mockResolvedValue(201);

    const res = await GET(createRequest("?include=profile"));
    const { entries } = await readResponse(res);
    const usersCsv = entries.get("users.csv") ?? "";
    expect(usersCsv.split("\r\n").filter(Boolean)).toHaveLength(202);
    expect(mockUserFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 200 }));
    expect(mockUserFindMany).not.toHaveBeenCalledWith(expect.objectContaining({ take: 10000 }));
  });

  it("审计不可用时拒绝导出", async () => {
    vi.mocked(beginAuditLog).mockResolvedValue(null);
    const res = await GET(createRequest("?include=profile"));
    expect(res.status).toBe(503);
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });

  it("未知导出范围返回 400", async () => {
    const res = await GET(createRequest("?include=profile,unknown"));
    expect(res.status).toBe(400);
    const payload = await res.json();
    expect(payload.error.code).toBe("INVALID_INCLUDE");
  });
});
