/**
 * 换绑手机号 API 测试
 * PUT  /api/user/phone            - 双验证码换绑
 * POST /api/user/phone/send-code  - 发送换绑验证码（当前/新手机号）
 *
 * 覆盖：参数校验、同号/已注册拦截、验证码错误（单码失败计数）、
 *       成功换绑（原子核销双码 + 更新 phone + 失效资料缓存）、发码频率限制
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const PAYLOAD = { id: "user-1" };

vi.mock("@/lib/prisma", () => {
  const prisma = {
    smsCode: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
    fn(prisma)
  );
  return { prisma };
});

vi.mock("@/lib/auth", () => ({
  withUserAuth:
    (handler: (req: NextRequest, payload: { id: string }) => unknown) =>
    (req: NextRequest) =>
      handler(req, PAYLOAD),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: vi.fn(),
}));

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/client-ip", () => ({
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/sms", () => ({
  verifyCode: vi.fn(),
  recordSmsCodeFailure: vi.fn().mockResolvedValue(undefined),
  sendLoginCode: vi.fn().mockResolvedValue({ success: true }),
  generateVerifyCode: vi.fn().mockReturnValue("123456"),
  hashVerifyCode: vi.fn().mockReturnValue("hashed-code"),
  SMS_CODE_MAX_ATTEMPTS: 5,
}));

vi.mock("@/lib/points", () => ({
  invalidateProfileCache: vi.fn(),
}));

vi.mock("@/lib/auth-logger", () => ({
  logAuthEvent: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import { verifyCode, recordSmsCodeFailure, sendLoginCode } from "@/lib/sms";
import { invalidateProfileCache } from "@/lib/points";
import { PUT } from "@/app/api/user/phone/route";
import { POST } from "@/app/api/user/phone/send-code/route";

const mockRateLimit = rateLimit as ReturnType<typeof vi.fn>;

const mockUserFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockUserUpdate = prisma.user.update as ReturnType<typeof vi.fn>;
const mockSmsFindFirst = prisma.smsCode.findFirst as ReturnType<typeof vi.fn>;
const mockSmsUpdateMany = prisma.smsCode.updateMany as ReturnType<typeof vi.fn>;
const mockSmsCreate = prisma.smsCode.create as ReturnType<typeof vi.fn>;
const mockSmsCount = prisma.smsCode.count as ReturnType<typeof vi.fn>;
const mockVerifyCode = verifyCode as ReturnType<typeof vi.fn>;
const mockSendLoginCode = sendLoginCode as ReturnType<typeof vi.fn>;

function createRequest(url: string, body: unknown, method = "POST"): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  } as never);
}

describe("换绑手机号", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    // 默认：按 id 查当前用户成功；按 phone 查（新号码占用检查）默认未注册
    mockUserFindUnique.mockImplementation(
      async (args: { where: Record<string, unknown> }) =>
        "id" in args.where ? { id: "user-1", phone: "13800138000" } : null
    );
    mockSmsFindFirst.mockResolvedValue(null);
    mockVerifyCode.mockReturnValue(true);
    mockSmsUpdateMany.mockResolvedValue({ count: 1 });
    mockSmsCount.mockResolvedValue(0);
    mockSmsCreate.mockResolvedValue({});
    mockSendLoginCode.mockResolvedValue({ success: true });
    mockUserUpdate.mockResolvedValue({});
  });

  const CODE_RECORD = { id: "code-1", codeHash: "hashed-code", ipAddress: "127.0.0.1" };

  describe("PUT /api/user/phone", () => {
    it("参数非法（手机号格式）应返回 400 INVALID_PARAMS", async () => {
      const res = await PUT(
        createRequest(
          "/api/user/phone",
          { newPhone: "12345", currentCode: "123456", newCode: "654321" },
          "PUT"
        )
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("INVALID_PARAMS");
    });

    it("新手机号与当前相同应返回 SAME_PHONE", async () => {
      const res = await PUT(
        createRequest(
          "/api/user/phone",
          { newPhone: "13800138000", currentCode: "123456", newCode: "654321" },
          "PUT"
        )
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("SAME_PHONE");
    });

    it("新手机号已被注册应返回 PHONE_IN_USE", async () => {
      mockUserFindUnique.mockImplementation(async (args: { where: Record<string, unknown> }) =>
        "id" in args.where
          ? { id: "user-1", phone: "13800138000" }
          : { id: "user-2", phone: "13900139000" }
      );

      const res = await PUT(
        createRequest(
          "/api/user/phone",
          { newPhone: "13900139000", currentCode: "123456", newCode: "654321" },
          "PUT"
        )
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("PHONE_IN_USE");
    });

    it("当前手机验证码错误应返回 CODE_INVALID 并记录单码失败", async () => {
      mockSmsFindFirst.mockResolvedValue(CODE_RECORD);
      mockVerifyCode.mockReturnValue(false);
      const res = await PUT(
        createRequest(
          "/api/user/phone",
          { newPhone: "13900139000", currentCode: "000000", newCode: "654321" },
          "PUT"
        )
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("CODE_INVALID");
      expect(recordSmsCodeFailure).toHaveBeenCalledWith("code-1");
      expect(mockUserUpdate).not.toHaveBeenCalled();
    });

    it("新手机验证码错误应返回 CODE_INVALID 并记录单码失败", async () => {
      mockSmsFindFirst.mockResolvedValue(CODE_RECORD);
      mockVerifyCode.mockReturnValueOnce(true).mockReturnValueOnce(false);
      const res = await PUT(
        createRequest(
          "/api/user/phone",
          { newPhone: "13900139000", currentCode: "123456", newCode: "000000" },
          "PUT"
        )
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("CODE_INVALID");
      expect(recordSmsCodeFailure).toHaveBeenCalled();
      expect(mockUserUpdate).not.toHaveBeenCalled();
    });

    it("双验证码通过后核销两码、更新手机号并失效资料缓存", async () => {
      mockSmsFindFirst.mockResolvedValue(CODE_RECORD);
      const res = await PUT(
        createRequest(
          "/api/user/phone",
          { newPhone: "13900139000", currentCode: "123456", newCode: "654321" },
          "PUT"
        )
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.phone).toBe("13900139000");
      // 原子核销两个验证码
      expect(mockSmsUpdateMany).toHaveBeenCalledTimes(2);
      expect(mockSmsUpdateMany).toHaveBeenCalledWith({
        where: { id: "code-1", used: false },
        data: { used: true },
      });
      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { phone: "13900139000" },
      });
      expect(invalidateProfileCache).toHaveBeenCalled();
    });

    it("微信占位手机号账号换绑：跳过当前验证码，仅核销新手机验证码", async () => {
      mockUserFindUnique.mockImplementation(async (args: { where: Record<string, unknown> }) =>
        "id" in args.where ? { id: "user-1", phone: "wx_abc123" } : null
      );
      mockSmsFindFirst.mockResolvedValue(CODE_RECORD);

      const res = await PUT(
        createRequest(
          "/api/user/phone",
          { newPhone: "13900139000", newCode: "654321" },
          "PUT"
        )
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      // 只核销新手机验证码一次
      expect(mockSmsUpdateMany).toHaveBeenCalledTimes(1);
      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { phone: "13900139000" },
      });
    });

    it("用户级限流触发应返回 429 TOO_MANY_REQUESTS", async () => {
      mockRateLimit.mockResolvedValueOnce({ success: false });
      const res = await PUT(
        createRequest(
          "/api/user/phone",
          { newPhone: "13900139000", currentCode: "123456", newCode: "654321" },
          "PUT"
        )
      );
      expect(res.status).toBe(429);
      expect((await res.json()).error.code).toBe("TOO_MANY_REQUESTS");
      expect(mockUserUpdate).not.toHaveBeenCalled();
    });

    it("并发核销冲突（验证码已被消费）应返回 CODE_INVALID 且不更新手机号", async () => {
      mockSmsFindFirst.mockResolvedValue(CODE_RECORD);
      // 当前码核销成功、新码已被并发消费（count 0）→ 事务回滚
      mockSmsUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

      const res = await PUT(
        createRequest(
          "/api/user/phone",
          { newPhone: "13900139000", currentCode: "123456", newCode: "654321" },
          "PUT"
        )
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("CODE_INVALID");
      expect(mockUserUpdate).not.toHaveBeenCalled();
    });

    it("并发下新手机号刚被注册（P2002）应返回 PHONE_IN_USE", async () => {
      mockSmsFindFirst.mockResolvedValue(CODE_RECORD);
      mockUserUpdate.mockRejectedValue({ code: "P2002" });

      const res = await PUT(
        createRequest(
          "/api/user/phone",
          { newPhone: "13900139000", currentCode: "123456", newCode: "654321" },
          "PUT"
        )
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("PHONE_IN_USE");
    });
  });

  describe("POST /api/user/phone/send-code", () => {
    it("target=new 缺少新手机号应返回 400 INVALID_PARAMS", async () => {
      const res = await POST(createRequest("/api/user/phone/send-code", { target: "new" }));
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("INVALID_PARAMS");
    });

    it("新手机号与当前相同应返回 SAME_PHONE", async () => {
      const res = await POST(
        createRequest("/api/user/phone/send-code", { target: "new", newPhone: "13800138000" })
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("SAME_PHONE");
    });

    it("新手机号已被注册应返回 PHONE_IN_USE", async () => {
      mockUserFindUnique.mockImplementation(async (args: { where: Record<string, unknown> }) =>
        "id" in args.where
          ? { id: "user-1", phone: "13800138000" }
          : { id: "user-2", phone: "13900139000" }
      );
      const res = await POST(
        createRequest("/api/user/phone/send-code", { target: "new", newPhone: "13900139000" })
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("PHONE_IN_USE");
    });

    it("发送到当前手机成功：入库 rebind-current 验证码并返回有效期", async () => {
      const res = await POST(createRequest("/api/user/phone/send-code", { target: "current" }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.expiresIn).toBe(300);
      expect(mockSmsCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          phone: "13800138000",
          type: "rebind-current",
          codeHash: "hashed-code",
        }),
      });
      expect(mockSendLoginCode).toHaveBeenCalledWith("13800138000", "123456");
    });

    it("微信占位手机号账号向当前手机发码应返回 UNSUPPORTED_PHONE", async () => {
      mockUserFindUnique.mockImplementation(async (args: { where: Record<string, unknown> }) =>
        "id" in args.where ? { id: "user-1", phone: "wx_abc123" } : null
      );
      const res = await POST(createRequest("/api/user/phone/send-code", { target: "current" }));
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("UNSUPPORTED_PHONE");
      expect(mockSmsCreate).not.toHaveBeenCalled();
    });

    it("发送到新手机成功：入库 rebind-new 验证码", async () => {
      const res = await POST(
        createRequest("/api/user/phone/send-code", { target: "new", newPhone: "13900139000" })
      );
      expect(res.status).toBe(200);
      expect(mockSmsCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ phone: "13900139000", type: "rebind-new" }),
      });
    });

    it("发送间隔内重复发送应返回 TOO_FREQUENT", async () => {
      mockSmsFindFirst.mockResolvedValue({ createdAt: new Date() });
      const res = await POST(createRequest("/api/user/phone/send-code", { target: "current" }));
      expect(res.status).toBe(429);
      expect((await res.json()).error.code).toBe("TOO_FREQUENT");
      expect(mockSmsCreate).not.toHaveBeenCalled();
    });

    it("用户级限流触发应返回 429 TOO_MANY_REQUESTS", async () => {
      mockRateLimit.mockResolvedValueOnce({ success: false });
      const res = await POST(createRequest("/api/user/phone/send-code", { target: "current" }));
      expect(res.status).toBe(429);
      expect((await res.json()).error.code).toBe("TOO_MANY_REQUESTS");
      expect(mockSmsCreate).not.toHaveBeenCalled();
    });
  });
});
