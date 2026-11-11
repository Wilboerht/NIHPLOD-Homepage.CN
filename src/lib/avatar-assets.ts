import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import { enqueueMediaDeletions, mediaDeletionData } from "@/lib/media-deletion";
import { deleteUploadedFile, type UploadResult } from "@/lib/upload";

export type AvatarUploadRefs = Pick<UploadResult, "url" | "thumbnailUrl">;

export function getAvatarObjectKeys(upload: AvatarUploadRefs): string[] {
  return [
    ...new Set([upload.url, upload.thumbnailUrl].filter((url): url is string => Boolean(url))),
  ];
}

function normalizeLocalAvatarUrl(url: string): string {
  if (url.startsWith("/")) return url;
  try {
    const parsed = new URL(url);
    return parsed.pathname.startsWith("/uploads/") ? parsed.pathname : url;
  } catch {
    return url;
  }
}

function sameAvatarUrl(left: string, right: string): boolean {
  return normalizeLocalAvatarUrl(left) === normalizeLocalAvatarUrl(right);
}

export async function cleanupAvatarUpload(upload: AvatarUploadRefs): Promise<boolean> {
  let succeeded = true;
  for (const objectKey of getAvatarObjectKeys(upload)) {
    try {
      await deleteUploadedFile(objectKey);
    } catch (error) {
      succeeded = false;
      apiConsole.error(`[AvatarAsset] 补偿删除失败: ${objectKey}`, error);
    }
  }
  return succeeded;
}

export async function registerPendingAvatarUpload(
  userId: string,
  upload: AvatarUploadRefs
): Promise<void> {
  await prisma.avatarAsset.create({
    data: {
      userId,
      objectKey: upload.url,
      derivedUrls: upload.thumbnailUrl ? [upload.thumbnailUrl] : [],
    },
  });
}

export async function prepareAvatarReplacement(
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    nextAvatar: string | null;
    newUpload?: AvatarUploadRefs;
    allowInactive?: boolean;
  }
): Promise<{ previousAvatar: string | null }> {
  const { userId, nextAvatar, newUpload, allowInactive = false } = params;
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { avatar: true, status: true },
  });
  if (!user || (user.status !== "ACTIVE" && !(allowInactive && user.status !== "DELETED"))) {
    throw new Error("AVATAR_USER_NOT_ACTIVE");
  }

  if (newUpload) {
    await tx.avatarAsset.create({
      data: {
        userId,
        objectKey: newUpload.url,
        derivedUrls: newUpload.thumbnailUrl ? [newUpload.thumbnailUrl] : [],
        attachedAt: new Date(),
      },
    });
  }

  const assets = await tx.avatarAsset.findMany({
    where: { userId },
    select: { id: true, objectKey: true, derivedUrls: true, attachedAt: true },
  });
  const retained = nextAvatar
    ? assets.filter((asset) => sameAvatarUrl(asset.objectKey, nextAvatar))
    : [];
  const retainedIds = new Set(retained.map((asset) => asset.id));
  const obsolete = assets.filter((asset) => !retainedIds.has(asset.id));
  const deletionKeys = obsolete.flatMap((asset) => [asset.objectKey, ...asset.derivedUrls]);

  // 只删除登记在当前用户名下的 AvatarAsset。
  // 旧头像若不在 AvatarAsset 中（历史遗留或用户把头像 URL 指向他人头像），
  // 不得凭 URL 形状直接删除，避免跨用户对象删除（IDOR）。
  // 历史遗留头像会由孤儿清理/人工运营处理，安全优先。
  await enqueueMediaDeletions(tx, deletionKeys);
  if (obsolete.length > 0) {
    await tx.avatarAsset.deleteMany({ where: { id: { in: obsolete.map((asset) => asset.id) } } });
  }
  const pendingRetainedIds = retained
    .filter((asset) => asset.attachedAt === null)
    .map((asset) => asset.id);
  if (pendingRetainedIds.length > 0) {
    await tx.avatarAsset.updateMany({
      where: { id: { in: pendingRetainedIds } },
      data: { attachedAt: new Date() },
    });
  }

  return { previousAvatar: user.avatar };
}

export async function purgeAvatarAssets(userId: string): Promise<{ failed: number }> {
  const assets = await prisma.avatarAsset.findMany({
    where: { userId },
    select: { id: true, objectKey: true, derivedUrls: true },
  });
  // 只删除登记在当前用户名下的 AvatarAsset；旧头像 URL 不再作为删除依据，
  // 避免用户把头像指向他人对象后注销账号导致跨用户删除。
  const candidates = assets.map((asset) => [asset.objectKey, ...asset.derivedUrls]);
  const objectKeys = [...new Set(candidates.flat())];
  const failedKeys = new Set<string>();

  for (const objectKey of objectKeys) {
    try {
      await deleteUploadedFile(normalizeLocalAvatarUrl(objectKey));
    } catch (error) {
      failedKeys.add(objectKey);
      apiConsole.warn(`[AvatarAsset] 注销删除失败: ${objectKey}`, error);
    }
  }

  const deletedAssetIds = assets
    .filter((asset) =>
      [asset.objectKey, ...asset.derivedUrls].every((objectKey) => !failedKeys.has(objectKey))
    )
    .map((asset) => asset.id);
  if (deletedAssetIds.length > 0) {
    await prisma.avatarAsset.deleteMany({ where: { id: { in: deletedAssetIds } } });
  }
  if (failedKeys.size > 0) {
    await prisma.mediaDeletionTask.createMany({
      data: [...failedKeys].map((objectKey) =>
        mediaDeletionData(normalizeLocalAvatarUrl(objectKey))
      ),
    });
  }

  return { failed: failedKeys.size };
}

export async function purgeOrphanAvatarUploads(options?: {
  olderThanMs?: number;
  limit?: number;
  now?: Date;
}): Promise<{ scanned: number; purged: number; failed: number }> {
  const now = options?.now ?? new Date();
  const olderThanMs = options?.olderThanMs ?? 24 * 60 * 60 * 1000;
  const limit = Math.min(500, Math.max(1, options?.limit ?? 100));
  const cutoff = new Date(now.getTime() - olderThanMs);
  const candidates = await prisma.avatarAsset.findMany({
    where: { attachedAt: null, createdAt: { lte: cutoff } },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true, userId: true, objectKey: true, derivedUrls: true },
  });

  let purged = 0;
  let failed = 0;
  for (const candidate of candidates) {
    try {
      const claimed = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${candidate.userId} FOR UPDATE`;
        const current = await tx.avatarAsset.findUnique({
          where: { id: candidate.id },
          select: { attachedAt: true },
        });
        if (!current || current.attachedAt !== null) return false;
        await enqueueMediaDeletions(tx, [candidate.objectKey, ...candidate.derivedUrls]);
        await tx.avatarAsset.delete({ where: { id: candidate.id } });
        return true;
      });
      if (claimed) purged += 1;
    } catch (error) {
      failed += 1;
      apiConsole.error(`[AvatarAsset] 孤儿头像清理失败: ${candidate.id}`, error);
    }
  }

  return { scanned: candidates.length, purged, failed };
}
