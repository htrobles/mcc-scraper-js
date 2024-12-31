import mongoose from 'mongoose';

export enum SupplierEnum {
  ALLPARTS = 'AllParts',
  COASTMUSIC = 'CoastMusic',
  KORGCANADA = 'KorgCanada',
  FENDER = 'Fender',
  DADDARIO = 'Daddario',
  LM = 'LM',
}

export interface Product {
  systemId?: string;
  sku: string;
  title: string;
  descriptionText: string;
  descriptionHtml: string;
  images: string[];
  featuredImage: string;
  supplier: SupplierEnum;
  missingDescription: boolean;
}

const productSchema = new mongoose.Schema({
  systemId: { type: String, unique: true },
  sku: { required: true, type: String, unique: true },
  title: { required: true, type: String },
  descriptionText: { required: true, type: String },
  descriptionHtml: { required: true, type: String },
  images: { required: true, type: [String] },
  featuredImage: { required: true, type: String },
  supplier: { required: true, type: String, enum: Object.values(SupplierEnum) },
  missingDescription: { default: false, type: Boolean },
});

export const MProduct = mongoose.model('Product', productSchema);
