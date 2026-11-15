/**
 * 主站管理员登出时撤销子站管理员会话。
 *
 * 管理员 SSO 在 BA/测肤建立的是本地会话，主站 JWT 撤销不会自动失效。
 * 这里做 best-effort fan-out；子站不可达不影响主站退出，但调用方应提示。
 */
import { baActorRequest } from "@/lib/ba-certificate-proxy";
import { advisorRequest } from "@/lib/advisor-internal";
import { apiConsole } from "@/lib/logger";

export interface SubsiteAdminIdentity {
  id: string;
  email: string;
  name: string;
  role: string;
  permissionOverrides?: string[] | null;
}

export interface SubsiteRevokeResult {
  target: "ba" | "advisor";
  ok: boolean;
  code?: string;
  message?: string;
}

const BA_REVOKE_PATH = "/api/internal/admin/session/revoke";
const ADVISOR_REVOKE_PATH = "/api/internal/admin/session/revoke";

export async function revokeSubsiteAdminSessions(
  admin: SubsiteAdminIdentity
): Promise<SubsiteRevokeResult[]> {
  const results: SubsiteRevokeResult[] = [];
  const tasks: Promise<SubsiteRevokeResult>[] = [];

  if (process.env.BA_ADMIN_SSO_ENABLED === "true") {
    tasks.push(
      baActorRequest<{ revoked: boolean }>(admin, BA_REVOKE_PATH, {
        method: "POST",
        query: { externalAdminId: admin.id },
        body: {},
        timeoutMs: 3000,
      }).then((result): SubsiteRevokeResult => {
        if (result.ok) return { target: "ba", ok: true };
        return {
          target: "ba",
          ok: false,
          code: result.code,
          message: result.message,
        };
      })
    );
  }

  if (process.env.ADVISOR_ADMIN_SSO_ENABLED === "true") {
    tasks.push(
      advisorRequest(ADVISOR_REVOKE_PATH, {
        method: "POST",
        query: { externalAdminId: admin.id },
        body: {},
        signQuery: true,
        timeoutMs: 3000,
      }).then((result): SubsiteRevokeResult => {
        if (result.ok) return { target: "advisor", ok: true };
        return {
          target: "advisor",
          ok: false,
          code: result.code,
          message: result.message,
        };
      })
    );
  }

  for (const task of tasks) {
    try {
      results.push(await task);
    } catch (error) {
      apiConsole.warn("[SubsiteAdminSession] revoke failed", { error: String(error) });
    }
  }
  return results;
}
