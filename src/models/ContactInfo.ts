import mongoose from 'mongoose';

export type ContactInfo = {
  name?: string;
  address1?: string | null;
  address2?: string | null;
  address3?: string | null;
  phone?: string | null;
  website?: string | null;
};

const contactInfoSchema = new mongoose.Schema({
  name: { type: String },
  address1: { type: String },
  address2: { type: String },
  address3: { type: String },
  phone: { type: String },
  website: { type: String },
});

export const MContactInfo = mongoose.model('ContactInfo', contactInfoSchema);
