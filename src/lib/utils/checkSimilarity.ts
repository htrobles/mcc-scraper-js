import stringSimilarity from 'string-similarity-js';
import { MProductSimilarity } from '../../models/ProductSimilarity';
import { SupplierEnum } from '../../models/Product';

type CheckSimilarityOptions = {
  title: string;
  lsTitle: string;
  sku: string;
  supplier: SupplierEnum;
  similarityTreshold?: number;
};

export default async function checkSimilarity(options: CheckSimilarityOptions) {
  const { title, lsTitle, sku, supplier, similarityTreshold = 0.3 } = options;

  const similarity = stringSimilarity(lsTitle as string, title as string);

  const isSimilar = similarity > similarityTreshold;

  await new MProductSimilarity({
    sku,
    lsTitle,
    storeTitle: title,
    similarity,
    supplier,
  }).save();

  return { isSimilar, similarity };
}
