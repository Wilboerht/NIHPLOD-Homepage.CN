/**
 * 审计日志查询 API
 * GET /api/admin/audit-logs
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { listAuditLogs, AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from "@/lib/audit";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";

const ACTION_LABELS: Record<string, string> = {
  login: "登录", logout: "登出", ship_order: "发货", update_order: "更新订单",
  refund_approve: "同意退款", refund_reject: "拒绝退款",
  create_admin: "创建管理员", update_admin: "更新管理员", delete_admin: "删除管理员",
  create_product: "创建产品", update_product: "更新产品", delete_product: "删除产品",
  batch_product: "批量操作产品", create_category: "创建分类", update_category: "更新分类",
  delete_category: "删除分类", create_job: "创建职位", update_job: "更新职位",
  delete_job: "删除职位", batch_job: "批量操作职位", update_application: "更新简历",
  delete_application: "删除简历", update_message: "更新留言", delete_message: "删除留言",
  batch_message: "批量操作留言", create_coupon: "创建优惠券", update_coupon: "更新优惠券",
  delete_coupon: "删除优惠券", batch_coupon: "批量操作优惠券", run_cron_task: "执行定时任务",
  user_points_adjust: "调整用户积分", update_vip_benefit: "更新会员权益",
  oauth_client_create: "创建 SSO 客户端", oauth_client_update: "更新 SSO 客户端",
  oauth_client_delete: "删除 SSO 客户端", oauth_client_rotate_secret: "轮换 SSO 客户端密钥",
  oauth_client_test: "测试 SSO 客户端", oauth_consent_revoke: "撤销 SSO 授权",
  oauth_session_terminate: "终止 SSO 会话",
  user_login: "用户登录", user_logout: "用户登出",
  user_register: "用户注册", user_reset_password: "用户重置密码",
  user_status_change: "用户状态变更", user_deleted: "用户删除",
  admin_login: "管理员登录", admin_logout: "管理员登出",
  create_application_folder: "创建简历文件夹", update_application_folder: "更新简历文件夹",
  delete_application_folder: "删除简历文件夹", reorder_categories: "重排分类",
  user_wechat_bind: "用户微信绑定", user_oauth_revoke: "用户 OAuth 撤销",
  refresh_token_reuse_detected: "检测到 Refresh Token 复用",
  user_set_password: "用户设置密码",
};

const TARGET_TYPE_LABELS: Record<string, string> = {
  order: "订单", admin: "管理员", product: "产品", category: "分类",
  job: "职位", message: "留言", application: "简历", coupon: "优惠券",
  system: "系统", oauth_client: "SSO 客户端", user: "用户",
  application_folder: "简历文件夹", oauth_consent: "SSO 授权", vip: "会员", oauth_session: "SSO 会话",
};

const querySchema = z.object({
  page: z.preprocess((val) => (val ? Number(val) : 1), z.number().min(1)),
  pageSize: z.preprocess((val) => (val ? Number(val) : 20), z.number().min(1).max(100)),
  action: z.enum(AUDIT_ACTIONS).optional(),
  targetType: z.enum(AUDIT_TARGET_TYPES).optional(),
  adminId: z.string().cuid().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "admin-read");
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(request.url);
    const params = querySchema.parse({
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
      action: searchParams.get("action") || undefined,
      targetType: searchParams.get("targetType") || undefined,
      adminId: searchParams.get("adminId") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
    });

    // CSV 导出 — 提前判断，避免重复查询
    const isExport = searchParams.get("export") === "csv";
    if (isExport) {
      const exportResult = await listAuditLogs({
        page: 1,
        pageSize: 100,
        action: params.action,
        targetType: params.targetType,
        adminId: params.adminId,
        startDate: params.startDate ? new Date(params.startDate) : undefined,
        endDate: params.endDate ? new Date(params.endDate) : undefined,
      });
      const headers = ["时间", "操作人", "操作", "目标类型", "目标ID", "IP地址", "详情"];
      const rows: string[][] = exportResult.items.map((log: Record<string, unknown>) => [
        new Date(log.createdAt as string).toISOString(),
        log.admin ? `${(log.admin as { name: string }).name} (${(log.admin as { email: string }).email})` : "-",
        ACTION_LABELS[log.action as string] || (log.action as string),
        TARGET_TYPE_LABELS[log.targetType as string] || (log.targetType as string),
        (log.targetId as string) || "-",
        (log.ipAddress as string) || "-",
        JSON.stringify(log.detail || {}),
      ]);
      const escapeCSV = (val: string) => `"${val.replace(/"/g, '""')}"`;
      const csv = [headers.join(","), ...rows.map((r) => r.map(escapeCSV).join(","))].join("\n");
      return new NextResponse(`\uFEFF${csv}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=audit-logs.csv",
        },
      });
    }

    const result = await listAuditLogs({
      page: params.page,
      pageSize: params.pageSize,
      action: params.action,
      targetType: params.targetType,
      adminId: params.adminId,
      startDate: params.startDate ? new Date(params.startDate) : undefined,
      endDate: params.endDate ? new Date(params.endDate) : undefined,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    apiConsole.error("[AuditLogs] GET 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "查询失败" } },
      { status: 500 }
    );
  }
}
