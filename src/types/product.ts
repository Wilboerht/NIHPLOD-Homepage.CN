/**
 * 作品相关类型定义
 */

export interface Product {
  id: string;
  title: string;
  slug: string;
  description?: string;
  images: ProductImage[];
  categoryId: string;
  category?: Category;
  featured: boolean;
  published: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductImage {
  id: string;
  url: string;
  alt?: string;
  order: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  order: number;
  productCount?: number;
}

export interface ProductFilters {
  categoryId?: string;
  featured?: boolean;
  published?: boolean;
  search?: string;
}

export interface ProductListResponse {
  products: Product[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
