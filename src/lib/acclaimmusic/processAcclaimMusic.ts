import puppeteer, { Page } from 'puppeteer';
import config from '../../config';
import parseCsv from '../utils/parseCsv';
import logger from 'node-color-log';
import { MProductPricing, StoreEnum } from '../../models/ProductPricing';
import generatePricingCsv from '../utils/generatePricingCsv';
import NumberParser from 'intl-number-parser';

const parser = NumberParser('en-US', { style: 'currency', currency: 'USD' });

const PAGE_SIZE = 100;

export default async function processAcclaimMusic() {
  const browser = await puppeteer.launch({
    headless: config.HEADLESS,
    protocolTimeout: 60000,
    waitForInitialPage: true,
  });

  const page = await browser.newPage();

  let nextPageUrl: string | null = config.ACCLAIM_MUSIC_URL;

  while (!!nextPageUrl) {
    console.log(nextPageUrl);
    await page.goto(nextPageUrl, { waitUntil: 'networkidle2' });

    try {
      nextPageUrl = await page.$eval(
        '.pagination.btn-group a.btn.btn-lg.btn-default[rel="next"]',
        (nextLink) => nextLink.href
      );
    } catch (error) {
      nextPageUrl = null;
      logger.log('Next page not found');
    }

    const productUrls = await page.$$eval(
      '.product-grid.item .product-thumbnail a',
      (items) => items.map((link) => link.href)
    );

    for (let productUrl of productUrls) {
      await processProduct(productUrl, page);
    }
  }

  await browser.close();

  await generatePriceComparison();

  try {
  } catch (error) {
    logger.error(`Type Page Error: ${nextPageUrl}`);
    console.log(error);
  }
}

async function processProduct(productUrl: string, page: Page) {
  try {
    await page.goto(productUrl, { waitUntil: 'networkidle2' });

    const title = await page.$eval('h1.product-title', (title) =>
      title.textContent?.trim()
    );

    const sku = await page.$eval(
      '.row.product-info-line div.text-right[itemprop="mpn"]',
      (line) => line.textContent
    );

    let theirPrice: string | number | null = await page.$eval(
      '#buyitinfoblock span.productDetailsPrice',
      (price) => price.textContent
    );

    theirPrice = parser(theirPrice as string);

    const pricing = await MProductPricing.findOneAndUpdate(
      { sku },
      { sku, title, theirPrice, store: StoreEnum.ACCLAIMMUSIC },
      { upsert: true, new: true }
    );

    logger.success(`Data Updated: ${pricing.sku}, ${pricing.title}`);
  } catch (error) {
    logger.error(`Product Page Error: ${productUrl}`);
    console.log(error);
  }
}

async function generatePriceComparison() {
  try {
    const rawData = await parseCsv('./input/products.csv');
    const rawProducts: { sku: string; systemId: string; ourPrice: number }[] =
      rawData
        .map((row) => {
          const rawPrice = row[8];

          const ourPrice = parser(rawPrice);

          return { sku: row[4], systemId: row[0], ourPrice };
        })
        .slice(1);
    const rawProductsMap: {
      [key: string]: { systemId: string; sku: string; ourPrice: number };
    } = {};

    rawProducts.forEach((p) => {
      rawProductsMap[p.sku.toLowerCase()] = {
        systemId: p.systemId,
        sku: p.sku,
        ourPrice: p.ourPrice,
      };
    });

    let page = 1;

    const totalCount = await MProductPricing.countDocuments({
      store: StoreEnum.ACCLAIMMUSIC,
    });

    let totalProcessed = 0;

    const pricingsToProcess: { [key: string]: any }[] = [];

    while (totalCount > totalProcessed) {
      let offset = (page - 1) * PAGE_SIZE;

      let pricings = await MProductPricing.find({
        store: StoreEnum.ACCLAIMMUSIC,
      })
        .sort({ sku: 1 })
        .skip(offset)
        .limit(PAGE_SIZE)
        .lean();

      await Promise.all(
        pricings.map(async (pricing) => {
          const existingPricing = rawProductsMap[pricing.sku.toLowerCase()];

          if (!existingPricing) {
            pricingsToProcess.push(pricing);
            return;
          }

          const updatedPricing = await MProductPricing.findOneAndUpdate(
            pricing._id,
            {
              ourPrice: existingPricing.ourPrice,
              systemId: existingPricing.systemId,
            },
            { new: true }
          );

          pricingsToProcess.push(updatedPricing as { [key: string]: any });
        })
      );

      totalProcessed += pricings.length;
      page++;
    }

    logger.success('Finished processing Acclaim Music website');

    await generatePricingCsv(
      pricingsToProcess,
      'acclaim-music.csv',
      './output/store-pricings'
    );
  } catch (error) {
    logger.error('Failed to generate Price Comparison');
    console.log(error);
  }
}
