import puppeteer from 'puppeteer';

export default async function getAllpartsBrandUrls() {
  const url = 'https://www.allparts.com/pages/shop-by-brand';

  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.goto(url);

  const brandUrls = await page.$$eval('.por .grid__item a', (brand) =>
    brand.map((a) => a.href)
  );

  await browser.close();

  return brandUrls;
}
