import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAssetCreate = vi.fn();
const mockAssetFindMany = vi.fn();
const mockAssetDeleteMany = vi.fn();
const mockMediaTaskCreateMany = vi.fn();
const mockTransaction = vi.fn();
const mockDeleteUploadedFile = vi.fn();
const mockEnqueueMediaDeletions = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    avatarAsset: {
      create: (...args: unknown[]) => mockAssetCreate(...args),
      findMany: (...args: unknown[]) => mockAssetFindMany(...args),
      deleteMany: (...args: unknown[]) => mockAssetDeleteMany(...args),
    },
    mediaDeletionTask: {
      createMany: (...args: unknown[]) => mockMediaTaskCreateMany(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("@/lib/media-deletion", () => ({
  enqueueMediaDeletions: (...args: unknown[]) => mockEnqueueMediaDeletions(...args),
  mediaDeletionData: (objectKey: string) => ({ objectKey }),
}));

vi.mock("@/lib/upload", () => ({
  deleteUploadedFile: (...args: unknown[]) => mockDeleteUploadedFile(...args),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  cleanupAvatarUpload,
  getAvatarObjectKeys,
  prepareAvatarReplacement,
  purgeAvatarAssets,
  purgeOrphanAvatarUploads,
  registerPendingAvatarUpload,
} from "../avatar-assets";

function replacementTx(avatar: string | null, assets: unknown[]) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ id: "user-1" }]),
    user: {
      findUnique: vi.fn().mockResolvedValue({ avatar, status: "ACTIVE" }),
    },
    avatarAsset: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue(assets),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

const oldAsset = {
  id: "old",
  objectKey: "/uploads/avatars/old.webp",
  derivedUrls: ["/uploads/avatars/thumbnail/old.webp"],
  attachedAt: new Date("2026-01-01"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockDeleteUploadedFile.mockResolvedValue(true);
  mockEnqueueMediaDeletions.mockResolvedValue(undefined);
  mockAssetDeleteMany.mockResolvedValue({ count: 1 });
  mockMediaTaskCreateMany.mockResolvedValue({ count: 1 });
});

describe("头像上传对象", () => {
  it("主图与缩略图都纳入对象清单并去重", () => {
    expect(getAvatarObjectKeys({ url: "main", thumbnailUrl: "thumbnail" })).toEqual([
      "main",
      "thumbnail",
    ]);
    expect(getAvatarObjectKeys({ url: "main", thumbnailUrl: "main" })).toEqual(["main"]);
  });

  it("补偿清理覆盖主图与缩略图", async () => {
    await cleanupAvatarUpload({ url: "main", thumbnailUrl: "thumbnail" });

    expect(mockDeleteUploadedFile).toHaveBeenCalledWith("main");
    expect(mockDeleteUploadedFile).toHaveBeenCalledWith("thumbnail");
  });

  it("OAuth 未绑定上传登记主图、派生图，且不提前标记已绑定", async () => {
    await registerPendingAvatarUpload("user-1", {
      url: "/uploads/avatars/new.webp",
      thumbnailUrl: "/uploads/avatars/thumbnail/new.webp",
    });

    expect(mockAssetCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        objectKey: "/uploads/avatars/new.webp",
        derivedUrls: ["/uploads/avatars/thumbnail/new.webp"],
      },
    });
  });
});

describe("头像替换", () => {
  it("新上传保留，旧头像和未绑定头像连同派生图进入删除队列", async () => {
    const pendingAsset = {
      id: "pending",
      objectKey: "/uploads/avatars/pending.webp",
      derivedUrls: [],
      attachedAt: null,
    };
    const newAsset = {
      id: "new",
      objectKey: "/uploads/avatars/new.webp",
      derivedUrls: ["/uploads/avatars/thumbnail/new.webp"],
      attachedAt: new Date(),
    };
    const tx = replacementTx(oldAsset.objectKey, [oldAsset, pendingAsset, newAsset]);

    const result = await prepareAvatarReplacement(tx as never, {
      userId: "user-1",
      nextAvatar: newAsset.objectKey,
      newUpload: {
        url: newAsset.objectKey,
        thumbnailUrl: newAsset.derivedUrls[0],
      },
    });

    expect(result.previousAvatar).toBe(oldAsset.objectKey);
    expect(mockEnqueueMediaDeletions).toHaveBeenCalledWith(tx, [
      oldAsset.objectKey,
      oldAsset.derivedUrls[0],
      pendingAsset.objectKey,
    ]);
    expect(tx.avatarAsset.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["old", "pending"] } },
    });
  });

  it("OAuth 本地相对路径与资料中的绝对 URL 视为同一头像，绑定后不删除", async () => {
    const pendingAsset = {
      id: "pending",
      objectKey: "/uploads/avatars/new.webp",
      derivedUrls: ["/uploads/avatars/thumbnail/new.webp"],
      attachedAt: null,
    };
    const tx = replacementTx(null, [pendingAsset]);

    await prepareAvatarReplacement(tx as never, {
      userId: "user-1",
      nextAvatar: "https://nihplod.cn/uploads/avatars/new.webp",
    });

    expect(mockEnqueueMediaDeletions).toHaveBeenCalledWith(tx, []);
    expect(tx.avatarAsset.deleteMany).not.toHaveBeenCalled();
    expect(tx.avatarAsset.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["pending"] } },
      data: { attachedAt: expect.any(Date) },
    });
  });

  it("未登记在当前用户名下的历史头像不会被删除（防跨用户 IDOR）", async () => {
    const tx = replacementTx("/uploads/avatars/legacy.webp", []);

    await prepareAvatarReplacement(tx as never, { userId: "user-1", nextAvatar: null });

    expect(mockEnqueueMediaDeletions).toHaveBeenCalledWith(tx, []);
  });

  it("历史绝对 URL 未登记时同样不会被删除", async () => {
    const tx = replacementTx("https://nihplod.cn/uploads/avatars/legacy.webp", []);

    await prepareAvatarReplacement(tx as never, { userId: "user-1", nextAvatar: null });

    expect(mockEnqueueMediaDeletions).toHaveBeenCalledWith(tx, []);
  });
});

