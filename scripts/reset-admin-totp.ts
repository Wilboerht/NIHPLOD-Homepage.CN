/**
 * 应急重置管理员 TOTP（唯一 owner 丢失验证器且无备用码时使用）。
 *
 * 用法：
 *   npm run admin:reset-totp -- admin@example.com
 *
 * 该脚本需要直接访问生产数据库；执行后目标管理员下次登录会被要求重新绑定 TOTP。
 * 请在安全环境执行，并在审计/工单中记录操作原因。
 */
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

async function main() {
  const email = process.argv[2]?.trim();
  if (!email) {
    console.error("用法: npm run admin:reset-totp -- <admin-email>");
    process.exitCode = 1;
    return;
  }

  const { prisma } = await import("../src/lib/prisma");
  try {
    const admin = await prisma.admin.findFirst({
      where: { email, deletedAt: null },
      select: { id: true, email: true, name: true, role: true, status: true },
    });
    if (!admin) {
      console.error(`未找到管理员: ${email}`);
      process.exitCode = 1;
      return;
    }

    await prisma.admin.update({
      where: { id: admin.id },
      data: {
        totpEnabled: false,
        totpEnabledAt: null,
        totpSecret: null,
        totpBackupCodes: null,
        totpResetRequired: true,
        // 立即失效现有会话，避免旧 token 在重置窗口继续使用。
        tokenVersion: { increment: 1 },
      },
    });
    await prisma.auditLog.create({
      data: {
        action: "admin_totp_reset_cli",
        targetType: "admin",
        targetId: admin.id,
        targetLabel: admin.email,
        detail: { reason: "offline_emergency_reset" },
        actorType: "SYSTEM",
        outcome: "SUCCESS",
      },
    });

    console.log(
      `已重置 ${admin.name} <${admin.email}> 的 TOTP；下次登录需重新绑定。`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[ResetAdminTotp] 执行失败:", error);
  process.exitCode = 1;
});
