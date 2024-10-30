export interface Product {
  sku: string;
  url: string;
  title: string;
  description: string;
  imageUrls?: string[];
  images?: string[];
  featuredImage?: string;
}
