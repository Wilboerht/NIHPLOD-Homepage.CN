-- 消费补录渠道扩充与重排：新增 抖音商城(DOUYIN)/小红书(XIAOHONGSHU)/经销渠道(DEALER)，
-- 展示顺序固定为业务顺序（TMALL/DOUYIN/XIAOHONGSHU/OFFLINE/DEALER/OTHER）；
-- JD/MINIPROGRAM 保留为历史值，供存量数据与 Excel 导入解析兼容。
ALTER TYPE "SpentAdjustmentChannel" RENAME TO "SpentAdjustmentChannel_old";
CREATE TYPE "SpentAdjustmentChannel" AS ENUM ('TMALL', 'DOUYIN', 'XIAOHONGSHU', 'OFFLINE', 'DEALER', 'OTHER', 'JD', 'MINIPROGRAM');

ALTER TABLE "SpentAdjustmentApplication" ALTER COLUMN "channel" TYPE "SpentAdjustmentChannel" USING ("channel"::text::"SpentAdjustmentChannel");
ALTER TABLE "SpentImportRow" ALTER COLUMN "channel" TYPE "SpentAdjustmentChannel" USING ("channel"::text::"SpentAdjustmentChannel");

DROP TYPE "SpentAdjustmentChannel_old";

-- 经销渠道专用：经销商名称（服务端必填校验，其余渠道为空）
ALTER TABLE "SpentAdjustmentApplication" ADD COLUMN "dealerName" TEXT;
