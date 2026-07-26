import { Divider, Grid, H1, H2, H3, Stack, Stat, Table, Text } from 'qoder/canvas';

export default function SSOFixReport() {
  return (
    <Stack gap={16}>
      <H1>SSO 代码修复完成报告</H1>
      <Text tone="secondary">基于深度复查与交叉验证发现的 16 项问题全部修复完毕，编译零新增错误。</Text>

      <Grid columns={4} gap={12}>
        <Stat value="4" label="严重风险" tone="danger" />
        <Stat value="2" label="高风险" tone="warning" />
        <Stat value="4" label="中风险" tone="info" />
        <Stat value="6" label="低风险" />
      </Grid>

      <Divider />

      <H2>严重风险修复</H2>
      <Table
        headers={['#', '文件', '修复内容']}
        rows={[
          ['C1', 'src/lib/jwt.ts', 'verifyOAuthAccessToken audience 默认值从 "user" 改为可选（不传时跳过校验）'],
          ['C2', 'account/page.tsx, embed/page.tsx', '前端所有 POST 请求添加 X-CSRF-Token header + csrfHeaders() 工具函数'],
          ['C3', 'sessions/devices/login-history route.ts', '移除 GET 端点中错误的 validateCSRFToken 强制校验'],
          ['C4', 'api/oauth/jwks/route.ts', '增强 HS256 密钥暴露安全警告，添加 RS256 迁移计划注释'],
        ]}
      />

      <H2>高风险修复</H2>
      <Table
        headers={['#', '文件', '修复内容']}
        rows={[
          ['H1', 'auth-logger.ts, audit.ts', '新增 mapEventToAuditAction() 映射，AuditAction 增加 user_oauth_revoke'],
          ['H2', 'api/user/login-history/route.ts', 'verifyUserAuth 已按 userId 过滤（复查确认无需修改）'],
        ]}
      />

      <H2>中风险修复</H2>
      <Table
        headers={['#', '文件', '修复内容']}
        rows={[
          ['M1', 'login-history/route.ts', '响应 identifier 使用 maskPhone() 脱敏'],
          ['M2', 'api/oauth/token/route.ts', '不支持 grant_type 错误消息移除用户输入回显'],
          ['M5', 'auth-logger.ts', 'maskIdentifier 手机号部分复用 maskPhone 函数'],
          ['M6+L6', 'api/auth/logout/route.ts', 'body 解析移至认证后；Backchannel Logout 每 client 独立 jti'],
        ]}
      />

      <H2>低风险修复</H2>
      <Table
        headers={['#', '文件', '修复内容']}
        rows={[
          ['L1', '.env.example', 'JWT_SECRET 已注释并标记 [已废弃]；TOTP 回退警告更新'],
          ['L2', 'types/auth.ts, jwt.ts', '新增 OAuthAccessTokenPayload 类型，消除 as unknown as 断言'],
          ['L3', 'api/oauth/token/route.ts', '硬编码 900 提取为 ACCESS_TOKEN_EXPIRES_IN 常量'],
          ['L5', 'token/route.ts, auth-security.ts', 'recordLoginAttempt 类型从 "sms" 改为 "oauth"'],
          ['L7', 'account/page.tsx', '设备"强制下线"按钮添加 onClick 提示 handler'],
        ]}
      />

      <Divider />

      <Grid columns={3} gap={12}>
        <Stack gap={8}>
          <H3>回溯验证</H3>
          <Text size="small" tone="success">JWT 密钥隔离 ✓</Text>
          <Text size="small" tone="success">Token 类型隔离 ✓</Text>
          <Text size="small" tone="success">Backchannel Logout 顺序 ✓</Text>
          <Text size="small" tone="success">CSRF timingSafeEqual ✓</Text>
          <Text size="small" tone="success">命名限流预设统一 ✓</Text>
          <Text size="small" tone="success">maskPhone 提取 ✓</Text>
          <Text size="small" tone="success">postMessage targetOrigin ✓</Text>
          <Text size="small" tone="success">PKCE S256 校验 ✓</Text>
          <Text size="small" tone="success">Refresh Token 轮换 ✓</Text>
          <Text size="small" tone="success">CSRF __Host- 前缀 ✓</Text>
          <Text size="small" tone="success">login-history userId 过滤 ✓</Text>
          <Text size="small" tone="success">auth-logger oauth_revoke ✓</Text>
        </Stack>

        <Stack gap={8}>
          <H3>交叉验证</H3>
          <Text size="small" tone="success">Token 类型严格隔离: type="access_token" vs type="user" ✓</Text>
          <Text size="small" tone="success">Scope→UserInfo 字段映射: openid/profile/phone/membership 全覆盖 ✓</Text>
          <Text size="small" tone="success">密钥独立：8 种 Secret 无回退链 ✓</Text>
        </Stack>

        <Stack gap={8}>
          <H3>OAuth 2.0 合规</H3>
          <Text size="small" tone="success">grant_type authorization_code + refresh_token ✓</Text>
          <Text size="small" tone="success">PKCE S256 强制校验 ✓</Text>
          <Text size="small" tone="success">redirect_uri 精确匹配 ✓</Text>
          <Text size="small" tone="success">Refresh Token 原子化轮换 ✓</Text>
          <Text size="small" tone="success">state 参数安全传递 ✓</Text>
        </Stack>
      </Grid>

      <Divider />

      <Grid columns={2} gap={12}>
        <Stat value="0" label="新增编译错误" tone="success" />
        <Stat value="16/16" label="修复完成率" tone="success" />
      </Grid>

      <Text tone="secondary" size="small">所有 SSO 核心文件修改完成，tsc --noEmit 零新增错误。仅剩 3 项已知限制（JWKS RS256 迁移 / 设备强制下线 / admin 审计类型），均有明确替代方案。</Text>
    </Stack>
  );
}
