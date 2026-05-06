/**
 * 订单服务
 * 订单创建、状态管理、库存扣减
 */
import { prisma } from "./prisma";
import { OrderStatus } from "@/generated/prisma/client";
import { ensureMoneyPrecision } from "./money";

/**
 * 生成订单号
 * 格式: yyyyMMddHHmmss + 6位随机数
 */
export function generateOrderNo(): string {
  const now = new Date();
  const datePart = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const randomPart = Math.random().toString().slice(2, 8);
  return `${datePart}${randomPart}`;
}

/**
 * 订单项数据
 */
export interface OrderItemData {
  productId: string;
  quantity: number;
}

export interface Recipient {
  name: string;
  phone: string;
  address: string;
}

/**
 * 创建订单
 * 支持通过 addressId 或直接传入 recipient 信息
 */
export async function createOrder(
  userId: string,
  items: OrderItemData[],
  shippingInfo: { addressId?: string; recipient?: Recipient },
  remark?: string,
  userCouponId?: string
): Promise<{ success: boolean; orderId?: string; orderNo?: string; error?: string }> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      let recipientName = "";
      let recipientPhone = "";
      let recipientAddress = "";

      // 1. 处理收货信息
      if (shippingInfo.recipient) {
        recipientName = shippingInfo.recipient.name;
        recipientPhone = shippingInfo.recipient.phone;
        recipientAddress = shippingInfo.recipient.address;
      } else if (shippingInfo.addressId) {
        const address = await tx.address.findFirst({
          where: { id: shippingInfo.addressId, userId },
        });
        if (!address) {
          throw new Error("收货地址不存在");
        }
        recipientName = address.name;
        recipientPhone = address.phone;
        recipientAddress = `${address.province} ${address.city} ${address.district} ${address.detail}`;
      } else {
        throw new Error("请提供收货信息");
      }

      // 2. 获取商品信息并计算价格
      let totalAmount = 0;
      const orderItems: Array<{
        productId: string;
        productName: string;
        productImage: string | null;
        price: number;
        quantity: number;
        subtotal: number;
      }> = [];

      for (const item of items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
          include: { images: { take: 1 } },
        });

        if (!product || !product.published) {
          throw new Error(`商品 ${item.productId} 不存在或已下架`);
        }

        // 检查是否允许站内购买
        if (!product.allowDirectBuy) {
          throw new Error(`${product.name} 不支持站内购买`);
        }

        const price = Number(product.price);

        // 原子扣减库存（检查+扣减一步完成，避免并发超卖）
        const stockUpdate = await tx.product.updateMany({
          where: {
            id: item.productId,
            stock: { gte: item.quantity },
          },
          data: {
            stock: { decrement: item.quantity },
          },
        });

        if (stockUpdate.count === 0) {
          throw new Error(`${product.name} 库存不足`);
        }

        const subtotal = ensureMoneyPrecision(price * item.quantity);
        totalAmount = ensureMoneyPrecision(totalAmount + subtotal);
        orderItems.push({
          productId: item.productId,
          productName: product.name,
          productImage: product.images[0]?.url || null,
          price,
          quantity: item.quantity,
          subtotal,
        });
      }

      // 3. 优惠券处理
      let discountAmount = 0;
      let usedCouponId: string | undefined = undefined;

      if (userCouponId) {
        const now = new Date();
        const userCoupon = await tx.userCoupon.findFirst({
          where: {
            id: userCouponId,
            userId,
            status: 'UNUSED',
            expiresAt: { gt: now }
          },
          include: { coupon: true }
        });

        if (!userCoupon) {
          throw new Error("优惠券无效或已过期");
        }

        const { coupon } = userCoupon;

        // 校验门槛
        if (totalAmount < Number(coupon.minAmount)) {
          throw new Error(`订单金额未满足优惠券门槛 (需满 ${coupon.minAmount}元)`);
        }

        // 计算优惠
        if (coupon.type === 'DISCOUNT_AMOUNT') {
          // 满减券：直接减去固定金额
          discountAmount = Number(coupon.value);
          // 零元购防护：满减券金额必须严格小于订单金额（不允许完全免费）
          if (discountAmount >= totalAmount) {
            throw new Error(`优惠券金额异常：优惠金额 (${discountAmount}元) 不能超过订单金额 (${totalAmount}元)`);
          }
        } else if (coupon.type === 'DISCOUNT_PERCENT') {
          // 折扣券：value 存储的是折扣比例（保留价格的比例）
          // 规范：value 必须在 (0, 1) 之间，例如：
          //   0.9  → 九折 → 优惠 10%
          //   0.8  → 八折 → 优惠 20%
          //   0.5  → 五折 → 优惠 50%
          const discountRate = Number(coupon.value);
          if (discountRate <= 0 || discountRate >= 1) {
            // value 不合法（后台应强制约束 0 < value < 1），此处防御性抛出错误
            throw new Error(`优惠券折扣比例无效 (value=${discountRate})，应为 0 到 1 之间的小数，例如 0.8 表示八折`);
          }
          discountAmount = totalAmount * (1 - discountRate);
        }

        // 防止负数
        if (discountAmount > totalAmount) discountAmount = totalAmount;
        discountAmount = ensureMoneyPrecision(discountAmount);

        usedCouponId = userCoupon.id;

        // 锁定优惠券
        await tx.userCoupon.update({
          where: { id: userCoupon.id },
          data: {
            status: 'LOCKED',
            // orderId 会在 order create 时关联，或者这里不用管，下面建立关联
          }
        });
      }

      // 4. 创建订单
      const payAmount = ensureMoneyPrecision(Math.max(0, totalAmount - discountAmount));
      const orderNo = generateOrderNo();

      const order = await tx.order.create({
        data: {
          orderNo,
          userId,
          status: OrderStatus.PENDING,
          totalAmount,
          discountAmount,
          payAmount,
          // 收货信息快照
          recipientName,
          recipientPhone,
          recipientAddress,
          remark,
          items: {
            create: orderItems,
          },
          // 关联优惠券 (反向关联，如果在 UserCoupon 定义了 unique orderId，则 prisma 可以通过 userCoupon connect 处理)
          // 我们的 Schema: Order { userCoupon UserCoupon? }
          // UserCoupon { orderId String? @unique }
          // 所以这里应该 update UserCoupon connect Order，或者在 create order 时 connect。
          // 由于 UserCoupon 是 optional，prisma 语法:
          ...(usedCouponId ? {
            userCoupon: {
              connect: { id: usedCouponId }
            }
          } : {})
        },
      });

      // 5. 清除购物车中已购买的商品
      const productIds = items.map((i) => i.productId);
      await tx.cartItem.deleteMany({
        where: {
          userId,
          productId: { in: productIds },
        },
      });

      return { orderId: order.id, orderNo: order.orderNo };
    });

    console.log(`[Order] 订单创建成功: ${result.orderNo}`);
    return { success: true, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "订单创建失败";
    console.error("[Order] 创建失败:", message);
    return { success: false, error: message };
  }
}

