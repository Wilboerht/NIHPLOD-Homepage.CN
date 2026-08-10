/**
 * OAuth 2.0 API 文档端点
 * GET /api/oauth/docs
 *
 * 返回 OpenAPI 3.0 格式的 API 文档，
 * 涵盖 authorize / token / userinfo / introspect / jwks 端点。
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { origin } = request.nextUrl;

  const spec = {
    openapi: "3.0.3",
    info: {
      title: "NIHPLOD SSO OAuth 2.0 API",
      description:
        "NIHPLOD 统一认证中心 OAuth 2.0 + OpenID Connect API 文档。\n\n" +
        "支持授权码流程（Authorization Code Grant）+ PKCE S256。\n\n" +
        "## 快速开始\n\n" +
        "1. 在管理后台注册 OAuth Client，获取 clientId 和 clientSecret\n" +
        "2. 将 `{redirect_uri}` 替换为你的回调地址\n" +
        "3. 使用 `@nihplod/sso-sdk` 快速接入，或手动实现以下端点\n\n" +
        "## 安全提醒\n\n" +
        "- PKCE (S256) 强制启用，确保授权码不被拦截\n" +
        "- redirect_uri 必须精确匹配注册值\n" +
        "- client_secret 仅在后端使用，不可暴露到前端代码\n" +
        "- access_token 有效期 15 分钟，需使用 refresh_token 续期",
      version: "1.0.0",
      contact: {
        name: "NIHPLOD Dev Team",
        url: "https://nihplod.cn",
      },
    },
    servers: [
      {
        url: origin,
        description: "当前环境",
      },
    ],
    tags: [
      { name: "Authorization", description: "授权端点" },
      { name: "Token", description: "Token 端点" },
      { name: "UserInfo", description: "用户信息" },
      { name: "Introspection", description: "Token 验证" },
      { name: "Discovery", description: "服务发现" },
    ],
    paths: {
      "/api/oauth/authorize": {
        get: {
          tags: ["Authorization"],
          summary: "发起 OAuth 授权",
          description:
            "重定向用户到 SSO 登录页，用户登录并授权后返回 authorization code。\n\n支持 PKCE S256。",
          parameters: [
            {
              name: "response_type",
              in: "query",
              required: true,
              schema: { type: "string", enum: ["code"] },
              description: "固定值 `code`",
            },
            {
              name: "client_id",
              in: "query",
              required: true,
              schema: { type: "string" },
              description: "OAuth Client ID",
            },
            {
              name: "redirect_uri",
              in: "query",
              required: true,
              schema: { type: "string", format: "uri" },
              description: "回调 URL（需与注册时一致）",
            },
            {
              name: "scope",
              in: "query",
              required: true,
              schema: { type: "string" },
              description:
                "空格分隔的 scope，如 `openid profile phone`。注意：`openid` 是 OIDC 核心 scope，所有 client 默认允许，无需在 client.scopes 中显式配置。",
            },
            {
              name: "state",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "CSRF 防护 state 参数",
            },
            {
              name: "code_challenge",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "PKCE code_challenge (S256)",
            },
            {
              name: "code_challenge_method",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["S256"] },
              description: "固定值 `S256`",
            },
          ],
          responses: {
            "302": {
              description: "重定向到登录页或 consent 页（已登录用户）",
            },
            "400": {
              description: "参数错误",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/OAuthError" },
                },
              },
            },
          },
        },
      },
      "/api/oauth/token": {
        post: {
          tags: ["Token"],
          summary: "Token 端点",
          description:
            "支持 `authorization_code` 和 `refresh_token` 两种 grant_type。\n\n" +
            "### authorization_code\n" +
            "用授权码换取 access_token + refresh_token + id_token。\n" +
            "需提供 code_verifier 完成 PKCE 校验。\n\n" +
            "### refresh_token\n" +
            "刷新过期的 access_token，旧的 refresh_token 会被收回（原子轮换）。",
          requestBody: {
            required: true,
            content: {
              "application/x-www-form-urlencoded": {
                schema: { $ref: "#/components/schemas/TokenRequest" },
              },
              "application/json": {
                schema: { $ref: "#/components/schemas/TokenRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "成功",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TokenResponse" },
                },
              },
            },
            "400": {
              description: "请求错误（如 invalid_grant）",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/OAuthError" },
                },
              },
            },
            "401": {
              description: "Client 认证失败",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/OAuthError" },
                },
              },
            },
          },
        },
      },
      "/api/oauth/userinfo": {
        get: {
          tags: ["UserInfo"],
          summary: "获取用户信息",
          description:
            "返回当前 access_token 对应的用户信息。\n" +
            "按 token 中的 scope 裁剪返回字段。\n" +
            "敏感字段（phone）进行脱敏处理。",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "用户信息",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/UserInfo" },
                },
              },
            },
            "401": {
              description: "Token 无效或过期",
              headers: {
                "WWW-Authenticate": {
                  schema: { type: "string" },
                  description: 'Bearer error="invalid_token"',
                },
              },
            },
          },
        },
      },
      "/api/oauth/introspect": {
        post: {
          tags: ["Introspection"],
          summary: "验证 Access Token",
          description:
            "RFC 7662 兼容的 Token 内省端点。\n" + "子项目通过此端点验证 access_token 的有效性。",
          requestBody: {
            required: true,
            content: {
              "application/x-www-form-urlencoded": {
                schema: { $ref: "#/components/schemas/IntrospectRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "内省结果",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/IntrospectResponse" },
                },
              },
            },
            "401": {
              description: "Client 认证失败",
            },
          },
        },
      },
      "/api/oauth/jwks.json": {
        get: {
          tags: ["Discovery"],
          summary: "JWKS 端点",
          description: "返回用于验证 access_token 签名的公钥集合（JSON Web Key Set）。",
          responses: {
            "200": {
              description: "JWKS 文档",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      keys: {
                        type: "array",
                        items: { $ref: "#/components/schemas/JWK" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/oauth/.well-known/openid-configuration": {
        get: {
          tags: ["Discovery"],
          summary: "OpenID Connect Discovery",
          description:
            "返回 OIDC Discovery 文档，包含所有端点的 URL 和支持的能力。\n" +
            "SDK 初始化时自动请求此端点。",
          responses: {
            "200": {
              description: "OIDC Discovery 文档",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/OidcDiscovery" },
                },
              },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "OAuth 2.0 Access Token",
        },
      },
      schemas: {
        OAuthError: {
          type: "object",
          properties: {
            error: {
              type: "string",
              description: "错误码",
              enum: [
                "invalid_request",
                "invalid_client",
                "invalid_grant",
                "unauthorized_client",
                "unsupported_grant_type",
                "invalid_scope",
                "access_denied",
                "server_error",
                "rate_limited",
              ],
            },
            error_description: {
              type: "string",
              description: "人类可读的错误描述",
            },
          },
        },
        TokenRequest: {
          type: "object",
          required: ["grant_type", "client_id"],
          properties: {
            grant_type: {
              type: "string",
              enum: ["authorization_code", "refresh_token"],
              description: "授权类型",
            },
            client_id: {
              type: "string",
              description: "OAuth Client ID",
            },
            client_secret: {
              type: "string",
              description: "OAuth Client Secret",
            },
            code: {
              type: "string",
              description: "authorization code（grant_type=authorization_code 时必需）",
            },
            code_verifier: {
              type: "string",
              description: "PKCE code_verifier（若授权时提供了 code_challenge 则必需）",
            },
            redirect_uri: {
              type: "string",
              format: "uri",
              description: "回调 URL（grant_type=authorization_code 时必需，需与授权时一致）",
            },
            refresh_token: {
              type: "string",
              description: "refresh_token（grant_type=refresh_token 时必需）",
            },
          },
        },
        TokenResponse: {
          type: "object",
          properties: {
            access_token: {
              type: "string",
              description: "JWT Access Token",
            },
            token_type: {
              type: "string",
              enum: ["Bearer"],
              description: "Token 类型",
            },
            expires_in: {
              type: "integer",
              description: "有效期（秒），默认 900（15 分钟）",
            },
            refresh_expires_in: {
              type: "integer",
              description:
                "Refresh Token 有效期（秒），默认 2592000（30 天）。若服务端未返回此字段，SDK 回退到 30 天默认值。",
            },
            refresh_token: {
              type: "string",
              description: "Refresh Token（仅 authorization_code 模式返回）",
            },
            id_token: {
              type: "string",
              description: "JWT ID Token",
            },
          },
        },
        UserInfo: {
          type: "object",
          properties: {
            sub: {
              type: "string",
              description: "用户唯一标识",
            },
            nickname: {
              type: "string",
              description: "昵称（需 scope=profile）",
            },
            avatar: {
              type: "string",
              description: "头像 URL（需 scope=profile）",
            },
            phone: {
              type: "string",
              description: "手机号（脱敏，需 scope=phone）",
            },
            membership_level: {
              type: "string",
              description: "会员等级（需 scope=membership）",
            },
            total_points: {
              type: "integer",
              description: "积分总数（需 scope=membership）",
            },
          },
        },
        IntrospectRequest: {
          type: "object",
          required: ["client_id", "client_secret", "token"],
          properties: {
            client_id: { type: "string" },
            client_secret: { type: "string" },
            token: {
              type: "string",
              description: "待验证的 access_token",
            },
          },
        },
        IntrospectResponse: {
          type: "object",
          properties: {
            active: {
              type: "boolean",
              description: "Token 是否有效",
            },
            sub: { type: "string" },
            client_id: { type: "string" },
            scope: { type: "string" },
            exp: { type: "integer" },
          },
        },
        JWK: {
          type: "object",
          properties: {
            kty: { type: "string", description: "密钥类型，当前为 oct（对称密钥）" },
            kid: { type: "string", description: "密钥标识符" },
            alg: { type: "string", description: "签名算法，当前为 HS256" },
          },
          description: "密钥标识符及签名算法。k值不通过 JWKS 公开分发。",
        },
        OidcDiscovery: {
          type: "object",
          properties: {
            issuer: { type: "string", format: "uri" },
            authorization_endpoint: { type: "string", format: "uri" },
            token_endpoint: { type: "string", format: "uri" },
            userinfo_endpoint: { type: "string", format: "uri" },
            jwks_uri: { type: "string", format: "uri" },
            scopes_supported: { type: "array", items: { type: "string" } },
            response_types_supported: { type: "array", items: { type: "string" } },
            grant_types_supported: { type: "array", items: { type: "string" } },
            code_challenge_methods_supported: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  };

  return NextResponse.json(spec, {
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  });
}
