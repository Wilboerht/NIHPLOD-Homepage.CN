import prisma from "./src/lib/prisma";

async function main() {
  // 查询指定产品的图片
  const images = await prisma.image.findMany({
    where: { productId: "cmj3r3dfg000mjksd3sarwt66" },
  });
  console.log("Images for product cmj3r3dfg000mjksd3sarwt66:");
  console.log(JSON.stringify(images, null, 2));

  // 查询所有产品的第一张图片
  const allProducts = await prisma.product.findMany({
    where: { published: true },
    include: {
      images: { take: 1 },
    },
  });
  console.log("\n\nAll published products with first image:");
  for (const p of allProducts) {
    console.log(`- ${p.name}: ${p.images[0]?.url || "NO IMAGE"}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

