import puppeteer, { Page } from 'puppeteer';
import { Product } from '../../types/Product';
import getProductData from './getProductData';

export default async function getAllpartsProductUrls(brandUrls: string[]) {
  const products: Product[] = [];

  await Promise.all(
    brandUrls.map(async (brandUrl) => {
      const urls = await getProductUrls(brandUrl);

      products.push(...urls);
    })
  );

  return products;
}

async function getProductUrls(brandUrl: string) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.goto(brandUrl);

  const productUrls = await page.$$eval(
    '#product-grid .grid__item a',
    (product) => product.map((a) => a.href)
  );

  const productData: Product[] = [];

  await browser.close();

  let lastSku: string | undefined = undefined;

  for (const productUrl of productUrls) {
    const data = await getProductData(productUrl, lastSku);

    if (data) {
      lastSku = data.sku;
      productData.push(data);
    }
  }

  return productData;
}
