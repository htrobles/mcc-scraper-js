import logger from 'node-color-log';
import { MRawProduct } from '../../models/RawProduct';
import parseCsv from './parseCsv';

export async function saveRawProducts(filename: string = 'products.csv') {
  await MRawProduct.deleteMany();

  const PAGE_SIZE = 100;

  const rawData = await parseCsv(`./input/${filename}`);
  const rawProducts = rawData
    .map((row) => ({
      sku: row[4],
      systemId: row[0],
      title: row[5],
      customSku: row[3],
    }))
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
