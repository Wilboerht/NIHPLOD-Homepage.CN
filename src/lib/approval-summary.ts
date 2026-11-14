import { APPROVAL_POLICIES, type ApprovalPolicyKey } from "./admin-approval-policy";
import { PERMISSION_LABELS, type AdminPermission } from "./admin-permissions";

export interface ApprovalSummaryField {
  label: string;
  value: string;
  tone?: "default" | "warning" | "danger";
}

export interface ApprovalSummary {
  title: string;
  fields: ApprovalSummaryField[];
  riskNotes: string[];
}

const USER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "正常",
  SUSPENDED: "冻结",
  BANNED: "封禁",
  DELETED: "已注销",
};

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "number") return value.toLocaleString("zh-CN");
  return String(value);
};

/**
 * 审批详情的人类可读摘要。
 * 只读取 payload/targetSnapshot 的业务字段；未知字段降级为原值，不展示完整 JSON。
 */
export function buildApprovalSummary(input: {
  policyKey: string;
  payload: Record<string, unknown> | null;
  targetSnapshot: Record<string, unknown> | null;
  targetLabel: string | null;
}): ApprovalSummary {
  const policy = APPROVAL_POLICIES[input.policyKey as ApprovalPolicyKey];
  const payload = input.payload ?? {};
  const snapshot = input.targetSnapshot ?? {};
  const fields: ApprovalSummaryField[] = [];
  const riskNotes: string[] = [];
  const target = input.targetLabel || formatValue(payload.userId ?? payload.adminId);

  const add = (label: string, value: unknown, tone?: ApprovalSummaryField["tone"]) =>
    fields.push({ label, value: formatValue(value), tone });
  const addStatus = (label: string, value: unknown) =>
    add(label, USER_STATUS_LABELS[String(value)] ?? value);

  switch (input.policyKey) {
    case "points.adjust":
      add("用户", target);
      add("调整分值", Number(payload.amount) > 0 ? `+${payload.amount}` : payload.amount, "warning");
      add("调整原因", payload.note);
      add("当前状态", snapshot.status ? USER_STATUS_LABELS[String(snapshot.status)] : undefined);
      break;
    case "redemption.cancel":
    case "redemption.refund":
      add("兑换记录", target);
      add("扣减积分", snapshot.points);
      add("当前状态", snapshot.status);
      add("备注", payload.note);
      break;
    case "spent.review.approve":
    case "spent.review.undo":
      add("用户", target);
      add("申报金额", snapshot.amountClaimed == null ? "未填写" : `¥${snapshot.amountClaimed}`);
      add("核实金额", payload.reviewAmount ? `¥${payload.reviewAmount}` : "—", "warning");
      add("当前状态", snapshot.status);
      if (payload.reviewNote) add("审核备注", payload.reviewNote);
      break;
    case "spent.import.execute":
      add("文件", target);
      add("行数", snapshot.rowCount);
      add("文件哈希", snapshot.fileHash ? `${String(snapshot.fileHash).slice(0, 16)}…` : undefined);
      add("导入原因", payload.reason);
      break;
    case "spent.import.undo":
      add("批次", target);
      add("总行数 / 成功", `${formatValue(snapshot.totalRows)} / ${formatValue(snapshot.successRows)}`);
      add("总金额", snapshot.totalAmount === undefined ? undefined : `¥${snapshot.totalAmount}`);
      add("撤销原因", payload.reason);
      break;
    case "admin.delete":
      add("目标管理员", target);
      add("角色", snapshot.role);
      add("当前状态", snapshot.status);
      break;
    case "user.status":
      add("用户", target);
      addStatus("当前状态", snapshot.status);
      addStatus("目标状态", payload.status);
      break;
    case "user.delete":
      add("用户", target);
      addStatus("当前状态", snapshot.status);
      riskNotes.push("删除会匿名化用户资料，且不可恢复。");
      break;
    case "user.phone.change":
      add("用户", target);
      add("新手机号", payload.newPhone ? String(payload.newPhone).replace(/(\d{3})\d{4}(\d{4})/, "$1****$2") : undefined);
      riskNotes.push("换绑后用户全部会话将被撤销，新旧手机号都会收到安全通知。");
      break;
    case "user.accounts.merge":
      add("源账户", payload.sourceUserId);
      add("目标账户", payload.targetUserId);
      riskNotes.push("合并会停用源账户；账本、订单、身份或子站冲突时执行会失败。");
      break;
    case "totp.recovery.issue":
      add("目标管理员", target);
      add("恢复原因", payload.reason);
      riskNotes.push("恢复码只显示给审批人，请通过安全渠道交付目标本人。");
      break;
    default:
      for (const [key, value] of Object.entries(payload)) {
        if (key === "previewToken") continue;
        add(key, value);
      }
  }

  const requesterPermission = snapshot.requesterPermission as
    | { actionPermission?: string; hadActionPermission?: boolean }
    | undefined;
  if (requesterPermission?.hadActionPermission === false) {
    const label = requesterPermission.actionPermission
      ? (PERMISSION_LABELS[requesterPermission.actionPermission as AdminPermission] ??
        requesterPermission.actionPermission)
      : "该动作";
    riskNotes.push(`申请人原本不具备「${label}」权限，批准后将以你的身份代为执行。`);
  }

  return {
    title: policy?.label ?? input.policyKey,
    fields,
    riskNotes,
  };
}
