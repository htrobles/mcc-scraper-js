import puppeteer from 'puppeteer';
import config from '../../config';
import { saveRawProducts } from '../utils/saveRawProducts';
import { MRawProduct } from '../../models/RawProduct';
import logger from 'node-color-log';
import waitForDuration from '../utils/waitForDuration';
import {
  MProductPricing,
  ProductPricing,
  StoreEnum,
} from '../../models/ProductPricing';
import { generatePriceComparisonCsvV2 } from '../utils/generatePricingCsv';

// Change this to the brand URL you want to scrape
const BRAND_URL = 'https://www.long-mcquade.com/search/6/279/Gibraltar/';

export default async function priceMatchLMBrandPage() {
  await saveRawProducts('lm-brand-input.csv');

  let nextPage: string | null = BRAND_URL;

  const browser = await puppeteer.launch({
    headless: config.HEADLESS,
    protocolTimeout: 60000,
    waitForInitialPage: true,
  });
  const page = await browser.newPage();
  let cookieAccepted = false;

  while (nextPage) {
    await page.goto(nextPage, { waitUntil: 'networkidle2' });

    if (!cookieAccepted) {
      try {
        await waitForDuration(2000);
        const acceptCookieBtn = await page.$('button.cky-btn.cky-btn-accept');

        await acceptCookieBtn?.click();

        cookieAccepted = true;
      } catch (error) {
        cookieAccepted = true;
      }
    }

    let nextPageUrl = null;

    try {
      nextPageUrl = await page.evaluate(() => {
        const chevron = document.querySelector(
          'ul.pagination i.fa-chevron-right'
        );

        if (chevron) {
          const parentAnchor = chevron.closest('a');
          return parentAnchor ? parentAnchor.href : null;
        }
      });
    } catch (error) {
      logger.warn(`Next page not found`);
    }

    if (nextPageUrl) {
      nextPage = nextPageUrl;
    } else {
      nextPage = null;
    }

    let products = await page.$$eval('div.products-item-descr', (elements) =>
      elements.map((product) => {
        const title = product
          .querySelector('h6.fw-bolder.text-grey.maxh-55.ellipsis-3.mb-0')
          ?.textContent?.trim() as string;

        const details = product.querySelector('div.maxh-110-true.mt-1');

        const sku = details?.childNodes[1]?.textContent
          ?.split(':')[1]
          ?.trim() as string;
        const price = details?.childNodes[3]?.textContent
          ?.split('or')[0]
          .split('$')[1]
          .trim() as string;

        return {
          title,
          sku,
          price: parseFloat(price),
        };
      })
    );

    const rawProducts = await MRawProduct.find(
      {
        sku: { $in: products.map((product) => product.sku) },
      },
      { sku: true, systemId: true, title: true, price: true }
    ).lean();

    const productPricings = products.reduce((acc, product) => {
      const foundProduct = rawProducts.find((r) => r.sku === product.sku);

      if (!foundProduct) {
        return acc;
      }

      const systemId = foundProduct.systemId;

      const productPricing: ProductPricing = {
        systemId,
        title: product.title,
        sku: product.sku,
        theirPrice: product.price,
        ourPrice: foundProduct.price as number,
        store: StoreEnum.LONGMCQUADEBrand,
      };

      return [...acc, productPricing];
    }, [] as ProductPricing[]);

    await MProductPricing.insertMany(productPricings);
  }

  await generatePriceComparisonCsvV2(StoreEnum.LONGMCQUADEBrand);
  await MProductPricing.deleteMany();
  await MRawProduct.deleteMany();
  await browser.close();
}
