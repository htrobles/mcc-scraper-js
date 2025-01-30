import mongoose from 'mongoose';

export interface RawProduct {
  systemId: string;
  sku: string;
  customSku?: string;
  title?: string;
  upc?: string;
}

const rawProductSchema = new mongoose.Schema({
  systemId: { type: String, unique: true, required: true },
  sku: { type: String },
  customSku: { type: String },
  upc: { type: String },
  title: { type: String },
});

export const MRawProduct = mongoose.model('RawProduct', rawProductSchema);
