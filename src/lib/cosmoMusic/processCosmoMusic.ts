import puppeteer, { Page } from 'puppeteer';
import config from '../../config';
import logger from 'node-color-log';
import { MProductPricing, StoreEnum } from '../../models/ProductPricing';
import { autoScroll } from '../utils/autoScroll';
import NumberParser from 'intl-number-parser';
import { generatePriceComparisonCsv } from '../utils/generatePricingCsv';

const parser = NumberParser('en-US', { style: 'currency', currency: 'USD' });

export default async function processCosmoMusic() {
  let currentPage: number | null = 1;

  try {
    const browser = await puppeteer.launch({
      headless: config.HEADLESS,
      protocolTimeout: 60000,
      waitForInitialPage: true,
    });

    const page = await browser.newPage();

    while (!!currentPage) {
      let nextPageUrl = `${config.COSMO_MUSIC_URL}?page=${currentPage}`;
      logger.log(nextPageUrl);

      await page.goto(nextPageUrl, {
        waitUntil: 'networkidle2',
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      try {
        const isEnd = await page.$eval(
          '.vtex-search-result-3-x-searchNotFoundOops',
          (el) => el.textContent
        );

        if (isEnd) {
          currentPage = null;
          continue;
        }
      } catch (error) {
        if (currentPage) {
          currentPage++;
        }
      }

      await autoScroll(page);

      const productUrls = await page.$$eval(
        'a.vtex-product-summary-2-x-clearLink',
        (items) => items.map((link) => link.href)
      );

      for (let productUrl of productUrls) {
        await processProduct(productUrl, page);
      }

      if (productUrls.length < 36) {
        logger.error('Incomplete products');
        logger.warn(nextPageUrl);
        console.log(productUrls);
      }
    }

    await browser.close();

    await generatePriceComparisonCsv(StoreEnum.COSMOMUSIC);
  } catch (error) {
    logger.error(
      `Type Page Error: ${config.COSMO_MUSIC_URL}?page=${currentPage}`
    );
    console.log(error);
  }
}

async function processProduct(productUrl: string, page: Page) {
  try {
    await page.goto(productUrl, { waitUntil: 'networkidle2' });

    const title = await page.$eval(
      '.vtex-store-components-3-x-productNameContainer--quickview',
      (title) => title.textContent?.trim()
    );

    const sku = await page.$eval(
      '.cosmo-store-theme-8-x-container_info',
      (sku) => sku.textContent?.split('|')[1].replace('Model: ', '').trim()
    );

    let theirPrice: string | number | null = await page.$eval(
      'span.vtex-product-price-1-x-currencyContainer.vtex-product-price-1-x-currencyContainer--product-price',
      (price) => price.textContent
    );

    theirPrice = parser(theirPrice as string);

    const pricing = await MProductPricing.findOneAndUpdate(
      { sku },
      { sku, title, theirPrice, store: StoreEnum.COSMOMUSIC },
      { upsert: true, new: true }
    );

    logger.success(`Data Updated: ${pricing.sku}, ${pricing.title}`);
  } catch (error) {
    logger.error(`Product Page Error: ${productUrl}`);
    console.log(error);
  }
}
