import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockInitializeCronTasks = vi.fn();
const mockStopCronTasks = vi.fn();

vi.mock("@/lib/cron-tasks", () => ({
  initializeCronTasks: () => mockInitializeCronTasks(),
  stopCronTasks: () => mockStopCronTasks(),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("server-init", () => {
  let originalPhase: string | undefined;
  const listeners: Record<string, Array<() => void>> = {};

  beforeEach(() => {
    originalPhase = process.env.NEXT_PHASE;
    delete process.env.NEXT_PHASE;
    mockInitializeCronTasks.mockClear();
    mockStopCronTasks.mockClear();
    vi.resetModules();

    // 隔离 process.on
    listeners["SIGTERM"] = [];
    listeners["SIGINT"] = [];
    vi.spyOn(process, "on").mockImplementation((event: string | symbol, listener: () => void) => {
      if (typeof event === "string") {
        listeners[event] = listeners[event] || [];
        listeners[event].push(listener);
      }
      return process;
    });
  });

  afterEach(() => {
    process.env.NEXT_PHASE = originalPhase;
    vi.restoreAllMocks();
  });

  it("应初始化定时任务并注册关闭钩子", async () => {
    const { initializeApp } = await import("@/lib/server-init");
    await initializeApp();
    expect(mockInitializeCronTasks).toHaveBeenCalled();
    expect(listeners["SIGTERM"]).toHaveLength(1);
    expect(listeners["SIGINT"]).toHaveLength(1);

    // 调用关闭钩子不应报错
    await listeners["SIGTERM"][0]();
    expect(mockStopCronTasks).toHaveBeenCalled();
  });

  it("构建阶段应跳过初始化", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    const { initializeApp } = await import("@/lib/server-init");
    await initializeApp();
    expect(mockInitializeCronTasks).not.toHaveBeenCalled();
  });

  it("重复初始化不应重复执行", async () => {
    const { initializeApp } = await import("@/lib/server-init");
    await initializeApp();
    await initializeApp();
    expect(mockInitializeCronTasks).toHaveBeenCalledTimes(1);
  });

  it("生产环境缺少 RS256 密钥时应抛出错误", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_HS256_FALLBACK", "false");
    vi.stubEnv("JWT_ACCESS_PRIVATE_KEY", "");
    vi.stubEnv("JWT_ACCESS_PUBLIC_KEY", "");
    vi.stubEnv("JWT_ID_TOKEN_PRIVATE_KEY", "");
    vi.stubEnv("JWT_ID_TOKEN_PUBLIC_KEY", "");
    // 通过短信配置校验，确保到达 RS256 检查
    vi.stubEnv("SMS_PROVIDER", "tencent");

    const { initializeApp } = await import("@/lib/server-init");
    await expect(initializeApp()).rejects.toThrow("RS256");

    vi.unstubAllEnvs();
  });

  it("生产环境配置 RS256 密钥时应正常初始化", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_HS256_FALLBACK", "false");
    vi.stubEnv("JWT_ACCESS_PRIVATE_KEY", "fake-access-private");
    vi.stubEnv("JWT_ACCESS_PUBLIC_KEY", "fake-access-public");
    vi.stubEnv("JWT_ID_TOKEN_PRIVATE_KEY", "fake-id-private");
    vi.stubEnv("JWT_ID_TOKEN_PUBLIC_KEY", "fake-id-public");
    vi.stubEnv("SMS_PROVIDER", "tencent");

    const { initializeApp } = await import("@/lib/server-init");
    await initializeApp();
    expect(mockInitializeCronTasks).toHaveBeenCalled();

    vi.unstubAllEnvs();
  });

  it("SMS_CODE_HMAC_KEY 未设置时应启动失败（所有环境强制）", async () => {
    vi.stubEnv("SMS_CODE_HMAC_KEY", "");

    const { initializeApp } = await import("@/lib/server-init");
    await expect(initializeApp()).rejects.toThrow("SMS_CODE_HMAC_KEY");

    vi.unstubAllEnvs();
  });

  it("SMS_CODE_HMAC_KEY 长度不足 32 字符时应启动失败", async () => {
    vi.stubEnv("SMS_CODE_HMAC_KEY", "too-short-key");

    const { initializeApp } = await import("@/lib/server-init");
    await expect(initializeApp()).rejects.toThrow("SMS_CODE_HMAC_KEY");

    vi.unstubAllEnvs();
  });

  it("生产环境 SMS_PROVIDER 未设置或为 mock 时应告警但正常启动", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_HS256_FALLBACK", "true"); // 跳过 RS256 检查，聚焦短信校验
    vi.stubEnv("SMS_PROVIDER", "mock");

    const { initializeApp } = await import("@/lib/server-init");
    await initializeApp();
    expect(mockInitializeCronTasks).toHaveBeenCalled();

    vi.unstubAllEnvs();
  });

  it("生产环境 SMS_PROVIDER 为未知值时应告警但正常启动", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_HS256_FALLBACK", "true");
    vi.stubEnv("SMS_PROVIDER", "unknown-provider");

    const { initializeApp } = await import("@/lib/server-init");
    await initializeApp();
    expect(mockInitializeCronTasks).toHaveBeenCalled();

    vi.unstubAllEnvs();
  });

  it("生产环境 SMS_PROVIDER=aliyun 且密钥齐备时应正常初始化", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_HS256_FALLBACK", "true");
    vi.stubEnv("SMS_PROVIDER", "aliyun");

    const { initializeApp } = await import("@/lib/server-init");
    await initializeApp();
    expect(mockInitializeCronTasks).toHaveBeenCalled();

    vi.unstubAllEnvs();
  });
});
