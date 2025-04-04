import puppeteer, { Page } from 'puppeteer';
import config from '../../config';
import parseCsv from '../utils/parseCsv';
import logger from 'node-color-log';
import { MProductPricing, StoreEnum } from '../../models/ProductPricing';
import generatePricingCsv from '../utils/generatePricingCsv';
import NumberParser from 'intl-number-parser';

const parser = NumberParser('en-US', { style: 'currency', currency: 'USD' });

const PAGE_SIZE = 1;

export default async function processTomLeeMusic() {
  const browser = await puppeteer.launch({
    headless: config.HEADLESS,
    protocolTimeout: 60000,
    waitForInitialPage: true,
  });

  const page = await browser.newPage();

  await page.goto(config.TOM_LEE_MUSIC_URL, { waitUntil: 'networkidle2' });

  const typeUrls = await page.$$eval('.col-sm-6 p a', (links) =>
    links.map((link) => link.href)
  );

  for (let typeUrl of typeUrls) {
    await processTypeUrl(typeUrl, page);
  }

  await browser.close();

  await generatePriceComparison();
  try {
  } catch (error) {
    logger.error(error);
  }
}

async function processTypeUrl(typeUrl: string, page: Page) {
  let nextPageUrl: string | null = typeUrl;

  while (!!nextPageUrl) {
    console.log(nextPageUrl);
    await page.goto(nextPageUrl, { waitUntil: 'networkidle2' });

    try {
      nextPageUrl = await page.$eval(
        '.pages a.action.next',
        (nextLink) => nextLink.href
      );
    } catch (error) {
      nextPageUrl = null;
      logger.log('Next page not found');
    }

    const productUrls = await page.$$eval(
      '.product-item .product-item-info .product-item-details a.product-item-link',
      (items) => items.map((link) => link.href)
    );

    for (let productUrl of productUrls) {
      await processProduct(productUrl, page);
    }
  }
  try {
  } catch (error) {
    logger.error(`Type Page Error: ${typeUrl}`);
  }
}

async function processProduct(productUrl: string, page: Page) {
  try {
    await page.goto(productUrl, { waitUntil: 'networkidle2' });

    const title = await page.$eval('.page-title', (title) =>
      title.textContent?.trim()
    );

    const sku = await page.$eval(
      '.product-info-main ul li',
      (line) => line.textContent?.replace('Catalog #: ', '').trim() || ''
    );

    let price: string | number | null;

    try {
      price = await page.$eval(
        '.special-price span.price',
        (price) => price.textContent
      );
    } catch (error) {
      price = await page.$eval(
        '.price-container .price',
        (price) => price.textContent
      );
    }

    price = parser(price as string);

    const pricing = await MProductPricing.findOneAndUpdate(
      { sku },
      { sku, title, theirPrice: price, store: StoreEnum.TOMLEEMUSIC },
      { upsert: true, new: true }
    );

    logger.success(`Data Updated: ${pricing.sku}, ${pricing.title}`);
  } catch (error) {
    logger.error(`Product Page Error: ${productUrl}`);
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
      store: StoreEnum.TOMLEEMUSIC,
    });

    let totalProcessed = 0;

    const pricingsToProcess: { [key: string]: any }[] = [];

    while (totalCount > totalProcessed) {
      let offset = (page - 1) * PAGE_SIZE;

      let pricings = await MProductPricing.find({
        store: StoreEnum.TOMLEEMUSIC,
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

    logger.success('Finished processing Tom Lee Music website');

    await generatePricingCsv(
      pricingsToProcess,
      'tom-lee-music.csv',
      './output/store-pricings'
    );
  } catch (error) {
    logger.error(error);
  }
}
