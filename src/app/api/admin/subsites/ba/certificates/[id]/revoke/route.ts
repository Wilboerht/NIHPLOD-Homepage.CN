import { NextRequest } from "next/server";
import { handleBaCertificateAction } from "@/lib/ba-certificate-action-route";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleBaCertificateAction(request, id, {
    path: "revoke",
    permission: "ba:certificates:revoke",
    action: "revoke",
    auditAction: "ba_certificate_revoke",
    requireStepUp: true,
    requireReason: true,
  });
}
