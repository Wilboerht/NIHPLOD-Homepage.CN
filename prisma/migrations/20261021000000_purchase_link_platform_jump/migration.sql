ALTER TABLE "PurchaseLink" ADD COLUMN "platformKey" TEXT;
ALTER TABLE "PurchaseLink" ADD COLUMN "miniProgramShortLink" TEXT;
ALTER TABLE "PurchaseLink" ADD COLUMN "miniProgramPath" TEXT;

DELETE FROM "PurchaseLink" WHERE "platform" ILIKE '%官方商城%';

UPDATE "PurchaseLink"
SET "platformKey" = CASE
  WHEN "platform" ILIKE '%天猫%' THEN 'tmall'
  WHEN "platform" ILIKE '%小红书%' THEN 'xiaohongshu'
  WHEN "platform" ILIKE '%抖音%' THEN 'douyin'
  WHEN "platform" ILIKE '%微信小店%' OR "platform" ILIKE '%微信小铺%' THEN 'wechat-shop'
  ELSE NULL
END;

UPDATE "PurchaseLink"
SET "platform" = CASE "platformKey"
  WHEN 'tmall' THEN '天猫国际'
  WHEN 'xiaohongshu' THEN '小红书'
  WHEN 'douyin' THEN '抖音'
  WHEN 'wechat-shop' THEN '微信小店'
  ELSE "platform"
END
WHERE "platformKey" IS NOT NULL;

DELETE FROM "PurchaseLink" a
USING "PurchaseLink" b
WHERE a."platformKey" IS NOT NULL
  AND a."productId" = b."productId"
  AND a."platformKey" = b."platformKey"
  AND (
    a."order" > b."order"
    OR (a."order" = b."order" AND a."id" > b."id")
  );

CREATE UNIQUE INDEX "PurchaseLink_productId_platformKey_key"
  ON "PurchaseLink"("productId", "platformKey");
