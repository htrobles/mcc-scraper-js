import puppeteer from 'puppeteer';
import * as dotenv from 'dotenv';

dotenv.config();

const ALLPARTS_URL = 'https://www.allparts.com/pages/shop-by-brand';

export default async function getAllpartsBrandUrls() {
  const browser = await puppeteer.launch({
    headless: Boolean(process.env.HEADLESS),
  });
  const page = await browser.newPage();

  await page.goto(ALLPARTS_URL);

  const brandUrls = await page.$$eval('.por .grid__item a', (brand) =>
    brand.map((a) => a.href)
  );

  await browser.close();

  return brandUrls;
}
