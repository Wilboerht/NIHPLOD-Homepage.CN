import { NextResponse } from "next/server";

export type BaComplaintStatus = "PENDING" | "INVESTIGATING" | "RESOLVED" | "REJECTED";

export interface BaComplaintListItem {
  id: string;
  channel: string | null;
  contactInfoMasked: string | null;
  descriptionPreview: string;
  status: BaComplaintStatus;
  evidenceCount: number;
  handledBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BaComplaintListData {
  items: BaComplaintListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BaComplaintEvidence {
  index: number;
  url: string;
}

export interface BaComplaintAuditLog {
  id: string;
  action: string;
  comment: string | null;
  actorName: string | null;
  actorSource: string | null;
  createdAt: string;
}

export interface BaComplaintDetail {
  id: string;
  description: string;
  channel: string | null;
  contactInfo: string | null;
  status: BaComplaintStatus;
  reviewNote: string | null;
  handledBy: string | null;
  evidenceCount: number;
  evidence: BaComplaintEvidence[];
  createdAt: string;
  updatedAt: string;
}

export interface BaComplaintDetailData {
  complaint: BaComplaintDetail;
  auditLogs: BaComplaintAuditLog[];
}

export interface BaComplaintActionData {
  id: string;
  status: BaComplaintStatus;
  reviewNote: string | null;
  handledBy: string | null;
}

export function mapBaError(result: {
  status: number;
  code: string;
  message: string;
}): NextResponse {
  const passthrough = new Set([400, 404, 409, 429]);
  const status = passthrough.has(result.status) ? result.status : 503;
  return NextResponse.json(
    {
      success: false,
      error: {
        code: result.code || "UPSTREAM_ERROR",
        message: result.message || "BA 服务暂时不可用",
      },
    },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}
