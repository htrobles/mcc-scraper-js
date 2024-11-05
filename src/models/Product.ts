import mongoose from 'mongoose';

export enum SupplierEnum {
  ALLPARTS = 'AllParts',
}

export interface Product {
  sku: string;
  title: string;
  descriptionText: string;
  descriptionHtml: string;
  images: string[];
  featuredImage: string;
  supplier: SupplierEnum;
}

const productSchema = new mongoose.Schema({
  sku: { required: true, type: String, unique: true },
  title: { required: true, type: String },
  descriptionText: { required: true, type: String },
  descriptionHtml: { required: true, type: String },
  images: { required: true, type: [String] },
  featuredImage: { required: true, type: String },
  supplier: { required: true, type: String, enum: Object.values(SupplierEnum) },
});

export const MProduct = mongoose.model('Product', productSchema);
