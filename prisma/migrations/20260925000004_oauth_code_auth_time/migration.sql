-- OIDC auth_time：授权码记录用户认证时间，token 端点写入 ID Token 的 auth_time claim
-- （OIDC Core 3.1.3.6：使用 max_age 时 ID Token 必须包含 auth_time）
ALTER TABLE "OAuthAuthorizationCode" ADD COLUMN IF NOT EXISTS "authTime" INTEGER;
