import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAdminSession } from "@/lib/auth";
import { getAdminSsoClient } from "@/lib/admin-sso-clients";
import { BA_STEP_UP_ACTION_LABELS, isBaStepUpAction } from "@/lib/admin-step-up-actions";
import { SsoStepUpForm } from "@/components/admin/SsoStepUpForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "高风险操作验证",
  robots: { index: false, follow: false },
};

const STATE_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorPage(message: string) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-brand-cream px-4">
      <div className="max-w-md rounded-2xl border border-red-100 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-brand-charcoal">无法发起二次验证</h1>
        <p className="mt-2 text-sm text-brand-charcoal/65">{message}</p>
      </div>
    </div>
  );
}

export default async function AdminSsoStepUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getCurrentAdminSession();
  const params = await searchParams;
  const clientId = typeof params.client_id === "string" ? params.client_id : "";
  const redirectUri = typeof params.redirect_uri === "string" ? params.redirect_uri : "";
  const state = typeof params.state === "string" ? params.state : "";
  const action = typeof params.action === "string" ? params.action : "";
  const resourceId = typeof params.resource_id === "string" ? params.resource_id : "";

  if (!session) {
    const returnTo = `/admin/sso/step-up?${new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      action,
      resource_id: resourceId,
    }).toString()}`;
    redirect(`/admin-login?reauth=1&redirect=${encodeURIComponent(returnTo)}`);
  }

  const client = (() => {
    try {
      return getAdminSsoClient(clientId);
    } catch {
      return null;
    }
  })();
  if (!client?.stepUp?.enabled) {
    return errorPage("该子站未启用高风险操作二次验证。");
  }
  if (redirectUri !== client.stepUp.redirectUri) {
    return errorPage("回调地址校验失败，请从 BA 工作台重新发起操作。");
  }
  if (!STATE_PATTERN.test(state)) {
    return errorPage("请求状态校验失败，请重新发起操作。");
  }
  if (!isBaStepUpAction(action) || !client.stepUp.actions.includes(action)) {
    return errorPage("不支持的证书操作");
  }
  if (resourceId === "new" && action !== "ba.certificates.issue") {
    return errorPage("只有证书核发可以使用 new 资源");
  }
  if (resourceId !== "new" && !UUID_PATTERN.test(resourceId)) {
    return errorPage("证书标识无效，请重新发起操作。");
  }

  return (
    <SsoStepUpForm
      clientId={client.clientId}
      clientName={client.name}
      redirectUri={client.stepUp.redirectUri}
      state={state}
      action={action}
      actionLabel={BA_STEP_UP_ACTION_LABELS[action]}
      resourceId={resourceId}
    />
  );
}

