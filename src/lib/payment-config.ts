/**
 * 支付方式配置
 * 控制支付方式的启用/禁用和优先级排序
 */

export interface PaymentMethodConfig {
  id: "wechat" | "alipay" | "unionpay";
  name: string;
  enabled: boolean;
  priority: number; // 排序优先级，数字越小越靠前
  remark?: string;
}

/**
 * 解析环境变量中的支付方式配置
 * 格式: "wechat:true:1,alipay:true:2,unionpay:false:3"
 * 表示: 支付方式ID:是否启用:优先级
 */
function parsePaymentMethodsEnv(): PaymentMethodConfig[] {
  const envStr = process.env.PAYMENT_METHODS_CONFIG || "";

  if (!envStr) {
    // 返回默认配置
    return [
      { id: "wechat", name: "微信支付", enabled: true, priority: 1 },
      { id: "alipay", name: "支付宝", enabled: true, priority: 2 },
      { id: "unionpay", name: "银联支付", enabled: false, priority: 3 },
    ];
  }

  const methods: PaymentMethodConfig[] = [];
  const entries = envStr.split(",");

  for (const entry of entries) {
    const [id, enabledStr, priorityStr] = entry.split(":");

    if (!id || !enabledStr || !priorityStr) {
      console.warn(`[Payment Config] 无效的支付方式配置: ${entry}`);
      continue;
    }

    const method: PaymentMethodConfig = {
      id: id as "wechat" | "alipay" | "unionpay",
      name: {
        wechat: "微信支付",
        alipay: "支付宝",
        unionpay: "银联支付",
      }[id] || id,
      enabled: enabledStr.toLowerCase() === "true",
      priority: parseInt(priorityStr, 10),
    };

    if (Number.isNaN(method.priority)) {
      console.warn(`[Payment Config] 无效的优先级: ${priorityStr}`);
      continue;
    }

    methods.push(method);
  }

  return methods.length > 0
    ? methods
    : [
        { id: "wechat", name: "微信支付", enabled: true, priority: 1 },
        { id: "alipay", name: "支付宝", enabled: true, priority: 2 },
        { id: "unionpay", name: "银联支付", enabled: false, priority: 3 },
      ];
}

let _paymentMethods: PaymentMethodConfig[] | null = null;

/**
 * 获取支付方式配置列表（已按优先级排序）
 */
export function getPaymentMethods(): PaymentMethodConfig[] {
  if (!_paymentMethods) {
    _paymentMethods = parsePaymentMethodsEnv().sort((a, b) => a.priority - b.priority);
  }
  return _paymentMethods;
}

/**
 * 获取已启用的支付方式
 */
export function getEnabledPaymentMethods(): PaymentMethodConfig[] {
  return getPaymentMethods().filter((m) => m.enabled);
}

/**
 * 检查指定支付方式是否启用
 */
export function isPaymentMethodEnabled(methodId: "wechat" | "alipay" | "unionpay"): boolean {
  const method = getPaymentMethods().find((m) => m.id === methodId);
  return method?.enabled ?? false;
}

/**
 * 获取支付方式的优先级
 */
export function getPaymentMethodPriority(methodId: "wechat" | "alipay" | "unionpay"): number {
  const method = getPaymentMethods().find((m) => m.id === methodId);
  return method?.priority ?? 999;
}

/**
 * 重置缓存（用于测试或动态更新）
 */
export function resetPaymentMethodsCache(): void {
  _paymentMethods = null;
}
