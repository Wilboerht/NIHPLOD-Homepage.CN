import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockUserFindUnique = vi.fn();
const mockUserUpdate = vi.fn();
const mockUserUpdateMany = vi.fn();
const mockSendProfileUpdateWebhook = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
      updateMany: (...args: unknown[]) => mockUserUpdateMany(...args),
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

import { revalidateTag } from "next/cache";
import { PUT } from "@/app/api/user/profile/route";

const mockRevalidateTag = revalidateTag as ReturnType<typeof vi.fn>;

function putRequest(body: unknown) {
  return new NextRequest(new URL("/api/user/profile", "http://localhost:3000"), {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const OLD_USER = { nickname: "旧昵称", avatar: null, birthday: null, birthdayLocked: false };
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
    // 生日首次设置的条件写认领默认成功（并发场景由 updateMany 条件保证）
    mockUserUpdateMany.mockResolvedValue({ count: 1 });
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

  it("已设置生日后清除（null）应被拒绝：生日已锁定（403）", async () => {
    mockUserFindUnique.mockResolvedValue({
      ...OLD_USER,
      birthday: new Date("2000-01-01T00:00:00.000Z"),
      birthdayLocked: true,
    });

    const res = await PUT(putRequest({ birthday: null }));

    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("BIRTHDAY_LOCKED");
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("已设置生日后改值应被拒绝：生日已锁定（403）", async () => {
    mockUserFindUnique.mockResolvedValue({
      ...OLD_USER,
      birthday: new Date("2000-01-01T00:00:00.000Z"),
      birthdayLocked: true,
    });

    const res = await PUT(putRequest({ birthday: "1995-05-20" }));

    expect(res.status).toBe(403);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("未设置生日时可首次设置，并写入锁定标记", async () => {
    mockUserFindUnique.mockResolvedValue(OLD_USER);
    const birthday = new Date("1995-05-20T00:00:00.000Z");
    mockUserUpdate.mockResolvedValue({ ...NEW_USER, birthday });

    const res = await PUT(putRequest({ birthday: "1995-05-20" }));

    expect(res.status).toBe(200);
    // 首次设置生日：通过条件写认领（updateMany）写入并锁定，防并发双设置
    expect(mockUserUpdateMany).toHaveBeenCalledWith({
      where: { id: "user-1", birthday: null, birthdayLocked: false },
      data: { birthday, birthdayLocked: true },
    });
  });

  it("未来日期应被拒绝（400），不触发更新", async () => {
    mockUserFindUnique.mockResolvedValue(OLD_USER);
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const res = await PUT(putRequest({ birthday: future }));

    expect(res.status).toBe(400);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });
});

describe("PUT /api/user/profile - 性别保存与缓存失效", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 生日首次设置的条件写认领默认成功（并发场景由 updateMany 条件保证）
    mockUserUpdateMany.mockResolvedValue({ count: 1 });
    mockSendProfileUpdateWebhook.mockResolvedValue(undefined);
  });

  it("设置性别：落库并立即失效 profile 缓存（expire: 0，保证写后读）", async () => {
    mockUserFindUnique.mockResolvedValue({ ...OLD_USER, gender: null });
    mockUserUpdate.mockResolvedValue({ ...NEW_USER, gender: "male" });

    const res = await PUT(putRequest({ gender: "male" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.user.gender).toBe("male");
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ gender: "male" }) })
    );
    // "max" 会让紧随其后的 GET 仍返回旧资料（stale-while-revalidate），必须用 expire: 0
    expect(mockRevalidateTag).toHaveBeenCalledWith("user-profile", { expire: 0 });
  });

  it("清除性别（保密）：写入 null 并失效缓存", async () => {
    mockUserFindUnique.mockResolvedValue({ ...OLD_USER, gender: "female" });
    mockUserUpdate.mockResolvedValue({ ...NEW_USER, gender: null });

    const res = await PUT(putRequest({ gender: null }));

    expect(res.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ gender: null }) })
    );
    expect(mockRevalidateTag).toHaveBeenCalledWith("user-profile", { expire: 0 });
  });

  it("非法性别值返回 400", async () => {
    const res = await PUT(putRequest({ gender: "other" }));

    expect(res.status).toBe(400);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });
});
