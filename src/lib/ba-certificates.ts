import { resolveAdminPermissions, resolveBaRole } from "@/lib/admin-permissions";

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
  phone?: string | null;
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
  "ba:access": "ba.access",
  "ba:admin": "ba.admin",
  "ba:complaints:read": "ba.complaints.read",
  "ba:complaints:write": "ba.complaints.write",
  "ba:complaints:delete": "ba.complaints.delete",
  "ba:complaints:sensitive:read": "ba.complaints.sensitive",
  "ba:certificates:read": "ba.certificates.read",
  "ba:certificates:download": "ba.certificates.download",
  "ba:certificates:submit": "ba.certificates.submit",
  "ba:certificates:issue": "ba.certificates.issue",
  "ba:certificates:update": "ba.certificates.update",
  "ba:certificates:revoke": "ba.certificates.revoke",
  "ba:certificates:delete": "ba.certificates.delete",
  "ba:certificates:sensitive:read": "ba.certificates.sensitive",
};

export function baEffectivePermissions(admin: BaCertificateAdmin): string[] {
  if (admin.role === "owner") return resolveAdminPermissions("owner");
  return resolveAdminPermissions(
    admin.role,
    admin.permissionOverrides ?? admin.permissions ?? []
  );
}

export function baActorCapabilities(admin: BaCertificateAdmin): string[] {
  const capabilities = [...new Set(baEffectivePermissions(admin))]
    .map((permission) => CAPABILITY_BY_PERMISSION[permission])
    .filter((capability): capability is string => Boolean(capability));
  if (capabilities.includes("ba.certificates.download")) {
    capabilities.push("ba.certificates.read");
  }
  if (capabilities.includes("ba.admin")) {
    capabilities.push(
      "ba.access",
      "ba.complaints.read",
      "ba.complaints.write",
      "ba.complaints.delete",
      "ba.complaints.sensitive"
    );
  }
  return [...new Set(capabilities)];
}

export function baCertificateCapabilities(admin: BaCertificateAdmin): string[] {
  return baActorCapabilities(admin).filter((capability) =>
    capability.startsWith("ba.certificates.")
  );
}

/** 从授权范围文本中提取平台名称，供列表紧凑展示。 */
export function extractBaScopePlatforms(scopeText: string, channels: string[] = []): string[] {
  const text = scopeText.trim();
  if (!text) return [];

  const matched = channels
    .map((channel) => channel.trim())
    .filter((channel) => channel && text.includes(channel));
  if (matched.length > 0) return [...new Set(matched)];

  const listPart = text.split(/[：:]/).pop() ?? text;
  const cleaned = listPart
    .replace(/^(本证书)?(授权|适用范围|范围|适用于|适用|包括|包含|仅限|平台|渠道|为|是|在)+/g, "")
    .replace(/(等)?(平台|渠道|范围)?(内)?(使用|可用|销售|授权)?[。.!！]?$/g, "")
    .trim();

  return [
    ...new Set(
      cleaned
        .split(/[、,，;；/]/)
        .map((part) => part.replace(/^(在|于)/, "").replace(/(平台|渠道)$/, "").trim())
        .filter(
          (part) =>
            part.length > 0 &&
            part.length <= 20 &&
            !/[。！？!?]/.test(part) &&
            part !== "等平台"
        )
    ),
  ];
}


export function baActorHeader(admin: BaCertificateAdmin): string {
  const payload = {
    externalAdminId: admin.id,
    email: admin.email,
    name: admin.name,
    baRole: resolveBaRole(admin.role, admin.permissionOverrides ?? admin.permissions) ?? null,
    capabilities: baActorCapabilities(admin),
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function hasBaCertificateCapability(admin: BaCertificateAdmin, capability: string): boolean {
  return baCertificateCapabilities(admin).includes(capability);
}
