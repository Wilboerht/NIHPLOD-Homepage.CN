/**
 * API 错误响应格式化工具
 * 统一所有支付相关 API 的错误/成功响应格式
 */
import { NextResponse } from "next/server";

/**
 * 错误代码定义
 */
export enum ErrorCode {
  // 认证错误
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",

  // 参数错误
  INVALID_PARAMS = "INVALID_PARAMS",
  VALIDATION_FAILED = "VALIDATION_FAILED",

  // 资源不存在
  NOT_FOUND = "NOT_FOUND",
  ORDER_NOT_FOUND = "ORDER_NOT_FOUND",
  PRODUCT_NOT_FOUND = "PRODUCT_NOT_FOUND",

  // 状态错误
  INVALID_STATUS = "INVALID_STATUS",
  INVALID_ORDER_STATUS = "INVALID_ORDER_STATUS",
  INVALID_PAYMENT_STATUS = "INVALID_PAYMENT_STATUS",

  // 支付相关
  PAYMENT_FAILED = "PAYMENT_FAILED",
  PAYMENT_PROCESSING = "PAYMENT_PROCESSING",
  REFUND_FAILED = "REFUND_FAILED",
  REFUND_ALREADY_PROCESSING = "REFUND_ALREADY_PROCESSING",
  REFUND_EXCEED_AMOUNT = "REFUND_EXCEED_AMOUNT",
  INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE",
  AMOUNT_MISMATCH = "AMOUNT_MISMATCH",

  // 库存相关
  OUT_OF_STOCK = "OUT_OF_STOCK",
  INSUFFICIENT_STOCK = "INSUFFICIENT_STOCK",

  // 业务逻辑错误
  BUSINESS_ERROR = "BUSINESS_ERROR",
  OPERATION_NOT_ALLOWED = "OPERATION_NOT_ALLOWED",

  // 系统错误
  INTERNAL_ERROR = "INTERNAL_ERROR",
  DATABASE_ERROR = "DATABASE_ERROR",
  EXTERNAL_API_ERROR = "EXTERNAL_API_ERROR",
  RATE_LIMITED = "RATE_LIMITED",
}

/**
 * 错误响应信息映射
 */
const ErrorMessageMap: Record<ErrorCode, string> = {
  [ErrorCode.UNAUTHORIZED]: "请先登录",
  [ErrorCode.FORBIDDEN]: "没有权限操作",
  [ErrorCode.INVALID_PARAMS]: "参数错误",
  [ErrorCode.VALIDATION_FAILED]: "数据验证失败",
  [ErrorCode.NOT_FOUND]: "资源不存在",
  [ErrorCode.ORDER_NOT_FOUND]: "订单不存在",
  [ErrorCode.PRODUCT_NOT_FOUND]: "商品不存在",
  [ErrorCode.INVALID_STATUS]: "状态不合法",
  [ErrorCode.INVALID_ORDER_STATUS]: "订单状态不合法",
  [ErrorCode.INVALID_PAYMENT_STATUS]: "支付状态不合法",
  [ErrorCode.PAYMENT_FAILED]: "支付失败",
  [ErrorCode.PAYMENT_PROCESSING]: "支付处理中",
  [ErrorCode.REFUND_FAILED]: "退款失败",
  [ErrorCode.REFUND_ALREADY_PROCESSING]: "退款已在处理中",
  [ErrorCode.REFUND_EXCEED_AMOUNT]: "退款金额超过支付金额",
  [ErrorCode.INSUFFICIENT_BALANCE]: "余额不足",
  [ErrorCode.AMOUNT_MISMATCH]: "金额不匹配",
  [ErrorCode.OUT_OF_STOCK]: "库存不足",
  [ErrorCode.INSUFFICIENT_STOCK]: "库存不足",
  [ErrorCode.BUSINESS_ERROR]: "操作失败",
  [ErrorCode.OPERATION_NOT_ALLOWED]: "不允许的操作",
  [ErrorCode.INTERNAL_ERROR]: "服务器内部错误",
  [ErrorCode.DATABASE_ERROR]: "数据库操作失败",
  [ErrorCode.EXTERNAL_API_ERROR]: "第三方服务错误",
  [ErrorCode.RATE_LIMITED]: "请求过于频繁，请稍后再试",
};

/**
 * HTTP 状态码映射
 */
const HttpStatusMap: Record<ErrorCode, number> = {
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.INVALID_PARAMS]: 400,
  [ErrorCode.VALIDATION_FAILED]: 400,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.ORDER_NOT_FOUND]: 404,
  [ErrorCode.PRODUCT_NOT_FOUND]: 404,
  [ErrorCode.INVALID_STATUS]: 400,
  [ErrorCode.INVALID_ORDER_STATUS]: 400,
  [ErrorCode.INVALID_PAYMENT_STATUS]: 400,
  [ErrorCode.PAYMENT_FAILED]: 400,
  [ErrorCode.PAYMENT_PROCESSING]: 409,
  [ErrorCode.REFUND_FAILED]: 500,
  [ErrorCode.REFUND_ALREADY_PROCESSING]: 409,
  [ErrorCode.REFUND_EXCEED_AMOUNT]: 400,
  [ErrorCode.INSUFFICIENT_BALANCE]: 400,
  [ErrorCode.AMOUNT_MISMATCH]: 400,
  [ErrorCode.OUT_OF_STOCK]: 400,
  [ErrorCode.INSUFFICIENT_STOCK]: 400,
  [ErrorCode.BUSINESS_ERROR]: 400,
  [ErrorCode.OPERATION_NOT_ALLOWED]: 403,
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.DATABASE_ERROR]: 500,
  [ErrorCode.EXTERNAL_API_ERROR]: 502,
  [ErrorCode.RATE_LIMITED]: 429,
};

/**
 * 统一的错误响应
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * 统一的成功响应
 */
export interface SuccessResponse<T = unknown> {
  success: true;
  data?: T;
  message?: string;
}

/**
 * 返回错误响应
 */
export function errorResponse(
  code: ErrorCode,
  customMessage?: string,
  details?: unknown
): [ErrorResponse, number] {
  const httpStatus = HttpStatusMap[code];
  const message = customMessage || ErrorMessageMap[code];

  return [
    {
      success: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
    httpStatus,
  ];
}

/**
 * 返回成功响应
 */
export function successResponse<T = unknown>(data?: T, message?: string): [SuccessResponse<T>, number] {
  return [
    {
      success: true,
      ...(data ? { data } : {}),
      ...(message ? { message } : {}),
    },
    200,
  ];
}

/**
 * NextResponse 错误包装
 */
export function apiError(
  code: ErrorCode,
  customMessage?: string,
  details?: unknown
): NextResponse<ErrorResponse> {
  const [response, status] = errorResponse(code, customMessage, details);
  return NextResponse.json(response, { status });
}

/**
 * NextResponse 成功包装
 */
export function apiSuccess<T = unknown>(data?: T, message?: string): NextResponse<SuccessResponse<T>> {
  const [response] = successResponse(data, message);
  return NextResponse.json(response, { status: 200 });
}
