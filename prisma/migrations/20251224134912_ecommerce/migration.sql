-- CreateEnum
CREATE TYPE "PointType" AS ENUM ('REGISTER_BONUS', 'QUESTIONNAIRE_BONUS', 'PURCHASE_REWARD', 'SHARE_REWARD', 'AI_CHAT_CONSUME', 'ADMIN_ADJUST');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REFUNDING', 'REFUNDED');

-- AlterTable
ALTER TABLE "AdvisorQuestion" ADD COLUMN     "gender" TEXT NOT NULL DEFAULT 'all';

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "icon" TEXT;

-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "backgroundImage" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "salesCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stock" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PurchaseLink" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobApplication" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "resumePath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "folderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationFolder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotteryActivity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "prizeName" TEXT NOT NULL,
    "prizeImage" TEXT,
    "prizeCount" INTEGER NOT NULL DEFAULT 1,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "drawTime" TIMESTAMP(3) NOT NULL,
    "rules" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "drawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LotteryActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotteryEntry" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneHash" TEXT NOT NULL,
    "drawingUrl" TEXT NOT NULL,
    "drawingType" TEXT NOT NULL DEFAULT 'flower',
    "flowerData" JSONB,
    "sessionId" TEXT,
    "inviteCode" TEXT NOT NULL,
    "invitedBy" TEXT,
    "inviteCount" INTEGER NOT NULL DEFAULT 0,
    "bonusWeight" INTEGER NOT NULL DEFAULT 0,
    "ip" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "riskFactors" TEXT[],
    "signatureData" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "wonAt" TIMESTAMP(3),
    "wonRank" INTEGER,
    "verifyCode" TEXT,
    "verifyCodeSentAt" TIMESTAMP(3),
    "verifyAttempts" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "recipientName" TEXT,
    "recipientPhone" TEXT,
    "recipientAddress" TEXT,
    "shippedAt" TIMESTAMP(3),
    "trackingNo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LotteryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "nickname" TEXT,
    "avatar" TEXT,
    "wechatOpenId" TEXT,
    "wechatUnionId" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "postalCode" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsCode" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'login',
    "used" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "PointType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "relatedId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvisorConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "analysisResult" JSONB,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "pointsConsumed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdvisorConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "pointsCost" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "shippingFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "payAmount" DECIMAL(10,2) NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "recipientAddress" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" TEXT,
    "paymentTime" TIMESTAMP(3),
    "paymentNo" TEXT,
    "shippingCompany" TEXT,
    "trackingNo" TEXT,
    "shippedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "pointsEarned" INTEGER NOT NULL DEFAULT 0,
    "remark" TEXT,
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productImage" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseLink_productId_idx" ON "PurchaseLink"("productId");

-- CreateIndex
CREATE INDEX "JobApplication_jobId_createdAt_idx" ON "JobApplication"("jobId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "JobApplication_status_createdAt_idx" ON "JobApplication"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "JobApplication_folderId_idx" ON "JobApplication"("folderId");

-- CreateIndex
CREATE INDEX "ApplicationFolder_order_idx" ON "ApplicationFolder"("order");

-- CreateIndex
CREATE INDEX "LotteryActivity_status_startTime_idx" ON "LotteryActivity"("status", "startTime");

-- CreateIndex
CREATE INDEX "LotteryActivity_drawTime_idx" ON "LotteryActivity"("drawTime");

-- CreateIndex
CREATE UNIQUE INDEX "LotteryEntry_inviteCode_key" ON "LotteryEntry"("inviteCode");

-- CreateIndex
CREATE INDEX "LotteryEntry_activityId_status_idx" ON "LotteryEntry"("activityId", "status");

-- CreateIndex
CREATE INDEX "LotteryEntry_activityId_riskScore_idx" ON "LotteryEntry"("activityId", "riskScore");

-- CreateIndex
CREATE INDEX "LotteryEntry_phoneHash_idx" ON "LotteryEntry"("phoneHash");

-- CreateIndex
CREATE INDEX "LotteryEntry_deviceId_idx" ON "LotteryEntry"("deviceId");

-- CreateIndex
CREATE INDEX "LotteryEntry_invitedBy_idx" ON "LotteryEntry"("invitedBy");

-- CreateIndex
CREATE UNIQUE INDEX "LotteryEntry_activityId_phoneHash_key" ON "LotteryEntry"("activityId", "phoneHash");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_wechatOpenId_key" ON "User"("wechatOpenId");

-- CreateIndex
CREATE INDEX "User_phone_idx" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_wechatOpenId_idx" ON "User"("wechatOpenId");

-- CreateIndex
CREATE INDEX "Address_userId_idx" ON "Address"("userId");

-- CreateIndex
CREATE INDEX "SmsCode_phone_type_idx" ON "SmsCode"("phone", "type");

-- CreateIndex
CREATE INDEX "SmsCode_expiresAt_idx" ON "SmsCode"("expiresAt");

-- CreateIndex
CREATE INDEX "PointRecord_userId_createdAt_idx" ON "PointRecord"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PointRecord_type_idx" ON "PointRecord"("type");

-- CreateIndex
CREATE INDEX "AdvisorConversation_userId_createdAt_idx" ON "AdvisorConversation"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ConversationMessage_conversationId_createdAt_idx" ON "ConversationMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "CartItem_userId_idx" ON "CartItem"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_userId_productId_key" ON "CartItem"("userId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNo_key" ON "Order"("orderNo");

-- CreateIndex
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_orderNo_idx" ON "Order"("orderNo");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "AdvisorQuestion_gender_idx" ON "AdvisorQuestion"("gender");

-- AddForeignKey
ALTER TABLE "PurchaseLink" ADD CONSTRAINT "PurchaseLink_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "ApplicationFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotteryEntry" ADD CONSTRAINT "LotteryEntry_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "LotteryActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointRecord" ADD CONSTRAINT "PointRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvisorConversation" ADD CONSTRAINT "AdvisorConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AdvisorConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
