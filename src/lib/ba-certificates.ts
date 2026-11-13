import { resolveBaRole } from "@/lib/admin-permissions";

export interface BaCertificateAdmin {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions?: string[] | null;
  permissionOverrides?: string[] | null;
}

export interface BaCertificateListItem {
  id: string;
  certNumber: string;
  status: string;
  displayStatus: string;
  companyName: string;
  shopName: string;
  scopeText: string;
  authorizer: string;
  phoneMasked: string | null;
  startDate: string;
  endDate: string;
  auditorName: string | null;
  createdAt: string;
  updatedAt: string;
  artifact: { pngReady: boolean; pdfReady: boolean };
  allowedActions: Record<string, boolean>;
}

export interface BaCertificateListData {
  items: BaCertificateListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BaCertificateDetail {
  certificate: BaCertificateListItem;
  timeline: Array<{
    id: string;
    action: string;
    comment: string | null;
    reason: string | null;
    actorName: string | null;
    actorSource: string | null;
    createdAt: string;
  }>;
}

export interface BaCertificateMeta {
  channels: string[];
  defaultScopeText: string;
  companyFullName: string;
  templateVersion: string;
  statuses: string[];
}

export interface BaCertificateDraft {
  companyName: string;
  shopName: string;
  phone?: string;
  scopeText: string;
  duration?: string;
  startDate?: string;
  endDate?: string;
  sealImage?: string | null;
}

const CAPABILITY_BY_PERMISSION: Record<string, string> = {
  "ba:certificates:read": "ba.certificates.read",
  "ba:certificates:download": "ba.certificates.download",
  "ba:certificates:submit": "ba.certificates.submit",
  "ba:certificates:issue": "ba.certificates.issue",
  "ba:certificates:update": "ba.certificates.update",
  "ba:certificates:revoke": "ba.certificates.revoke",
  "ba:certificates:delete": "ba.certificates.delete",
  "ba:certificates:sensitive:read": "ba.certificates.sensitive",
};

export function baCertificateCapabilities(admin: BaCertificateAdmin): string[] {
  const permissions = new Set(admin.permissions ?? []);
  if (admin.role === "owner") {
    return Object.values(CAPABILITY_BY_PERMISSION);
  }
  const capabilities = [...permissions]
    .map((permission) => CAPABILITY_BY_PERMISSION[permission])
    .filter((capability): capability is string => Boolean(capability));
  if (capabilities.includes("ba.certificates.download")) {
    capabilities.push("ba.certificates.read");
  }
  return [...new Set(capabilities)];
}

export function baActorHeader(admin: BaCertificateAdmin): string {
  const payload = {
    externalAdminId: admin.id,
    email: admin.email,
    name: admin.name,
    baRole: resolveBaRole(admin.role, admin.permissionOverrides ?? admin.permissions) ?? null,
    capabilities: baCertificateCapabilities(admin),
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function hasBaCertificateCapability(admin: BaCertificateAdmin, capability: string): boolean {
  return baCertificateCapabilities(admin).includes(capability);
}
