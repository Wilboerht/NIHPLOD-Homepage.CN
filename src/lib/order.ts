/**
 * 订单服务
 * 订单创建、状态管理、库存扣减
 */
import { prisma } from "./prisma";
import { OrderStatus } from "@/generated/prisma/client";

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

/**
 * 创建订单
 */
export async function createOrder(
  userId: string,
  addressId: string,
  items: OrderItemData[],
  remark?: string
): Promise<{ success: boolean; orderId?: string; orderNo?: string; error?: string }> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. 验证地址
      const address = await tx.address.findFirst({
        where: { id: addressId, userId },
      });
      if (!address) {
        throw new Error("收货地址不存在");
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

        const price = Number(product.price);

        // 检查库存
        if (product.stock < item.quantity) {
          throw new Error(`${product.name} 库存不足`);
        }

        // 扣减库存
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });

        const subtotal = price * item.quantity;
        totalAmount += subtotal;
        orderItems.push({
          productId: item.productId,
          productName: product.name,
          productImage: product.images[0]?.url || null,
          price,
          quantity: item.quantity,
          subtotal,
        });
      }

      // 3. 创建订单
      const orderNo = generateOrderNo();
      const order = await tx.order.create({
        data: {
          orderNo,
          userId,
          status: OrderStatus.PENDING,
          totalAmount,
          payAmount: totalAmount, // 暂时等于总金额，后续可加优惠券逻辑
          // 收货信息快照
          recipientName: address.name,
          recipientPhone: address.phone,
          recipientAddress: `${address.province} ${address.city} ${address.district} ${address.detail}`,
          remark,
          items: {
            create: orderItems,
          },
        },
      });

      // 4. 清除购物车中已购买的商品
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
        include: { items: true },
      });

      if (!order) {
        throw new Error("订单不存在");
      }

      if (order.status !== OrderStatus.PENDING) {
        throw new Error("该订单状态不可取消");
      }

      // 恢复库存
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
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

