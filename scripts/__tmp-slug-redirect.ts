import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env.production" });

async function main() {
  const { default: prisma } = await import("../src/lib/prisma");
  const product = await prisma.product.findUnique({
    where: { slug: "serum" },
    select: { id: true },
  });
  if (!product) throw new Error("serum not found");
  await prisma.productSlugRedirect.upsert({
    where: { oldSlug: "test-old-serum" },
    create: { oldSlug: "test-old-serum", productId: product.id },
    update: { productId: product.id },
  });
  console.log("created redirect for", product.id);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
