import { cache } from "react";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import { PRODUCTS_TAG } from "@/lib/cache-tags";
import { mockCategories, mockProducts } from "./mock-data";

const isDev = process.env.NODE_ENV === "development";

/**
 * 获取前台可见分类及分类下首个产品（列表页与共享布局共用）
 * 分类在前台即代表一个产品入口，导航时直接打开该产品详情。
 */
const getVisibleCategoriesUncached = async () => {
  if (isDev) {
    return mockCategories.map(({ id, name, slug }) => ({
      id,
      name,
      slug,
      productSlug: mockProducts.find((product) => product.categoryId === id)?.slug ?? null,
    }));
  }

  try {
    const categories = await prisma.category.findMany({
      where: { visible: true },
      orderBy: { order: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        products: {
          where: { published: true },
          orderBy: [{ order: "asc" }, { createdAt: "desc" }],
          take: 1,
          select: { slug: true },
        },
      },
    });

    return categories.map(({ products, ...category }) => ({
      ...category,
      productSlug: products[0]?.slug ?? null,
    }));
  } catch (error) {
    apiConsole.error("获取产品分类失败:", error);
    return [];
  }
};

const getVisibleCategoriesCached = unstable_cache(
  getVisibleCategoriesUncached,
  ["visible-categories"],
  {
    tags: [PRODUCTS_TAG],
    revalidate: 60,
  }
);

export const getVisibleCategories = cache(
  isDev ? getVisibleCategoriesUncached : getVisibleCategoriesCached
);
