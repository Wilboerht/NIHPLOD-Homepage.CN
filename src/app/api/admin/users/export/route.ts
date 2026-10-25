import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { requireAdminStepUp } from "@/lib/admin-totp";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { maskPhone } from "@/lib/mask-phone";
import type { UserListQuery } from "@/lib/user-query";
import { buildUserWhere, userListQuerySchema } from "@/lib/user-query";
import {
  ADVISOR_EXPORT_GROUPS,
  MEMBERSHIP_LABELS,
  USER_EXPORT_FILE_DESCRIPTIONS,
  USER_EXPORT_GROUPS,
  USER_EXPORT_GROUP_LABELS,
  USER_STATUS_LABELS,
  normalizeUserExportGroups,
  selectedFileNames,
  staticCsvEntry,
  type UserExportEntry,
  type UserExportGroup,
} from "@/lib/user-export";
import { buildDatabaseExportEntries } from "@/lib/user-export-db";
import { buildAdvisorExportEntries, prepareAdvisorContext } from "@/lib/user-export-advisor";
import { createUserExportArchive } from "@/lib/user-export-zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
} as const;

function exportInfoEntry(
  groups: readonly UserExportGroup[],
  params: UserListQuery,
  total: number,
  canReadSensitive: boolean,
  canReadAdvisor: boolean,
  cutoff: Date
): UserExportEntry {
  const selected = new Set(groups);
  const advisorGroups = groups.filter((group) => ADVISOR_EXPORT_GROUPS.includes(group));
  const unselected = USER_EXPORT_GROUPS.filter((group) => !selected.has(group));
  return staticCsvEntry(
    "export-info.csv",
    ["项目", "值"],
    [
      ["导出时间", new Date().toISOString()],
      ["数据截止时间", cutoff.toISOString()],
      ["导出格式", "user-data-zip-v2"],
      ["筛选搜索", params.search ? maskPhone(params.search) : "全部"],
      ["筛选状态", params.status ? (USER_STATUS_LABELS[params.status] ?? params.status) : "全部"],
      ["筛选等级", params.level ? (MEMBERSHIP_LABELS[params.level] ?? params.level) : "全部"],
      ["用户总数", total],
      ["敏感字段", canReadSensitive ? "明文" : "脱敏"],
      ["测肤档案", advisorGroups.length > 0 ? "包含" : canReadAdvisor ? "未包含" : "无权限"],
      ["选中范围", groups.map((group) => USER_EXPORT_GROUP_LABELS[group]).join("；")],
      ["未选择范围", unselected.map((group) => USER_EXPORT_GROUP_LABELS[group]).join("；")],
      [
        "说明",
        "CSV 使用 UTF-8 BOM；测肤完整分析默认不导出，勾选时输出 advisor-session-analysis.jsonl。",
      ],
    ]
  );
}

