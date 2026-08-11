-- TokenBlacklistType 增加 dpop_jti：DPoP proof jti 防重放记录复用 TokenBlacklist 表
-- （key 前缀 "dpop-jti:"，唯一约束保证跨实例原子性，参照 internal_api_nonce 先例）

-- AlterEnum
ALTER TYPE "TokenBlacklistType" ADD VALUE 'dpop_jti';
