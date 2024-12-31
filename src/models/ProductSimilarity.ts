import mongoose, { Document, Model } from 'mongoose';
import { SupplierEnum } from './Product';

export interface ProductSimilarity {
  sku: string;
  lsTitle: string;
  storeTitle: string;
  supplier: SupplierEnum;
}

export interface ProductSimilarityDocument
  extends Omit<Document, 'errors'>,
    ProductSimilarity {}

const productSimilaritySchema = new mongoose.Schema({
  sku: { type: String },
  lsTitle: { type: String },
  storeTitle: { type: String },
  similarity: { type: Number },
  supplier: { required: true, type: String, enum: Object.values(SupplierEnum) },
  errors: { type: [String] },
});

export const MProductSimilarity = mongoose.model(
  'ProductSimilarity',
  productSimilaritySchema
);
