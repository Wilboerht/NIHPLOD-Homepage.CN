import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockUserFindUnique = vi.fn();
const mockUserUpdate = vi.fn();
const mockSendProfileUpdateWebhook = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  // 直接以固定用户身份执行 handler
  withUserAuth:
    (handler: (req: NextRequest, payload: { id: string }) => unknown) =>
    (req: NextRequest) =>
      handler(req, { id: "user-1" }),
  verifyUserAuth: vi.fn(),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: vi.fn(),
}));

vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/points", () => ({
  grantBirthdayGiftIfDue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/upload", () => ({
  processAndSaveImage: vi.fn(),
  validateUploadServer: vi.fn(),
  validateFileBuffer: vi.fn(),
}));

vi.mock("@/lib/profile-webhook", () => ({
  sendProfileUpdateWebhook: (...args: unknown[]) => mockSendProfileUpdateWebhook(...args),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { PUT } from "@/app/api/user/profile/route";

function putRequest(body: unknown) {
  return new NextRequest(new URL("/api/user/profile", "http://localhost:3000"), {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const OLD_USER = { nickname: "旧昵称", avatar: null, birthday: null };
const NEW_USER = {
  id: "user-1",
  phone: "13800000000",
  nickname: "新昵称",
  avatar: null,
  birthday: null,
};

describe("PUT /api/user/profile - profile_update webhook 触发条件", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendProfileUpdateWebhook.mockResolvedValue(undefined);
  });

  it("昵称实际变更后应触发 webhook 推送（快照为变更后的公开资料）", async () => {
    mockUserFindUnique.mockResolvedValue(OLD_USER);
    mockUserUpdate.mockResolvedValue(NEW_USER);

    const res = await PUT(putRequest({ nickname: "新昵称" }));

    expect(res.status).toBe(200);
    expect(mockSendProfileUpdateWebhook).toHaveBeenCalledWith("user-1", {
      nickname: "新昵称",
      avatar: null,
      birthday: null,
    });
  });

  it("提交值与现状一致（无实际变更）时不触发 webhook", async () => {
    mockUserFindUnique.mockResolvedValue({ ...OLD_USER, nickname: "新昵称" });
    mockUserUpdate.mockResolvedValue(NEW_USER);

    const res = await PUT(putRequest({ nickname: "新昵称" }));

    expect(res.status).toBe(200);
    expect(mockSendProfileUpdateWebhook).not.toHaveBeenCalled();
  });

  it("头像变更后应触发 webhook 推送", async () => {
    mockUserFindUnique.mockResolvedValue(OLD_USER);
    mockUserUpdate.mockResolvedValue({
      ...NEW_USER,
      nickname: "旧昵称",
      avatar: "https://cdn.example.com/new.png",
    });

    const res = await PUT(
      putRequest({ avatar: "https://cdn.example.com/new.png" })
    );

    expect(res.status).toBe(200);
    expect(mockSendProfileUpdateWebhook).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ avatar: "https://cdn.example.com/new.png" })
    );
  });

  it("参数校验失败时不触发 webhook", async () => {
    const res = await PUT(putRequest({ nickname: "a".repeat(21) }));

    expect(res.status).toBe(400);
    expect(mockUserUpdate).not.toHaveBeenCalled();
    expect(mockSendProfileUpdateWebhook).not.toHaveBeenCalled();
  });
});
