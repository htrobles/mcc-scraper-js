import logger from 'node-color-log';
import { MRawProduct, RawProduct } from '../../models/RawProduct';
import parseCsv from './parseCsv';

export async function saveRawProducts(filename: string = 'products.csv') {
  await MRawProduct.deleteMany();

  const PAGE_SIZE = 100;

  const rawData = await parseCsv(`./input/${filename}`);
  const rawProducts = rawData
    .reduce((prev, row) => {
      const sku = row[4];
      const systemId = row[0];
      const title = row[5];
      const customSku = row[3];
      const upc = row[1];

      if (!sku) {
        return prev;
      }

      return [
        ...prev,
        {
          sku,
          systemId,
          title,
          customSku,
          upc,
        },
      ];
    }, [] as RawProduct[])
    .slice(1);

  let totalCount = rawProducts.length;
  let page = 1;
  let hasMore = true;

  let savedRawProducts: RawProduct[] = [];

  while (hasMore) {
    const x = (page - 1) * PAGE_SIZE;
    const y = page * PAGE_SIZE - 1;

    const products = rawProducts.slice(x, y);

    try {
      const dbProducts = (await MRawProduct.insertMany(products, {
        lean: true,
      })) as RawProduct[];

      savedRawProducts.push(...dbProducts);

      if (totalCount > y + 1) {
        page++;
      } else {
        hasMore = false;
      }
    } catch (error) {
      logger.error('ERROR SAVING RAW PRODUCTS');
      throw new Error('Error');
    }
  }

  return savedRawProducts;
}

export async function clearRawProducts() {
  await MRawProduct.deleteMany();
}
