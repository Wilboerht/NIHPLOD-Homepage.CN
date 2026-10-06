/**
 * 短信服务单元测试
 * 覆盖：
 * - generateVerifyCode：6 位数字、范围合法
 * - hashVerifyCode：HMAC-SHA256(phone:code:type)、确定性、密钥缺失抛错
 * - verifyCode：timingSafeEqual 比对、哈希不匹配/空哈希返回 false
 * - recordSmsCodeFailure：原子递增 attempts，达到上限（5 次）作废验证码
 * - recordFakeSmsThrottleEntry：假发送限流占位记录（used=true 哑码行）
 * - 腾讯云失败日志脱敏：SendStatusSet 中的 PhoneNumber 以掩码落日志
 * - mock 通道生产守卫：生产环境下 SMS_DEBUG_LOG_CODE 被忽略（不打印明文码）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockTencentSendSms } = vi.hoisted(() => ({
  mockTencentSendSms: vi.fn(),
}));

vi.mock("tencentcloud-sdk-nodejs/tencentcloud/services/sms/v20210111/index.js", () => ({
  v20210111: {
    Client: class {
      SendSms = mockTencentSendSms;
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    smsCode: { updateMany: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import { maskPhone } from "@/lib/mask-phone";
import {
  generateVerifyCode,
  hashVerifyCode,
  verifyCode,
  recordSmsCodeFailure,
  recordFakeSmsThrottleEntry,
  sendSMS,
  SMS_CODE_MAX_ATTEMPTS,
} from "@/lib/sms";

const mockUpdateMany = prisma.smsCode.updateMany as ReturnType<typeof vi.fn>;
const mockCreate = prisma.smsCode.create as ReturnType<typeof vi.fn>;
const mockWarn = apiConsole.warn as ReturnType<typeof vi.fn>;
const mockError = apiConsole.error as ReturnType<typeof vi.fn>;

const TEST_PHONE = "13800138000";
const TEST_CODE = "123456";
const TEST_TYPE = "login";

describe("generateVerifyCode", () => {
  it("应生成 6 位数字验证码", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateVerifyCode();
      expect(code).toMatch(/^\d{6}$/);
      const n = Number(code);
      expect(n).toBeGreaterThanOrEqual(100000);
      expect(n).toBeLessThan(1000000);
    }
  });
});

describe("hashVerifyCode / verifyCode", () => {
  it("相同输入生成相同哈希（确定性）", () => {
    expect(hashVerifyCode(TEST_PHONE, TEST_CODE, TEST_TYPE)).toBe(
      hashVerifyCode(TEST_PHONE, TEST_CODE, TEST_TYPE)
    );
  });

  it("phone/code/type 任一变化都会改变哈希", () => {
    const base = hashVerifyCode(TEST_PHONE, TEST_CODE, TEST_TYPE);
    expect(hashVerifyCode("13900139000", TEST_CODE, TEST_TYPE)).not.toBe(base);
    expect(hashVerifyCode(TEST_PHONE, "654321", TEST_TYPE)).not.toBe(base);
    expect(hashVerifyCode(TEST_PHONE, TEST_CODE, "register")).not.toBe(base);
  });

  it("SMS_CODE_HMAC_KEY 未设置时应抛错（兜底校验）", () => {
    vi.stubEnv("SMS_CODE_HMAC_KEY", "");
    expect(() => hashVerifyCode(TEST_PHONE, TEST_CODE, TEST_TYPE)).toThrow("SMS_CODE_HMAC_KEY");
    vi.unstubAllEnvs();
  });

  it("verifyCode 对正确验证码返回 true", () => {
    const storedHash = hashVerifyCode(TEST_PHONE, TEST_CODE, TEST_TYPE);
    expect(verifyCode(TEST_PHONE, TEST_CODE, TEST_TYPE, storedHash)).toBe(true);
  });

  it("verifyCode 对错误验证码/错误类型返回 false", () => {
    const storedHash = hashVerifyCode(TEST_PHONE, TEST_CODE, TEST_TYPE);
    expect(verifyCode(TEST_PHONE, "654321", TEST_TYPE, storedHash)).toBe(false);
    expect(verifyCode(TEST_PHONE, TEST_CODE, "register", storedHash)).toBe(false);
    expect(verifyCode("13900139000", TEST_CODE, TEST_TYPE, storedHash)).toBe(false);
  });

  it("verifyCode 对空/非法存储哈希返回 false（不抛错）", () => {
    expect(verifyCode(TEST_PHONE, TEST_CODE, TEST_TYPE, "")).toBe(false);
    expect(verifyCode(TEST_PHONE, TEST_CODE, TEST_TYPE, "not-a-hash")).toBe(false);
  });
});

describe("recordSmsCodeFailure（单码防爆破）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("校验失败应原子递增 attempts", async () => {
    await recordSmsCodeFailure("sms-1");

    expect(mockUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "sms-1", used: false },
      data: { attempts: { increment: 1 } },
    });
  });

  it("attempts 达到上限（5 次）应将验证码作废（标记 used）", async () => {
    await recordSmsCodeFailure("sms-1");

    expect(mockUpdateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "sms-1", used: false, attempts: { gte: SMS_CODE_MAX_ATTEMPTS } },
      data: { used: true },
    });
    expect(SMS_CODE_MAX_ATTEMPTS).toBe(5);
  });
});

describe("mock 通道生产环境 DEBUG 守卫", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SMS_PROVIDER", "mock");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("生产环境下 SMS_DEBUG_LOG_CODE=true 应被忽略：不打印明文验证码，仅打 warning", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SMS_DEBUG_LOG_CODE", "true");

    const result = await sendSMS({ phone: TEST_PHONE, template: "LOGIN_CODE", params: { code: TEST_CODE } });

    expect(result.success).toBe(true);
    // 所有 warn 输出均不得包含明文验证码
    for (const call of mockWarn.mock.calls) {
      expect(String(call[0])).not.toContain(TEST_CODE);
    }
    // 有且仅有"已忽略"提示
    expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining("SMS_DEBUG_LOG_CODE 已忽略"));
  });

  it("非生产环境下 SMS_DEBUG_LOG_CODE=true 正常打印明文验证码（联调用）", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SMS_DEBUG_LOG_CODE", "true");

    await sendSMS({ phone: TEST_PHONE, template: "LOGIN_CODE", params: { code: TEST_CODE } });

    expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining(TEST_CODE));
  });

  it("SMS_DEBUG_LOG_CODE 未开启时不打印明文验证码", async () => {
    vi.stubEnv("NODE_ENV", "development");

    await sendSMS({ phone: TEST_PHONE, template: "LOGIN_CODE", params: { code: TEST_CODE } });

    for (const call of mockWarn.mock.calls) {
      expect(String(call[0])).not.toContain(TEST_CODE);
    }
  });
});

describe("recordFakeSmsThrottleEntry（假发送限流占位记录）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({ id: "sms-fake-1" });
  });

  it("应写入 used=true 的哑码记录（与真实发码同口径消耗冷却/小时配额）", async () => {
    await recordFakeSmsThrottleEntry(TEST_PHONE, TEST_TYPE, "1.2.3.4", 5);

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        phone: TEST_PHONE,
        type: TEST_TYPE,
        used: true,
        ipAddress: "1.2.3.4",
        codeHash: expect.any(String),
        expiresAt: expect.any(Date),
      }),
    });
  });

  it("哑码 codeHash 为随机码哈希：任何校验路径都无法核销", async () => {
    await recordFakeSmsThrottleEntry(TEST_PHONE, TEST_TYPE, "1.2.3.4", 5);

    const codeHash = mockCreate.mock.calls[0][0].data.codeHash as string;
    // 占位码是随机生成的未交付验证码：常见猜测码无法通过哈希校验
    expect(verifyCode(TEST_PHONE, "123456", TEST_TYPE, codeHash)).toBe(false);
    expect(verifyCode(TEST_PHONE, "000000", TEST_TYPE, codeHash)).toBe(false);
  });
});

describe("腾讯云发送失败日志脱敏", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SMS_PROVIDER", "tencent");
    vi.stubEnv("TENCENT_SMS_SECRET_ID", "test-secret-id");
    vi.stubEnv("TENCENT_SMS_SECRET_KEY", "test-secret-key");
    vi.stubEnv("TENCENT_SMS_APP_ID", "test-app-id");
    vi.stubEnv("TENCENT_SMS_SIGN_NAME", "测试签名");
    vi.stubEnv("TENCENT_SMS_TEMPLATE_ID_LOGIN", "tpl-login");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("失败日志中 SendStatusSet 的 PhoneNumber 应脱敏（不落明文手机号）", async () => {
    mockTencentSendSms.mockResolvedValue({
      SendStatusSet: [
        {
          Code: "FailedOperation.PhoneNumberInBlacklist",
          Message: "手机号在黑名单中",
          PhoneNumber: `+86${TEST_PHONE}`,
        },
      ],
    });

    const result = await sendSMS({
      phone: TEST_PHONE,
      template: "LOGIN_CODE",
      params: { code: TEST_CODE },
    });

    expect(result.success).toBe(false);
    const failureCall = mockError.mock.calls.find((call) =>
      String(call[0]).includes("[Tencent SMS] 发送失败")
    );
    expect(failureCall).toBeDefined();
    const logged = failureCall![1] as { PhoneNumber?: string };
    // 与全站掩码口径一致（+86 前缀参与脱敏）
    expect(logged.PhoneNumber).toBe(maskPhone(`+86${TEST_PHONE}`));
    expect(logged.PhoneNumber).not.toContain(TEST_PHONE);
  });
});
