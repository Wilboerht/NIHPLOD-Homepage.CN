import { NextRequest } from "next/server";
import { handleBaCertificateAction } from "@/lib/ba-certificate-action-route";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleBaCertificateAction(request, id, {
    path: "issue",
    permission: "ba:certificates:issue",
    action: "issue",
    auditAction: "ba_certificate_issue",
    requireStepUp: true,
    includeDraft: true,
  });
}
