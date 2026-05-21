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
  const sensitiveKeys = [
    "apiKey", "password", "token", "secret", "authorization",
    "creditCard", "cardNumber", "cvv", "phone", "idCard",
    "cookie", "session", "privateKey", "keyPem", "refreshToken",
    "jwt", "passphrase", "apiSecret"
  ];
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

    // 生产环境下使用 JSON 格式，以便被云端日志服务（如 Vercel, AWS CloudWatch, ELK）自动解析
    if (process.env.NODE_ENV === "production") {
      const jsonLog = JSON.stringify({
        ...entry,
        // 确保 context 中的 Error 对象被正确序列化
        context: entry.context ? serializeContext(entry.context) : undefined
      });

      // 统一使用 console.log 输出 stdout，错误级别输出 stderr
      if (level === "error") {
        console.error(jsonLog);
      } else {
        console.log(jsonLog);
      }
    } else {
      // 开发环境下保持可读性
      const formattedLog = formatLogEntry(entry);

      switch (level) {
        case "debug":
          console.debug(formattedLog);
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
    }

    // 可扩展：调用外部监控 webhook
    if (level === "error" && process.env.ENABLE_CLOUD_LOGGING === "true") {
      reportToExternalService(entry).catch(err => console.error("Failed to report log:", err));
    }
  };

  return {
    debug: (message: string, context?: LogContext) => log("debug", message, context),
    info: (message: string, context?: LogContext) => log("info", message, context),
    warn: (message: string, context?: LogContext) => log("warn", message, context),
    error: (message: string, context?: LogContext) => log("error", message, context),
  };
}

/**
 * 序列化 Context，处理无法直接 stringify 的Error对象
 */
function serializeContext(context: LogContext): LogContext {
  const sanitized = sanitizeContext(context);
  const result: LogContext = {};

  for (const [key, value] of Object.entries(sanitized)) {
    if (value instanceof Error) {
      result[key] = {
        name: value.name,
        message: value.message,
        stack: value.stack,
        cause: (value as { cause?: unknown }).cause
      };
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * 模拟上报到外部服务 (如 Sentry, LogRocket, 自建监控)
 */
async function reportToExternalService(entry: LogEntry) {
  // 示例：发送到自建的日志搜集 API
  // await fetch("https://monitor.example.com/api/logs", { method: "POST", body: JSON.stringify(entry) });

  // 暂时仅在控制台打印占位
  if (process.env.NODE_ENV === "development") {
    console.debug("[Mock Cloud Report]", entry.module, entry.level);
  }
}

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

/**
 * 兼容 console 风格的多参数日志接口
 * 用于平滑迁移现有 console.error/console.warn 调用，无需改动调用方传参习惯
 */
export const apiConsole = {
  error: (...args: unknown[]) => {
    const msgParts: string[] = [];
    const context: LogContext = {};

    for (const arg of args) {
      if (arg instanceof Error) {
        context.errorName = arg.name;
        context.errorMessage = arg.message;
        context.stack = arg.stack?.split("\n").slice(0, 5).join("\n");
      } else if (typeof arg === "object" && arg !== null && !Array.isArray(arg)) {
        // 合并纯对象到 context
        Object.assign(context, arg);
      } else {
        msgParts.push(String(arg));
      }
    }

    apiLogger.error(msgParts.join(" "), Object.keys(context).length > 0 ? context : undefined);
  },
  warn: (...args: unknown[]) => {
    const msg = args.map((a) => (a instanceof Error ? a.message : String(a))).join(" ");
    apiLogger.warn(msg);
  },
  info: (...args: unknown[]) => {
    const msg = args.map((a) => (a instanceof Error ? a.message : String(a))).join(" ");
    apiLogger.info(msg);
  },
};

