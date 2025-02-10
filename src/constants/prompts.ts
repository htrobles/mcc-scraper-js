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
  {
    key: SupplierEnum.LM,
    label: 'L.M.',
  },
  {
    key: SupplierEnum.LM,
    label: 'L.M. - Brand',
    scrapeBrand: true,
  },
  {
    key: SupplierEnum.BURGERLIGHTING,
    label: 'Burger Lighting',
  },
  {
    key: SupplierEnum.REDONE,
    label: 'Red One',
  },
  {
    key: SupplierEnum.MARTIN,
    label: 'Martin',
  },
  {
    key: SupplierEnum.TAYLOR,
    label: 'Taylor',
  },
];

export interface StoreChoice {
  key: StoreEnum;
  label: string;
  fileOutputName: string;
}

export const storeChoices: StoreChoice[] = [
  {
    key: StoreEnum.TOMLEEMUSIC,
    label: 'Tom Lee Music',
    fileOutputName: 'tom-lee-music',
  },
  {
    key: StoreEnum.ACCLAIMMUSIC,
    label: 'Acclaim Music',
    fileOutputName: 'acclaim-music',
  },
  {
    key: StoreEnum.COSMOMUSIC,
    label: 'Cosmo Music',
    fileOutputName: 'cosmo-music',
  },
];
