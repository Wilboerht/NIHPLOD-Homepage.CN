"use client";

import { useParams } from "next/navigation";
import { FileWarning } from "lucide-react";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { LegalDocumentEditor } from "@/components/admin/legal/LegalDocumentEditor";
import { LEGAL_DOCUMENT_SLUGS, type LegalDocumentSlug } from "@/types/legal";

export default function LegalDocumentEditPage() {
  const params = useParams<{ slug: string | string[] }>();
  const rawSlug = params?.slug;
  const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;
  const isValid =
    typeof slug === "string" && (LEGAL_DOCUMENT_SLUGS as readonly string[]).includes(slug);

  return (
    <RequirePermission permissions={["legal:read", "legal:write"]}>
      {isValid ? (
        <LegalDocumentEditor slug={slug as LegalDocumentSlug} />
      ) : (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-brand-charcoal/60">
          <FileWarning className="h-8 w-8" aria-hidden="true" />
          <p className="text-sm">无效的法务文档地址</p>
        </div>
      )}
    </RequirePermission>
  );
}
