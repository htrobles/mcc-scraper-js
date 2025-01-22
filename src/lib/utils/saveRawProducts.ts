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
        },
      ];
    }, [] as RawProduct[])
    .slice(1);

  let totalCount = rawProducts.length;
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const x = (page - 1) * PAGE_SIZE;
    const y = page * PAGE_SIZE - 1;

    const products = rawProducts.slice(x, y);

    try {
      await MRawProduct.insertMany(products);

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
}

export async function clearRawProducts() {
  await MRawProduct.deleteMany();
}
