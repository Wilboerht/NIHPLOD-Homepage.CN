-- 主站 -> 测肤子站（Skin-Advisor）管理员 SSO 一次性授权码
CREATE TABLE "AdminSsoCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "codeChallenge" TEXT,
    "codeChallengeMethod" TEXT,
    "adminTokenVersion" INTEGER NOT NULL,
    "mainSessionExp" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSsoCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminSsoCode_code_key" ON "AdminSsoCode"("code");
CREATE INDEX "AdminSsoCode_expiresAt_idx" ON "AdminSsoCode"("expiresAt");
CREATE INDEX "AdminSsoCode_adminId_createdAt_idx" ON "AdminSsoCode"("adminId", "createdAt" DESC);

ALTER TABLE "AdminSsoCode"
    ADD CONSTRAINT "AdminSsoCode_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "Admin"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
