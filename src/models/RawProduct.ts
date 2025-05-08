import mongoose from 'mongoose';

export interface RawProduct {
  systemId: string;
  sku: string;
  customSku?: string;
  title?: string;
  upc?: string;
  price?: number;
}

const rawProductSchema = new mongoose.Schema({
  systemId: { type: String, unique: true, required: true },
  sku: { type: String },
  customSku: { type: String },
  upc: { type: String },
  title: { type: String },
  price: { type: Number },
});

export const MRawProduct = mongoose.model('RawProduct', rawProductSchema);
