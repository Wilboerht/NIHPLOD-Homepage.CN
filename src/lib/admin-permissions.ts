/**
 * 管理端权限点目录与角色模板（纯常量，客户端/服务端共用）
 *
 * 设计：
 * - 权限点格式 resource:action，服务端以 hasAdminPermission 判定，前端以同样规则渲染。
 * - 命名角色 = 模板权限集合；Admin.permissions 为个人覆盖：
 *   普通条目 = 追加授权，`!权限点` = 从模板中撤销。
 * - owner 恒为全部权限（忽略覆盖），保证不会因覆盖而失去管理能力。
 */

export const ADMIN_PERMISSIONS = [
  "dashboard:read",

  "users:read",
  "users:sensitive:read",
  "users:write",
  "users:delete",
  "users:security:write",

  "products:read",
  "products:write",
  "products:delete",
  "products:batch-delete",

  "categories:read",
  "categories:write",
  "categories:delete",

  "jobs:read",
  "jobs:write",
  "jobs:delete",
  "jobs:batch-delete",

  "applications:read",
  "applications:write",
  "applications:delete",

  "messages:read",
  "messages:write",
  "messages:delete",

  "spent:read",
  "spent:review",
  "spent:import",

  "gifts:read",
  "gifts:write",
  "redemptions:read",
  "redemptions:fulfill",
  "redemptions:cancel",

  "membership:read",
  "membership:write",

  "audit:read",

  "admins:read",
  "admins:write",

  "cron:read",
  "cron:run",

  "webhooks:read",
  "webhooks:write",

  "amap:read",

  "sso:read",
  "sso:write",
  "sso:clients:read",
  "sso:clients:write",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const ADMIN_ROLES = ["owner", "admin", "ops", "support", "hr", "finance"] as const;
export type AdminRoleValue = (typeof ADMIN_ROLES)[number];

export const ROLE_LABELS: Record<AdminRoleValue, string> = {
  owner: "超级管理员",
  admin: "通用管理员（历史）",
  ops: "运营",
  support: "客服",
  hr: "招聘",
  finance: "财务/审计",
};

/** 权限分组（管理端权限编辑器展示用） */
export const PERMISSION_GROUPS: { group: string; permissions: AdminPermission[] }[] = [
  { group: "仪表盘", permissions: ["dashboard:read"] },
  {
    group: "用户",
    permissions: [
      "users:read",
      "users:sensitive:read",
      "users:write",
      "users:delete",
      "users:security:write",
    ],
  },
  {
    group: "产品",
    permissions: ["products:read", "products:write", "products:delete", "products:batch-delete"],
  },
  {
    group: "分类",
    permissions: ["categories:read", "categories:write", "categories:delete"],
  },
  {
    group: "招聘",
    permissions: ["jobs:read", "jobs:write", "jobs:delete", "jobs:batch-delete", "applications:read", "applications:write", "applications:delete"],
  },
  {
    group: "留言",
    permissions: ["messages:read", "messages:write", "messages:delete"],
  },
  {
    group: "消费与积分",
    permissions: [
      "spent:read",
      "spent:review",
      "spent:import",
      "gifts:read",
      "gifts:write",
      "redemptions:read",
      "redemptions:fulfill",
      "redemptions:cancel",
      "membership:read",
      "membership:write",
    ],
  },
  {
    group: "系统",
    permissions: [
      "audit:read",
      "admins:read",
      "admins:write",
      "cron:read",
      "cron:run",
      "webhooks:read",
      "webhooks:write",
      "amap:read",
    ],
  },
  {
    group: "SSO",
    permissions: ["sso:read", "sso:write", "sso:clients:read", "sso:clients:write"],
  },
];

export const PERMISSION_LABELS: Record<AdminPermission, string> = {
  "dashboard:read": "仪表盘查看",
  "users:read": "用户查看",
  "users:sensitive:read": "查看完整手机号（敏感，写审计）",
  "users:write": "用户状态/生日/解绑",
  "users:delete": "用户删除（GDPR 匿名化）",
  "users:security:write": "重置密码/积分调整（资金类）",
  "products:read": "产品查看",
  "products:write": "产品编辑/上下架",
  "products:delete": "产品删除",
  "products:batch-delete": "产品批量删除",
  "categories:read": "分类查看",
  "categories:write": "分类编辑/排序",
  "categories:delete": "分类删除",
  "jobs:read": "职位查看",
  "jobs:write": "职位编辑/发布",
  "jobs:delete": "职位删除",
  "jobs:batch-delete": "职位批量删除",
  "applications:read": "简历查看（含候选人 PII）",
  "applications:write": "简历状态/备注/文件夹",
  "applications:delete": "简历删除",
  "messages:read": "留言查看",
  "messages:write": "留言回复/标记",
  "messages:delete": "留言删除",
  "spent:read": "消费补录查看（含凭证）",
  "spent:review": "消费补录审核/撤销（资金类）",
  "spent:import": "消费记录 Excel 导入/撤销（资金类）",
  "gifts:read": "积分礼品查看",
  "gifts:write": "积分可兑设置",
  "redemptions:read": "兑换记录查看",
  "redemptions:fulfill": "兑换履约/运单维护",
  "redemptions:cancel": "取消兑换并退分（资金类）",
  "membership:read": "会员权益查看",
  "membership:write": "会员权益编辑",
  "audit:read": "审计日志查看/导出",
  "admins:read": "管理员查看",
  "admins:write": "管理员新增/编辑/删除/权限分配",
  "cron:read": "定时任务查看",
  "cron:run": "定时任务手动执行",
  "webhooks:read": "通知失败队列查看",
  "webhooks:write": "通知失败队列重投/丢弃",
  "amap:read": "高德地图密钥读取",
  "sso:read": "SSO 授权/会话/审计查看",
  "sso:write": "SSO 授权撤销/会话终止",
  "sso:clients:read": "SSO 客户端查看",
  "sso:clients:write": "SSO 客户端管理/密钥轮换/测试",
};

/**
 * 角色模板权限集合（owner 由全量权限隐式获得，无需在此列出）
 * 说明：admin 为历史通用角色，模板与旧行为保持一致。
 */
export const ROLE_TEMPLATES: Record<Exclude<AdminRoleValue, "owner">, readonly AdminPermission[]> =
  {
    admin: [
      "dashboard:read",
      "users:read",
      "users:sensitive:read",
      "products:read",
      "products:write",
      "products:delete",
      "categories:read",
      "categories:write",
      "categories:delete",
      "jobs:read",
      "jobs:write",
      "jobs:delete",
      "applications:read",
      "applications:write",
      "applications:delete",
      "messages:read",
      "messages:write",
      "messages:delete",
      "spent:read",
      "spent:review",
      "gifts:read",
      "redemptions:read",
      "redemptions:fulfill",
      "audit:read",
    ],
    ops: [
      "dashboard:read",
      "users:read",
      "products:read",
      "products:write",
      "products:delete",
      "categories:read",
      "categories:write",
      "categories:delete",
      "spent:read",
      "spent:review",
      "gifts:read",
      "gifts:write",
      "redemptions:read",
      "redemptions:fulfill",
      "messages:read",
      "messages:write",
      "messages:delete",
      "membership:read",
    ],
    support: [
      "dashboard:read",
      "users:read",
      "users:sensitive:read",
      "messages:read",
      "messages:write",
      "spent:read",
      "gifts:read",
      "redemptions:read",
      "redemptions:fulfill",
    ],
    hr: [
      "dashboard:read",
      "jobs:read",
      "jobs:write",
      "jobs:delete",
      "applications:read",
      "applications:write",
      "applications:delete",
    ],
    finance: [
      "dashboard:read",
      "users:read",
      "spent:read",
      "gifts:read",
      "redemptions:read",
      "membership:read",
      "audit:read",
    ],
  };

const PERMISSION_SET = new Set<string>(ADMIN_PERMISSIONS);

export function isKnownAdminPermission(value: string): value is AdminPermission {
  return PERMISSION_SET.has(value);
}

/** 过滤并规范化个人权限覆盖（去重、忽略未知权限点） */
export function sanitizePermissionOverrides(overrides?: string[] | null): string[] {
  if (!overrides || overrides.length === 0) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of overrides) {
    const entry = raw.trim();
    const stripped = entry.startsWith("!") ? entry.slice(1) : entry;
    if (!PERMISSION_SET.has(stripped)) continue;
    const normalized = entry.startsWith("!") ? `!${stripped}` : stripped;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

/** 取角色模板（未知角色回退 admin 模板） */
function templateFor(role: string): readonly AdminPermission[] {
  if (role === "owner") return ADMIN_PERMISSIONS;
  return ROLE_TEMPLATES[role as Exclude<AdminRoleValue, "owner">] ?? ROLE_TEMPLATES.admin;
}

/** 解析管理员的有效权限（owner 恒为全部） */
export function resolveAdminPermissions(
  role: string,
  overrides?: string[] | null
): AdminPermission[] {
  if (role === "owner") return [...ADMIN_PERMISSIONS];

  const granted = new Set<string>(templateFor(role));
  for (const entry of overrides ?? []) {
    if (entry.startsWith("!")) granted.delete(entry.slice(1));
    else granted.add(entry);
  }
  return ADMIN_PERMISSIONS.filter((p) => granted.has(p));
}

/**
 * 判断管理员是否拥有某权限
 *
 * 注意：`permissions` 与 `permissionOverrides` 均按**覆盖条目**解析
 * （普通条目=追加授权，`!权限点`=撤销模板授权）。API 层的 AdminJWTPayload
 * 使用 permissionOverrides（原始覆盖），不要把解析后的有效权限数组传入本函数。
 */
export function hasAdminPermission(
  admin: {
    role: string;
    permissions?: string[] | null;
    permissionOverrides?: string[] | null;
  },
  permission: AdminPermission
): boolean {
  if (admin.role === "owner") return true;
  let allowed = (templateFor(admin.role) as readonly string[]).includes(permission);
  const overrides = admin.permissionOverrides ?? admin.permissions ?? [];
  for (const entry of overrides) {
    if (entry === `!${permission}`) allowed = false;
    else if (entry === permission) allowed = true;
  }
  return allowed;
}

/** 计算个人覆盖差异：根据勾选状态生成 overrides（相对角色模板） */
export function buildPermissionOverrides(
  role: AdminRoleValue,
  selected: string[]
): string[] {
  if (role === "owner") return [];
  const template = new Set<string>(templateFor(role));
  const selectedSet = new Set(selected.filter((p) => PERMISSION_SET.has(p)));
  const overrides: string[] = [];
  // 模板中未勾选 → 撤销
  for (const perm of template) {
    if (!selectedSet.has(perm)) overrides.push(`!${perm}`);
  }
  // 勾选了模板之外的 → 追加
  for (const perm of selectedSet) {
    if (!template.has(perm)) overrides.push(perm);
  }
  return overrides;
}
