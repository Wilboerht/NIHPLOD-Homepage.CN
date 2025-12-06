/**
 * 结构化日志工具
 *
 * 提供统一的日志格式，便于调试和监控
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  context?: LogContext;
}

/**
 * 格式化日志条目
 */
function formatLogEntry(entry: LogEntry): string {
  const { timestamp, level, module, message, context } = entry;
  const levelIcon = {
    debug: "🔍",
    info: "ℹ️",
    warn: "⚠️",
    error: "❌",
  }[level];

  let log = `${levelIcon} [${timestamp}] [${module}] ${message}`;

  if (context && Object.keys(context).length > 0) {
    // 对敏感信息进行脱敏
    const sanitizedContext = sanitizeContext(context);
    log += `\n   ${JSON.stringify(sanitizedContext, null, 2).replace(/\n/g, "\n   ")}`;
  }

  return log;
}

/**
 * 脱敏处理敏感信息
 */
function sanitizeContext(context: LogContext): LogContext {
  const sensitiveKeys = ["apiKey", "password", "token", "secret", "authorization"];
  const sanitized: LogContext = {};

  for (const [key, value] of Object.entries(context)) {
    if (sensitiveKeys.some((k) => key.toLowerCase().includes(k))) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "string" && value.length > 500) {
      // 截断过长的字符串
      sanitized[key] = value.substring(0, 500) + "...[truncated]";
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * 创建模块化日志器
 */
function createLogger(module: string) {
  const log = (level: LogLevel, message: string, context?: LogContext) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      context,
    };

    const formattedLog = formatLogEntry(entry);

    switch (level) {
      case "debug":
        if (process.env.NODE_ENV === "development") {
          console.debug(formattedLog);
        }
        break;
      case "info":
        console.info(formattedLog);
        break;
      case "warn":
        console.warn(formattedLog);
        break;
      case "error":
        console.error(formattedLog);
        break;
    }

    // 在生产环境可以将日志发送到外部服务（如 Sentry、LogRocket 等）
    // if (process.env.NODE_ENV === "production" && level === "error") {
    //   sendToErrorTracking(entry);
    // }
  };

  return {
    debug: (message: string, context?: LogContext) => log("debug", message, context),
    info: (message: string, context?: LogContext) => log("info", message, context),
    warn: (message: string, context?: LogContext) => log("warn", message, context),
    error: (message: string, context?: LogContext) => log("error", message, context),
  };
}

/**
 * AI 模块日志器
 */
export const aiLogger = createLogger("AI");

/**
 * API 模块日志器
 */
export const apiLogger = createLogger("API");

/**
 * 数据库模块日志器
 */
export const dbLogger = createLogger("DB");

/**
 * 通用日志器
 */
export const logger = createLogger("App");

/**
 * 请求日志中间件辅助函数
 */
export function logRequest(
  method: string,
  path: string,
  context?: LogContext
) {
  apiLogger.info(`${method} ${path}`, context);
}

/**
 * 错误日志辅助函数（包含堆栈信息）
 */
export function logError(
  module: string,
  error: unknown,
  context?: LogContext
) {
  const errorLogger = createLogger(module);
  const errorInfo: LogContext = {
    ...context,
  };

  if (error instanceof Error) {
    errorInfo.errorName = error.name;
    errorInfo.errorMessage = error.message;
    errorInfo.stack = error.stack?.split("\n").slice(0, 5).join("\n");
  } else {
    errorInfo.error = String(error);
  }

  errorLogger.error("An error occurred", errorInfo);
}

