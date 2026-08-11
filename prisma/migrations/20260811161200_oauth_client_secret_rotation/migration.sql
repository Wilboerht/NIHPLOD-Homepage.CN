-- OAuthClient 密钥轮换过渡期：持久化旧 secret hash，替代进程内内存缓存
-- 背景：旧实现将过渡期旧 hash 存在进程内 Map，多实例部署时轮换请求只落一个实例，
-- 其余实例在 5 分钟过渡期内立即拒绝旧密钥。改为在 OAuthClient 行内保存
-- previousSecretHash + secretRotatedAt，所有实例共享过渡期状态。

-- AlterTable
ALTER TABLE "OAuthClient" ADD COLUMN "previousSecretHash" TEXT,
ADD COLUMN "secretRotatedAt" TIMESTAMP(3);
