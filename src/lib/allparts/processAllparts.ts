import puppeteer from 'puppeteer';
import processAllpartsProducts from './processAllpartsProducts';
import logger from 'node-color-log';
import { MProduct, Product, SupplierEnum } from '../../models/Product';
import generateCsv from '../utils/generateCsv';
import config from '../../config';

export default async function processAllparts() {
  logger.info(' Processing Allparts website ');

  const browser = await puppeteer.launch({
    headless: config.HEADLESS,
  });
  const page = await browser.newPage();

  await page.goto(config.ALLPARTS_URL);

  const categoryUrls = await page.$$eval(
    '#MainContent .collection-list__item a',
    (brand) => brand.map((a) => a.href)
  );

  await browser.close();

  for (const categoryUrl of categoryUrls) {
    await processAllpartsProducts(categoryUrl);
  }

  const products: Product[] = await MProduct.find({
    supplier: SupplierEnum.ALLPARTS,
  }).lean();

  logger.success('Finished processing Allparts website');
  await generateCsv(products, 'allparts.csv', './output/allparts');
}