/**
 * 管理员种子数据共享工具
 * 供 prisma/seed.ts 与 prisma/seed-admin.ts 复用
 */

export interface SeedAdminInput {
  email: string;
  password: string;
  name: string;
  role?: "owner" | "admin";
}

/**
 * 从环境变量解析待种子管理员列表
 */
export function parseSeedAdmins(): SeedAdminInput[] {
  // 优先从 SEED_ADMINS 环境变量读取 JSON 数组
  if (process.env.SEED_ADMINS) {
    try {
      const parsed = JSON.parse(process.env.SEED_ADMINS);
      if (!Array.isArray(parsed)) {
        throw new Error("SEED_ADMINS 必须是 JSON 数组");
      }
      return parsed.map((item: Record<string, unknown>, index: number) => {
        if (!item.email || !item.password || !item.name) {
          throw new Error(`SEED_ADMINS[${index}] 缺少 email/password/name 字段`);
        }
        return {
          email: String(item.email),
          password: String(item.password),
          name: String(item.name),
          role: item.role === "owner" ? "owner" : "admin",
        };
      });
    } catch (error) {
      throw new Error(
        `解析 SEED_ADMINS 失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // 兼容旧版环境变量：单个管理员
  const email = process.env.SEED_ADMIN_EMAIL || process.env.ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME || "System Admin";

  if (!email || !password) {
    throw new Error(
      "未配置管理员种子数据。请设置 SEED_ADMINS 环境变量（JSON 数组），或设置 SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD。"
    );
  }

  return [{ email, password, name, role: "owner" }];
}

/**
 * 校验管理员密码强度
 */
export function validatePassword(password: string): void {
  if (password.length < 12) {
    throw new Error("管理员密码长度至少 12 位");
  }
  if (!/[A-Z]/.test(password)) {
    throw new Error("管理员密码必须包含大写字母");
  }
  if (!/[a-z]/.test(password)) {
    throw new Error("管理员密码必须包含小写字母");
  }
  if (!/[0-9]/.test(password)) {
    throw new Error("管理员密码必须包含数字");
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    throw new Error("管理员密码必须包含至少一个特殊字符");
  }
  const lower = password.toLowerCase();
  const commonWeak = [
    "password", "admin123", "qwerty", "123456", "administrator",
    "letmein", "welcome", "changeme", "nihplod", "superuser",
  ];
  if (commonWeak.some((w) => lower.includes(w))) {
    throw new Error("管理员密码不能包含常见弱密码模式");
  }
}