describe("孤儿头像清理", () => {
  const candidate = {
    id: "pending",
    userId: "user-1",
    objectKey: "/uploads/avatars/pending.webp",
    derivedUrls: ["/uploads/avatars/thumbnail/pending.webp"],
  };

  it("超过 TTL 的未绑定资产在锁内复核后进入删除队列并移除登记", async () => {
    mockAssetFindMany.mockResolvedValue([candidate]);
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "user-1" }]),
      avatarAsset: {
        findUnique: vi.fn().mockResolvedValue({ attachedAt: null }),
        delete: vi.fn().mockResolvedValue({}),
      },
    };
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));

    const result = await purgeOrphanAvatarUploads({
      now: new Date("2026-11-05T00:00:00Z"),
    });

    expect(result).toEqual({ scanned: 1, purged: 1, failed: 0 });
    expect(mockAssetFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          attachedAt: null,
          createdAt: { lte: new Date("2026-11-04T00:00:00Z") },
        },
      })
    );
    expect(mockEnqueueMediaDeletions).toHaveBeenCalledWith(tx, [
      candidate.objectKey,
      candidate.derivedUrls[0],
    ]);
    expect(tx.avatarAsset.delete).toHaveBeenCalledWith({ where: { id: "pending" } });
  });

  it("锁内发现已绑定时保留资产", async () => {
    mockAssetFindMany.mockResolvedValue([candidate]);
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "user-1" }]),
      avatarAsset: {
        findUnique: vi.fn().mockResolvedValue({ attachedAt: new Date() }),
        delete: vi.fn(),
      },
    };
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));

    const result = await purgeOrphanAvatarUploads();

    expect(result).toEqual({ scanned: 1, purged: 0, failed: 0 });
    expect(mockEnqueueMediaDeletions).not.toHaveBeenCalled();
    expect(tx.avatarAsset.delete).not.toHaveBeenCalled();
  });
});

describe("注销头像清理", () => {
  it("只删除已登记主图与派生图，未登记的当前头像不删除", async () => {
    mockAssetFindMany.mockResolvedValue([
      {
        id: "asset-1",
        objectKey: "/uploads/avatars/current.webp",
        derivedUrls: ["/uploads/avatars/thumbnail/current.webp"],
      },
    ]);

    const result = await purgeAvatarAssets("user-1");

    expect(result).toEqual({ failed: 0 });
    expect(mockDeleteUploadedFile).toHaveBeenCalledTimes(2);
    expect(mockAssetDeleteMany).toHaveBeenCalledWith({ where: { id: { in: ["asset-1"] } } });
    expect(mockMediaTaskCreateMany).not.toHaveBeenCalled();
  });

  it("失败对象保留登记并进入重试队列，本地绝对 URL 转为可删除路径", async () => {
    mockAssetFindMany.mockResolvedValue([
      {
        id: "asset-1",
        objectKey: "https://nihplod.cn/uploads/avatars/current.webp",
        derivedUrls: [],
      },
    ]);
    mockDeleteUploadedFile.mockRejectedValue(new Error("io failed"));

    const result = await purgeAvatarAssets("user-1");

    expect(result).toEqual({ failed: 1 });
    expect(mockDeleteUploadedFile).toHaveBeenCalledWith("/uploads/avatars/current.webp");
    expect(mockAssetDeleteMany).not.toHaveBeenCalled();
    expect(mockMediaTaskCreateMany).toHaveBeenCalledWith({
      data: [{ objectKey: "/uploads/avatars/current.webp" }],
    });
  });
});
