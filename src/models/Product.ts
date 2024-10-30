import mongoose from 'mongoose';

export interface Product {
  sku: string;
  url: string;
  title: string;
  description: string;
  imageUrls: string[];
  images: string[];
  featuredImage: string;
}

const productSchema = new mongoose.Schema({
  sku: { required: true, type: String, unique: true },
  url: { required: true, type: String },
  title: { required: true, type: String },
  description: { required: true, type: String },
  imageUrls: { required: true, type: [String] },
  images: { required: true, type: [String] },
  featuredImage: { required: true, type: String },
});

export const MProduct = mongoose.model('Product', productSchema);
