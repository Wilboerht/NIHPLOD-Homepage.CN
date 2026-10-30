/**
 * 孤儿消费凭证清理测试
 * 覆盖：引用保护、TTL 保护、非法文件名忽略、dry-run / apply。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, utimes, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const mockFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { spentAdjustmentApplication: { findMany: () => mockFindMany() } },
  default: { spentAdjustmentApplication: { findMany: () => mockFindMany() } },
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog: vi.fn().mockResolvedValue(true),
}));

import { createAuditLog } from "@/lib/audit";
import { findOrphanSpentProofs, purgeOrphanSpentProofs } from "../spent-proof-orphans";

const UUID_A = "123e4567-e89b-42d3-a456-426614174000";
const UUID_B = "223e4567-e89b-42d3-a456-426614174001";
const UUID_C = "323e4567-e89b-42d3-a456-426614174002";

let tempDir = "";
let rootDir = "";
let userDir = "";

async function makeProof(uuid: string, ageMs: number | null): Promise<string> {
  const filePath = join(userDir, `${uuid}.webp`);
  await writeFile(filePath, Buffer.from("webp"));
  if (ageMs !== null) {
    const time = new Date(Date.now() - ageMs);
    await utimes(filePath, time, time);
  }
  return filePath;
}

beforeEach(async () => {
  vi.clearAllMocks();
  tempDir = await mkdtemp(join(tmpdir(), "spent-orphans-"));
  rootDir = join(tempDir, "spent-adjustments");
  userDir = join(rootDir, "user-1");
  await mkdir(userDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("findOrphanSpentProofs", () => {
  it("保留被申请引用/未超过 TTL 的文件，只返回超时未引用文件", async () => {
    const old = 10 * 24 * 60 * 60 * 1000;
    await makeProof(UUID_A, old);
    await makeProof(UUID_B, old);
    const freshPath = await makeProof(UUID_C, null);

    const scan = await findOrphanSpentProofs({
      rootDir,
      referencedKeys: [`private-local:spent-adjustments/user-1/${UUID_A}.webp`],
      olderThanMs: 7 * 24 * 60 * 60 * 1000,
    });

    expect(scan.scanned).toBe(3);
    expect(scan.referenced).toBe(1);
    expect(scan.candidates).toEqual([`spent-adjustments/user-1/${UUID_B}.webp`]);
    expect(freshPath).toContain(UUID_C);
  });

  it("忽略非 UUID 文件名与非本地 key", async () => {
    await writeFile(join(userDir, "not-a-uuid.webp"), Buffer.from("x"));
    await makeProof(UUID_A, 10 * 24 * 60 * 60 * 1000);

    const scan = await findOrphanSpentProofs({
      rootDir,
      referencedKeys: [`private-oss:spent-adjustments/user-1/${UUID_A}.webp`],
      olderThanMs: 7 * 24 * 60 * 60 * 1000,
    });

    expect(scan.scanned).toBe(1);
    expect(scan.candidates).toEqual([`spent-adjustments/user-1/${UUID_A}.webp`]);
  });

  it("目录不存在时返回空结果", async () => {
    const scan = await findOrphanSpentProofs({
      rootDir: join(tempDir, "missing"),
      referencedKeys: [],
      olderThanMs: 0,
    });

    expect(scan).toEqual({ candidates: [], scanned: 0, referenced: 0 });
  });
});

describe("purgeOrphanSpentProofs", () => {
  it("dry-run 不删除文件", async () => {
    mockFindMany.mockResolvedValue([]);
    const orphanPath = await makeProof(UUID_A, 10 * 24 * 60 * 60 * 1000);

    const result = await purgeOrphanSpentProofs({
      rootDir,
      apply: false,
      olderThanMs: 7 * 24 * 60 * 60 * 1000,
    });

    expect(result.candidates).toBe(1);
    expect(result.deleted).toBe(0);
    await expect(import("fs/promises").then((fs) => fs.stat(orphanPath))).resolves.toBeTruthy();
  });

  it("apply 删除未引用文件并保留被引用文件", async () => {
    const referenced = `private-local:spent-adjustments/user-1/${UUID_A}.webp`;
    mockFindMany.mockResolvedValue([{ images: [referenced] }]);
    const referencedPath = await makeProof(UUID_A, 10 * 24 * 60 * 60 * 1000);
    const orphanPath = await makeProof(UUID_B, 10 * 24 * 60 * 60 * 1000);

    const result = await purgeOrphanSpentProofs({
      rootDir,
      apply: true,
      olderThanMs: 7 * 24 * 60 * 60 * 1000,
    });

    expect(result.candidates).toBe(1);
    expect(result.deleted).toBe(1);
    expect(result.errors).toBe(0);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "spent_proof_orphan_purge",
        targetType: "system",
        detail: expect.objectContaining({ deleted: 1 }),
      })
    );
    await expect(import("fs/promises").then((fs) => fs.stat(referencedPath))).resolves.toBeTruthy();
    await expect(
      import("fs/promises")
        .then((fs) => fs.stat(orphanPath))
        .catch((error: NodeJS.ErrnoException) => error.code)
    ).resolves.toBe("ENOENT");
  });
});
