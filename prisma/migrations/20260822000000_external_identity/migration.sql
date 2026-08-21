-- CreateTable: 外部平台身份（多平台聚合框架）
-- 一个用户可绑定多个外部平台身份（微信开放平台/服务号/小程序，未来 Apple/支付宝等）
CREATE TABLE "ExternalIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "unionId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentity_provider_subjectId_key" ON "ExternalIdentity"("provider", "subjectId");

-- CreateIndex
CREATE INDEX "ExternalIdentity_userId_idx" ON "ExternalIdentity"("userId");

-- CreateIndex
CREATE INDEX "ExternalIdentity_provider_unionId_idx" ON "ExternalIdentity"("provider", "unionId");

-- AddForeignKey
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 数据回填：将已有微信绑定（User.wechatOpenId）写入 ExternalIdentity
-- 与 User.wechatOpenId/wechatUnionId 双写过渡，旧列保留
-- gen_random_uuid() 为 PostgreSQL 13+ 内置函数
INSERT INTO "ExternalIdentity" ("id", "userId", "provider", "subjectId", "unionId", "metadata", "createdAt", "updatedAt")
SELECT gen_random_uuid(), u."id", 'wechat_open', u."wechatOpenId", u."wechatUnionId", NULL, NOW(), NOW()
FROM "User" u
WHERE u."wechatOpenId" IS NOT NULL
ON CONFLICT ("provider", "subjectId") DO NOTHING;
