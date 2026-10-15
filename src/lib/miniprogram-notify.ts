/**
 * 小程序订阅消息（积分小程序：发货/审核通知；测肤小程序：报告完成通知）
 *
 * 尽力而为（fail-soft）：模板未配置、小程序凭证缺失、用户无小程序身份、
 * 用户未订阅（43101）、微信接口异常等一律静默跳过（仅日志），不阻断业务主流程。
 *
 * openid 归属说明：ExternalIdentity 的 provider 对全部小程序共用
 * "wechat_miniprogram"，同一用户可能有多枚 openid（不同 AppID 各一枚）。
 * 发送时逐个尝试，命中当前 AppID 的 openid 即成功；不匹配的 openid 微信返回
 * 40003（invalid openid），继续尝试下一枚。
 */
import { prisma } from "@/lib/prisma";
import { resolveMiniprogramCredentials } from "@/lib/miniprogram-clients";
import { sendMiniprogramSubscribeMessage } from "@/lib/wechat";
import { apiConsole } from "@/lib/logger";

/** 积分小程序的 OAuth clientId（与 MINIPROGRAM_CLIENTS / 前端常量一致） */
export const POINTS_MP_CLIENT_ID = "wechat-mp-points";

/** 测肤小程序的 OAuth clientId（与 MINIPROGRAM_CLIENTS / 前端常量一致） */
export const SKIN_MP_CLIENT_ID = "wechat-mp-skin";

/** 微信接口「openid 不属于该 AppID」错误码：用于多 openid 逐一探测 */
const ERRCODE_INVALID_OPENID = 40003;

function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/** 微信订阅消息时间格式：yyyy-MM-dd HH:mm（固定按 Asia/Shanghai；h23 避免部分 ICU 输出 24:xx） */
function formatWxTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

/** 底层发送：遍历用户的全部小程序 openid 逐个尝试（见文件头说明） */
async function sendMiniprogramNotify(params: {
  userId: string;
  /** 小程序 OAuth clientId（决定用哪套 AppID 凭证与 openid 归属探测） */
  mpClientId: string;
  templateId: string | undefined;
  page: string;
  data: Record<string, { value: string }>;
  context: string;
}): Promise<void> {
  const { userId, mpClientId, templateId, page, data, context } = params;
  try {
    if (!templateId) return; // 模板未配置：功能未启用，静默跳过

    const credentials = resolveMiniprogramCredentials(mpClientId);
    if (!credentials) {
      apiConsole.warn(`[MiniprogramNotify] ${context}: 小程序凭证未配置（${mpClientId}），跳过`);
      return;
    }

    const identities = await prisma.externalIdentity.findMany({
      where: { userId, provider: "wechat_miniprogram" },
      select: { subjectId: true },
    });
    if (identities.length === 0) return; // 无小程序身份：非小程序用户，跳过

    for (const identity of identities) {
      const result = await sendMiniprogramSubscribeMessage({
        openid: identity.subjectId,
        templateId,
        page,
        data,
        credentials,
      });
      if (result.ok) return;
      if (result.errcode !== ERRCODE_INVALID_OPENID) {
        // 43101（用户未订阅）等业务性失败：记录后结束，不视为异常
        apiConsole.info(
          `[MiniprogramNotify] ${context}: 未发送（errcode=${result.errcode ?? "?"} ${result.errmsg ?? ""}）`
        );
        return;
      }
    }
  } catch (error) {
    apiConsole.warn(`[MiniprogramNotify] ${context} 异常（忽略）:`, error);
  }
}

/**
 * 兑换发货通知（管理端标记履约时触发）。
 *
 * 微信模板字段约定（需在公众平台按此创建）：
 *   thing1=商品名称（≤20 字）、phrase2=发货状态（"已发货"）、time3=发货时间
 *
 * @param redemptionId 兑换记录 ID（内部查询用户与商品信息）
 */
