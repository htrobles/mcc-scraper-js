import { compareProductPricing, getProductInfo } from '../lib/actions';
import { SupplierEnum } from '../models/Product';
import { StoreEnum } from '../models/ProductPricing';

export const typeChoices = [
  { label: 'Get Product Information', action: getProductInfo },
  { label: 'Compare Product Pricing', action: compareProductPricing },
];

export const supplierChoices = [
  {
    key: SupplierEnum.ALLPARTS,
    label: 'Allparts',
  },
  {
    key: SupplierEnum.COASTMUSIC,
    label: 'Coast Music',
  },
  {
    key: SupplierEnum.KORGCANADA,
    label: 'Korg Canada',
  },
  {
    key: SupplierEnum.FENDER,
    label: 'Fender',
  },
  {
    key: SupplierEnum.DADDARIO,
    label: "D'addario",
  },
];

export const storeChoices = [
  {
    key: StoreEnum.TOMLEEMUSIC,
    label: 'Tom Lee Music',
  },
];
