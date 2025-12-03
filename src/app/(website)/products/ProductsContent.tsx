"use client";

import { useState, useMemo } from "react";
import { m } from "framer-motion";
import { FloatingCardLayout, ProductCard, ProductDrawer } from "@/components/website";
import type { ProductData } from "@/components/website/ProductDrawer";
import { staggerContainer, fadeInUp, defaultTransition } from "@/lib/animations";

interface Category {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
}

interface Product {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  description: string;
  price: number;
  capacity: string | null;
  purchaseUrl: string | null;
  categoryId: string;
  category: Category;
  images: { url: string; alt: string | null }[];
  ingredients: string | null;
  usage: string | null;
  benefits: string[];
}

interface ProductsContentProps {
  categories: Category[];
  products: Product[];
}

/**
 * 产品列表内容组件
 * Client Component - 处理分类筛选和抽屉交互
 */
export function ProductsContent({ categories, products }: ProductsContentProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductData | null>(null);

  // 筛选产品
  const filteredProducts = useMemo(() => {
    if (!activeCategory) return products;
    return products.filter((p) => p.categoryId === activeCategory);
  }, [products, activeCategory]);

  // 打开产品抽屉
  const handleProductClick = (product: Product) => {
    const productData: ProductData = {
      id: product.id,
      name: product.name,
      nameEn: product.nameEn,
      slug: product.slug,
      description: product.description,
      price: product.price,
      capacity: product.capacity || undefined,
      purchaseUrl: product.purchaseUrl || undefined,
      images: product.images.map((img) => ({
        url: img.url,
        alt: img.alt || undefined,
      })),
      category: { name: product.category.name },
      ingredients: product.ingredients || undefined,
      usage: product.usage || undefined,
      benefits: product.benefits,
    };
    setSelectedProduct(productData);
    setDrawerOpen(true);
  };

  // 关闭抽屉
  const handleCloseDrawer = () => {
    setDrawerOpen(false);
  };

  return (
    <>
      <FloatingCardLayout
        backgroundImage="/images/products-hero.jpg"
        backgroundAlt="NIHPLOD 产品系列"
        initialState="minimized"
      >
        {/* 页面标题 */}
        <m.div
          className="mb-6 text-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="font-serif text-2xl text-brand-charcoal md:text-3xl">
            产品系列
          </h1>
          <p className="mt-1 text-xs uppercase tracking-widest text-brand-gold">
            PRODUCT COLLECTION
          </p>
        </m.div>

        {/* 分类筛选 Tab */}
        <m.div
          className="mb-6 flex flex-wrap justify-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
              activeCategory === null
                ? "bg-brand-gold text-white"
                : "bg-brand-beige/50 text-brand-charcoal hover:bg-brand-beige"
            }`}
          >
            全部
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                activeCategory === cat.id
                  ? "bg-brand-gold text-white"
                  : "bg-brand-beige/50 text-brand-charcoal hover:bg-brand-beige"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </m.div>

        {/* 产品网格 */}
        {filteredProducts.length > 0 ? (
          <m.div
            className="grid grid-cols-2 gap-4 pb-20 md:grid-cols-3 lg:grid-cols-4"
            variants={staggerContainer}
            initial="initial"
            animate="animate"
          >
            {filteredProducts.map((product, index) => (
              <m.div
                key={product.id}
                variants={fadeInUp}
                transition={{ ...defaultTransition, delay: index * 0.05 }}
              >
                <ProductCard
                  product={{
                    id: product.id,
                    name: product.name,
                    nameEn: product.nameEn,
                    slug: product.slug,
                    price: product.price,
                    capacity: product.capacity || undefined,
                    images: product.images.map((img) => ({
                      url: img.url,
                      alt: img.alt || undefined,
                    })),
                    category: { name: product.category.name },
                  }}
                  onClick={() => handleProductClick(product)}
                  priority={index < 4}
                />
              </m.div>
            ))}
          </m.div>
        ) : (
          <m.div
            className="py-16 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <p className="text-brand-charcoal/50">暂无产品</p>
          </m.div>
        )}
      </FloatingCardLayout>

      {/* 产品详情抽屉 */}
      <ProductDrawer
        isOpen={drawerOpen}
        onClose={handleCloseDrawer}
        product={selectedProduct}
      />
    </>
  );
}

