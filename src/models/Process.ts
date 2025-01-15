import mongoose, { Document, Model } from 'mongoose';
import { SupplierEnum } from './Product';

export enum ProcessStatusEnum {
  DONE = 'DONE',
  ONGOING = 'ONGOING',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export interface Process {
  errors: string[];
  status: ProcessStatusEnum;
  supplier: SupplierEnum;
  lastDepUrl?: string;
  lastSku?: string;
  productListPage?: number;
  lastProductUrl?: string;
}

export interface ProcessDocument extends Omit<Document, 'errors'>, Process {}

const processSchema = new mongoose.Schema({
  lastDepUrl: { type: String },
  productListPage: { type: Number },
  lastProductUrl: { type: String },
  lastSku: { type: String },
  status: {
    required: true,
    type: String,
    enum: Object.values(ProcessStatusEnum),
    default: ProcessStatusEnum.ONGOING,
  },
  supplier: { required: true, type: String, enum: Object.values(SupplierEnum) },
  errors: { type: [String] },
});

export const MProcess = mongoose.model('Process', processSchema);
