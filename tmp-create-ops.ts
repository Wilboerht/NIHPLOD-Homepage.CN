import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env.production" });

async function main() {
  const bcrypt = (await import("bcryptjs")).default;
  const { prisma } = await import("./src/lib/prisma");
  const password = "TestPass123!";
  const hash = await bcrypt.hash(password, 13);
  await prisma.admin.upsert({
    where: { email: "ui-ops@test.local" },
    update: {
      password: hash,
      name: "UI Ops",
      role: "ops",
      status: "ACTIVE",
      deletedAt: null,
      totpEnabled: false,
      totpSecret: null,
      totpResetRequired: false,
    },
    create: {
      email: "ui-ops@test.local",
      password: hash,
      name: "UI Ops",
      role: "ops",
    },
  });
  console.log("ops admin ready");
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
