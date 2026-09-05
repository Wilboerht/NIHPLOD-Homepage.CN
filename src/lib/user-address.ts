/**
 * 收货地址簿共享模块（用户端）
 * 地址仅用于积分兑礼礼品寄送；多地址 + 默认地址。
 */
import { z } from "zod";

/** 每位用户最多保存的收货地址数 */
export const MAX_ADDRESSES = 20;

/** 地址字段校验（创建/编辑共用） */
export const addressFieldsSchema = z.object({
  recipient: z.string().trim().min(1, "请填写收货人姓名").max(20, "收货人姓名过长"),
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号"),
  region: z.string().trim().min(1, "请填写省市区").max(50, "省市区过长"),
  detail: z.string().trim().min(1, "请填写详细地址").max(120, "详细地址过长"),
  isDefault: z.boolean().optional(),
});

export interface UserAddressView {
  id: string;
  recipient: string;
  phone: string;
  region: string;
  detail: string;
  isDefault: boolean;
}
