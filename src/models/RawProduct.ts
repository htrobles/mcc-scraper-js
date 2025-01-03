import mongoose from 'mongoose';

export interface RawProduct {
  systemId: string;
  sku?: string;
  customSku?: string;
  title?: string;
}

const rawProductSchema = new mongoose.Schema({
  systemId: { type: String, unique: true },
  sku: { type: String },
  customSku: { type: String },
  title: { type: String },
});

export const MRawProduct = mongoose.model('RawProduct', rawProductSchema);