/**
 * 取消订单（恢复库存）
 */
export async function cancelOrder(
  orderId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, userId },
        include: { items: true, userCoupon: true },
      });

      if (!order) {
        throw new Error("订单不存在");
      }

      if (order.status !== OrderStatus.PENDING) {
        throw new Error("该订单状态不可取消");
      }

      // 恢复库存（PENDING 订单从未支付，销量未增加，无需回滚销量）
      for (const item of order.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });
        if (product) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }
      }

      // 释放优惠券
      if (order.userCoupon) {
        await tx.userCoupon.update({
          where: { id: order.userCoupon.id },
          data: { status: 'UNUSED', usedAt: null, orderId: null }
        });
      }

      // 更新订单状态
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED },
      });
    });

    console.log(`[Order] 订单取消成功: ${orderId}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "取消失败";
    console.error("[Order] 取消失败:", message);
    return { success: false, error: message };
  }
}

/**
 * 自动取消超时未支付订单
 * 默认 30 分钟未支付则自动取消，释放库存与优惠券
 */
export async function autoCancelExpiredOrders(minutes = 30): Promise<{ success: boolean; canceledCount: number; error?: string }> {
  try {
    const expiredTime = new Date(Date.now() - minutes * 60 * 1000);
    
    // 查找所有待支付或支付中且超时的订单
    const expiredOrders = await prisma.order.findMany({
      where: {
        status: {
          in: [OrderStatus.PENDING, OrderStatus.PAYING],
        },
        createdAt: {
          lt: expiredTime,
        }
      },
      include: { items: true, userCoupon: true }
    });

    if (expiredOrders.length === 0) {
      return { success: true, canceledCount: 0 };
    }

    let canceledCount = 0;

    for (const order of expiredOrders) {
      try {
        await prisma.$transaction(async (tx) => {
          // 重新查询确认订单状态（防止与其他取消流程并发冲突）
          const freshOrder = await tx.order.findUnique({
            where: { id: order.id },
            include: { items: true, userCoupon: true },
          });
          if (!freshOrder || (freshOrder.status !== OrderStatus.PENDING && freshOrder.status !== OrderStatus.PAYING)) {
            return;
          }

          // 恢复库存（PENDING/PAYING 订单未最终支付成功，销量未增加，无需回滚销量）
          for (const item of freshOrder.items) {
            const product = await tx.product.findUnique({
              where: { id: item.productId },
            });
            if (product) {
              await tx.product.update({
                where: { id: item.productId },
                data: { stock: { increment: item.quantity } },
              });
            }
          }

          // 释放优惠券
          if (freshOrder.userCoupon) {
            await tx.userCoupon.update({
              where: { id: freshOrder.userCoupon.id },
              data: { status: 'UNUSED', usedAt: null, orderId: null }
            });
          }

          // 更新订单状态
          await tx.order.update({
            where: { id: freshOrder.id },
            data: { 
              status: OrderStatus.CANCELLED,
              adminNote: freshOrder.adminNote ? `${freshOrder.adminNote}\n[系统] 超时未支付自动取消` : '[系统] 超时未支付自动取消'
            },
          });
        });
        canceledCount++;
      } catch (err) {
        console.error(`[Order] 自动取消订单 ${order.id} 失败:`, err);
      }
    }

    console.log(`[Order] 系统自动取消了 ${canceledCount} 个超时订单`);
    return { success: true, canceledCount };
  } catch (error) {
    console.error("[Order] 自动取消超时订单出错:", error);
    return { success: false, canceledCount: 0, error: String(error) };
  }
}

/**
 * 自动完成（确认收货）超时未确认的已发货订单
 * 默认 15 天后自动收货
 */
export async function autoCompleteShippedOrders(days = 15): Promise<{ success: boolean; completedCount: number; error?: string }> {
  try {
    const expiredTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await prisma.order.updateMany({
      where: {
        status: OrderStatus.SHIPPED,
        shippedAt: {
          lt: expiredTime,
        }
      },
      data: {
        status: OrderStatus.COMPLETED,
        receivedAt: new Date(),
        // Prisma 不允许在 updateMany 中基于已有字段做字符串拼接，所以暂时不更新 adminNote
      }
    });

    console.log(`[Order] 系统自动完成了 ${result.count} 个发货超期订单`);
    return { success: true, completedCount: result.count };
  } catch (error) {
    console.error("[Order] 自动完成已发货订单出错:", error);
    return { success: false, completedCount: 0, error: String(error) };
  }
}


