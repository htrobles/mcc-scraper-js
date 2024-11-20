import puppeteer from 'puppeteer';
import processAllpartsProducts from './processAllpartsProducts';
import logger from 'node-color-log';
import { MProduct, SupplierEnum } from '../../models/Product';
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

  const products = (
    await MProduct.find({
      supplier: SupplierEnum.ALLPARTS,
    }).lean()
  ).map(
    ({
      sku,
      title,
      descriptionText,
      descriptionHtml,
      images,
      featuredImage,
    }) => {
      const product: { [key: string]: any } = {
        sku,
        title,
        descriptionText,
        descriptionHtml,
        featuredImage,
        image0: images[0],
      };

      images.forEach((imageName, index) => {
        product[`image${index}`] = imageName;
      });

      return product;
    }
  );

  logger.success('Finished processing Allparts website');
  await generateCsv(
    products,
    'allparts-scraper-output.csv',
    './output/allparts'
  );
}