export async function notifyPointsRedemptionShipped(redemptionId: string): Promise<void> {
  try {
    const redemption = await prisma.pointRedemption.findUnique({
      where: { id: redemptionId },
      select: { userId: true, productName: true, fulfilledAt: true },
    });
    if (!redemption) return;

    await sendMiniprogramNotify({
      userId: redemption.userId,
      mpClientId: POINTS_MP_CLIENT_ID,
      templateId: process.env.MP_POINTS_TEMPLATE_SHIPPED,
      page: "pages/records/records",
      context: "发货订阅消息",
      data: {
        thing1: { value: truncate(redemption.productName, 20) },
        phrase2: { value: "已发货" },
        // 履约流程会写入 fulfilledAt；防御回退当前时间
        time3: { value: formatWxTime(redemption.fulfilledAt ?? new Date()) },
      },
    });
  } catch (error) {
    apiConsole.warn("[MiniprogramNotify] 发货订阅消息异常（忽略）:", error);
  }
}

/**
 * 补录审核结果通知（管理端审核完成时触发）。
 *
 * 微信模板字段约定（需在公众平台按此创建）：
 *   thing1=审核结果（"已通过"/"未通过"）、thing2=说明（核实金额或驳回原因，≤20 字）、
 *   character_string3=订单号（≤32 字符）
 */
export async function notifyPointsSpentReview(params: {
  userId: string;
  orderNo: string;
  status: "APPROVED" | "REJECTED";
  reviewAmount?: number;
  reviewNote?: string;
}): Promise<void> {
  const { userId, orderNo, status, reviewAmount, reviewNote } = params;
  const explanation =
    status === "APPROVED"
      ? `已核实 ¥${(reviewAmount ?? 0).toLocaleString("zh-CN")}`
      : (reviewNote ?? "未通过审核");

  await sendMiniprogramNotify({
    userId,
    mpClientId: POINTS_MP_CLIENT_ID,
    templateId: process.env.MP_POINTS_TEMPLATE_SPENT_REVIEW,
    page: "pages/spent-adjustments/spent-adjustments",
    context: "补录审核订阅消息",
    data: {
      thing1: { value: status === "APPROVED" ? "已通过" : "未通过" },
      thing2: { value: truncate(explanation, 20) },
      character_string3: { value: truncate(orderNo, 32) },
    },
  });
}

/**
 * 测肤报告完成通知（测肤子站 analyze 完成后经内部 API 转发触发）。
 *
 * 模板：公共模板库「检测报告生成提醒」（美妆类目）→ 选用关键词（按此顺序）：
 *   服务名称(thing1) / 温馨提示(thing2) / 完结时间(time3)
 * 若实际模板字段名不同（以「我的模板」详情页占位符为准），改此处 data 键即可。
 *
 * 一次性订阅语义：每次授权=一条推送额度，未订阅（43101）/额度用尽时微信拒绝，
 * 属于正常业务流程（用户可能未在测肤前勾选订阅），仅记录日志。
 *
 * @param sessionId 分析会话 ID：作为跳转参数，点击消息直达小程序报告页
 */
export async function notifySkinReportReady(params: {
  userId: string;
  sessionId?: string | null;
}): Promise<void> {
  try {
    const { userId, sessionId } = params;
    const page = sessionId
      ? `pages/result/result?sessionId=${encodeURIComponent(sessionId)}`
      : "pages/index/index";

    await sendMiniprogramNotify({
      userId,
      mpClientId: SKIN_MP_CLIENT_ID,
      templateId: process.env.MP_SKIN_TEMPLATE_REPORT_READY,
      page,
      context: "报告完成订阅消息",
      data: {
        thing1: { value: "AI 肤质分析报告" }, // 服务名称
        thing2: { value: "报告已生成，点击查看" }, // 温馨提示
        time3: { value: formatWxTime(new Date()) }, // 完结时间（触发即完成时点）
      },
    });
  } catch (error) {
    apiConsole.warn("[MiniprogramNotify] 报告完成订阅消息异常（忽略）:", error);
  }
}
