import mongoose from 'mongoose';

export enum StoreEnum {
  TOMLEEMUSIC = 'TomLeeMusic',
  ACCLAIMMUSIC = 'AcclaimMusic',
}

export interface ProductPricing {
  systemId?: string;
  sku: string;
  title: string;
  store: StoreEnum;
  theirPrice: number;
  ourPrice?: number;
}

const productPricingScheme = new mongoose.Schema({
  systemId: { type: String },
  sku: { required: true, type: String, unique: true },
  title: { required: true, type: String },
  theirPrice: { required: true, type: Number },
  ourPrice: { type: Number },
  store: { required: true, type: String, enum: Object.values(StoreEnum) },
});

export const MProductPricing = mongoose.model(
  'ProductPricing',
  productPricingScheme
);