function manifestEntry(
  groups: readonly UserExportGroup[],
  counts: Record<string, number>,
  includeAdvisorErrors: boolean
): UserExportEntry {
  const files = ["export-info.csv", ...selectedFileNames(groups)];
  if (includeAdvisorErrors) files.push("advisor-errors.csv");
  const rows: (readonly unknown[])[] = files.map((file) => [
    file,
    counts[file] ?? 0,
    "已导出",
    USER_EXPORT_FILE_DESCRIPTIONS[file] ?? "",
  ]);
  rows.push(["manifest.csv", "-", "已生成", USER_EXPORT_FILE_DESCRIPTIONS["manifest.csv"]]);
  return staticCsvEntry("manifest.csv", ["文件名", "数据行数", "状态", "说明"], rows);
}

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    if (
      !hasAdminPermission(admin, "users:read") ||
      !hasAdminPermission(admin, "users:export")
    ) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：用户数据导出" } },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const { searchParams } = new URL(request.url);
    const isCheck = searchParams.get("check") === "1";
    const limit = await rateLimit(
      `user-export-${isCheck ? "check" : "run"}:${admin.id}`,
      "default",
      isCheck
        ? { maxRequests: 30, windowMs: 60 * 1000 }
        : { maxRequests: 5, windowMs: 10 * 60 * 1000 }
    );
      if (!limit.success) {
        return NextResponse.json(
          { success: false, error: { code: "RATE_LIMITED", message: "导出过于频繁，请稍后再试" } },
          { status: 429, headers: NO_STORE_HEADERS }
        );
      }

      const stepUpResponse = await requireAdminStepUp(request, admin);
      if (stepUpResponse) return stepUpResponse;

      const params = userListQuerySchema.parse({
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
      search: searchParams.get("search"),
      status: searchParams.get("status"),
      level: searchParams.get("level"),
    });
    const includeRaw = searchParams.get("include");
    if (includeRaw && includeRaw.length > 500) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_INCLUDE", message: "导出范围参数过长" } },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const canReadSensitive = hasAdminPermission(admin, "users:sensitive:read");
    const canReadAdvisor = hasAdminPermission(admin, "advisor:users:read");
    const normalized = normalizeUserExportGroups(includeRaw, canReadAdvisor);
    if (normalized.invalid.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_INCLUDE",
            message: `未知的导出范围：${normalized.invalid.join(", ")}`,
          },
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    if (normalized.requestedAdvisor && !canReadAdvisor) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "FORBIDDEN", message: "权限不足：测肤子站档案导出" },
        },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const groups = normalized.groups;
    const advisorGroups = groups.filter((group) => ADVISOR_EXPORT_GROUPS.includes(group));
    const exportCutoff = new Date();
    const where = {
      AND: [buildUserWhere(params), { createdAt: { lte: exportCutoff } }],
    };
    const total = await prisma.user.count({ where });
    const dataFiles = selectedFileNames(groups);
    if (advisorGroups.length > 0) dataFiles.push("advisor-errors.csv");

    if (isCheck) {
      return NextResponse.json(
        {
          success: true,
          data: {
            total,
            sensitive: canReadSensitive,
            advisorAvailable: canReadAdvisor,
            groups,
            files: dataFiles,
          },
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    const auditDetail = {
      search: params.search ? maskPhone(params.search) : null,
      status: params.status ?? null,
      level: params.level ?? null,
      totalCount: total,
      exportedCount: 0,
      groups,
      files: {} as Record<string, number>,
      sensitive: canReadSensitive,
      includeAdvisor: advisorGroups.length > 0,
      format: "zip",
    };
    const auditId = await beginAuditLog({
      action: "user_export",
      targetType: "user",
      detail: auditDetail,
      adminId: admin.id,
      request,
    });
    if (!auditId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "AUDIT_UNAVAILABLE", message: "审计服务不可用，已拒绝导出" },
        },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }

    const { output, append, finalize } = createUserExportArchive();
    const counts: Record<string, number> = {};
    let auditDone = false;
    const finishAudit = async (outcome: "SUCCESS" | "FAILURE", detail: Record<string, unknown>) => {
      if (auditDone) return;
      auditDone = true;
      try {
        await finishAuditLog(auditId, outcome, detail);
      } catch (error) {
        apiConsole.error("[AdminUserExport] 审计结算失败:", error);
      }
    };

    let aborted = false;
    const onAbort = () => {
      aborted = true;
      output.destroy(new Error("EXPORT_ABORTED"));
    };
    if (request.signal.aborted) onAbort();
    else request.signal.addEventListener("abort", onAbort, { once: true });

    const build = async () => {
      try {
        if (aborted) throw new Error("EXPORT_ABORTED");
        counts["export-info.csv"] = await append(
          exportInfoEntry(groups, params, total, canReadSensitive, canReadAdvisor, exportCutoff)
        );
        for (const entry of buildDatabaseExportEntries({
          where,
          groups,
          canReadSensitive,
        })) {
          counts[entry.name] = await append(entry);
          if (aborted) throw new Error("EXPORT_ABORTED");
        }
        if (advisorGroups.length > 0) {
          const context = await prepareAdvisorContext({
            where,
            groups,
            signal: request.signal,
          });
          for (const entry of buildAdvisorExportEntries(context, groups)) {
            counts[entry.name] = await append(entry);
            if (aborted) throw new Error("EXPORT_ABORTED");
          }
        }
        counts["manifest.csv"] = await append(
          manifestEntry(groups, counts, advisorGroups.length > 0)
        );
        await finalize();
        if (aborted) throw new Error("EXPORT_ABORTED");
        await finishAudit("SUCCESS", {
          ...auditDetail,
          exportedCount: counts["users.csv"] ?? 0,
          files: counts,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await finishAudit("FAILURE", { ...auditDetail, error: message, files: counts });
        output.destroy(error instanceof Error ? error : new Error(message));
      } finally {
        request.signal.removeEventListener("abort", onAbort);
      }
    };
    void build();

    const filename = `user-data-${new Date().toISOString().slice(0, 10)}.zip`;
    return new NextResponse(Readable.toWeb(output) as unknown as ReadableStream<Uint8Array>, {
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "参数错误", details: error.issues },
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    apiConsole.error("[AdminUserExport] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
