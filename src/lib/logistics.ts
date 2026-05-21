/**
 * 物流服务
 * 物流查询和状态更新
 * 注意：此文件仅供服务端使用
 */
import { prisma } from "./prisma";
import { OrderStatus } from "@/generated/prisma/client";
import { LOGISTICS_COMPANIES } from "./logistics-constants";
import { querySFExpressRoute } from "./sf-express";
import { apiConsole } from "@/lib/logger";

// 重新导出常量以保持兼容性
export { LOGISTICS_COMPANIES } from "./logistics-constants";

/**
 * 物流轨迹信息
 */
export interface LogisticsTrace {
  time: string;
  status: string;
  location?: string;
}

/**
 * 物流信息
 */
export interface LogisticsInfo {
  company: string;
  companyName: string;
  trackingNo: string;
  status: string;
  traces: LogisticsTrace[];
}

/**
 * 发货（更新订单物流信息）
 */
export async function shipOrder(
  orderId: string,
  logisticsCompany: string,
  trackingNo: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return { success: false, error: "订单不存在" };
    }

    if (order.status !== OrderStatus.PAID && order.status !== OrderStatus.PROCESSING) {
      return { success: false, error: "订单状态不正确" };
    }

    await prisma.$transaction(async (tx) => {
      const currentOrder = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true },
      });
      if (!currentOrder || (currentOrder.status !== OrderStatus.PAID && currentOrder.status !== OrderStatus.PROCESSING)) {
        throw new Error("订单状态不正确");
      }
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.SHIPPED,
          shippingCompany: logisticsCompany,
          trackingNo,
          shippedAt: new Date(),
        },
      });
    });

    console.log(`[Logistics] 订单发货: ${order.orderNo} - ${logisticsCompany} ${trackingNo}`);
    return { success: true };
  } catch (error) {
    apiConsole.error("[Logistics] 发货失败:", error);
    return { success: false, error: "发货失败" };
  }
}

/**
 * 查询物流信息
 * 优先对接顺丰丰桥真实 API，未配置时回退到模拟数据
 */
export async function queryLogistics(orderId: string): Promise<LogisticsInfo | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      shippingCompany: true,
      trackingNo: true,
      status: true,
      shippedAt: true,
    },
  });

  if (!order?.trackingNo) {
    return null;
  }

  const company = LOGISTICS_COMPANIES.find((c) => c.code === order.shippingCompany);

  // 顺丰优先对接丰桥真实 API
  if (order.shippingCompany === "SF") {
    const sfResult = await querySFExpressRoute(order.trackingNo);
    if (sfResult.success && sfResult.traces) {
      return {
        company: order.shippingCompany,
        companyName: company?.name || "顺丰速运",
        trackingNo: order.trackingNo,
        status: order.status,
        traces: sfResult.traces.map((t) => ({
          time: t.time,
          status: t.status,
          location: t.location,
        })),
      };
    }
    // 丰桥查询失败时回退到模拟数据（避免页面空白）
    console.warn("[Logistics] 顺丰丰桥查询失败，使用模拟数据:", sfResult.error);
  }

  // 模拟物流轨迹（其他物流公司或未配置丰桥时）
  const traces: LogisticsTrace[] = [];

  if (order.shippedAt) {
    traces.push({
      time: order.shippedAt.toISOString(),
      status: "快件已发出",
      location: "深圳市",
    });
  }

  if (order.status === OrderStatus.SHIPPED) {
    traces.push({
      time: new Date().toISOString(),
      status: "快件运输中",
      location: "转运中心",
    });
  }

  if (order.status === OrderStatus.COMPLETED) {
    traces.push({
      time: new Date().toISOString(),
      status: "已签收",
    });
  }

  return {
    company: order.shippingCompany || "",
    companyName: company?.name || order.shippingCompany || "",
    trackingNo: order.trackingNo,
    status: order.status,
    traces: traces.reverse(),
  };
}

/**
 * 确认收货
 */
export async function confirmReceipt(
  orderId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId },
    });

    if (!order) {
      return { success: false, error: "订单不存在" };
    }

    if (order.status !== OrderStatus.SHIPPED) {
      return { success: false, error: "订单状态不正确" };
    }

    // 更新订单状态
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.COMPLETED,
        receivedAt: new Date(),
      },
    });

    console.log(`[Logistics] 确认收货: ${order.orderNo}`);
    return { success: true };
  } catch (error) {
    apiConsole.error("[Logistics] 确认收货失败:", error);
    return { success: false, error: "操作失败" };
  }
}

