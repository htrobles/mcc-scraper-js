import puppeteer from 'puppeteer';
import * as dotenv from 'dotenv';
import processAllpartsBrandProducts from './processAllpartsBrandProducts';

dotenv.config();

const ALLPARTS_URL = 'https://www.allparts.com/pages/shop-by-brand';

export default async function processAllparts() {
  const browser = await puppeteer.launch({
    headless: Boolean(process.env.HEADLESS),
  });
  const page = await browser.newPage();

  await page.goto(ALLPARTS_URL);

  const brandUrls = await page.$$eval('.por .grid__item a', (brand) =>
    brand.map((a) => a.href)
  );

  await browser.close();

  //TODO Update to process all brands
  // for (const brandUrl of brandUrls) {
  for (const brandUrl of [brandUrls[0]]) {
    await processAllpartsBrandProducts(brandUrl);
  }
}
