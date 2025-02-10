import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Page } from 'puppeteer';
import config from '../../config';
import logger from 'node-color-log';
import { SupplierEnum } from '../../models/Product';
import getSupplierProductsOutput from '../utils/getSupplierProductsOutput';
import generateCsv, {
  generateShopifyCsv,
  generateSimilarityReport,
} from '../utils/generateCsv';
import { MRawProduct, RawProduct } from '../../models/RawProduct';
import processWithRetry from '../utils/processWithRetry';
import { MProcess, ProcessStatusEnum } from '../../models/Process';
import { MProductSimilarity } from '../../models/ProductSimilarity';
import initiateProcess from '../utils/initiateProcess';
import { saveRawProducts } from '../utils/saveRawProducts';
import waitForDuration from '../utils/waitForDuration';
import getBrowser from '../utils/getBrowser';
import {
  DescriptionData,
  getDescriptionData,
  getImageData,
  getTitle,
  getUPC,
  saveProduct,
} from '../utils/processProduct';

const PROCESS_QUERY = {
  status: ProcessStatusEnum.ONGOING,
  supplier: SupplierEnum.TAYLOR,
};

puppeteer.use(StealthPlugin());

export default async function processTaylor() {
  logger.info('PROCESSING Taylor');

  const process = await initiateProcess(SupplierEnum.TAYLOR);

  let rawProducts = await saveRawProducts('products-taylor.csv');

  if (!process) {
    throw new Error('Process not found');
  }

  if (process.lastSku) {
    const index = rawProducts.findIndex((p) => p.sku === process.lastSku);

    rawProducts = rawProducts.slice(index);

    logger.warn('PROCESS LAST SKU');
    logger.log(`SKU: ${process.lastSku}`);
  }

  const { browser, page } = await getBrowser();

  await page.goto(config.TAYLOR_URL, { waitUntil: 'networkidle2' });

  await waitForDuration(2000);

  for (let rawProduct of rawProducts) {
    logger.info(`Processing SKU: ${rawProduct.sku}`);
    await processSku(rawProduct as RawProduct, page);
  }

  await browser.close();

  await generateSimilarityReport(
    SupplierEnum.TAYLOR,
    'taylor-product-similarity-report',
    './output/taylor'
  );

  const products = await getSupplierProductsOutput(SupplierEnum.TAYLOR);

  logger.success('Finished processing Taylor website');

  await generateCsv(products, 'taylor-scraper-output.csv', './output/taylor');
  await generateShopifyCsv(
    products,
    `taylor-scraper-output-shopify.csv`,
    `./output/taylor`
  );

  await MProcess.findByIdAndUpdate(process._id, {
    status: ProcessStatusEnum.DONE,
  });

  await MProductSimilarity.deleteMany({ supplier: SupplierEnum.TAYLOR });
  await MRawProduct.deleteMany();
}

export async function processSku(rawProduct: RawProduct, page: Page) {
  const { sku: rawSku, title: lsTitle, upc } = rawProduct;

  try {
    await MProcess.findOneAndUpdate(PROCESS_QUERY, {
      lastSku: rawSku,
    });

    let productUrl = await getProductUrl(upc as string, rawSku, page);

    if (!productUrl) {
      productUrl = await getProductUrl(rawSku, rawSku, page);
    }

    if (!productUrl) {
      logger.error(`No product URL found SKU: ${rawSku} | UPC: ${upc}`);
      return;
    }

    await processWithRetry(() =>
      processProductUrl(productUrl, rawProduct, page)
    );
  } catch (error) {
    logger.error(`Unable to process product: ${rawSku} | ${lsTitle}`);
    console.log(error);
  }
}

async function processProductUrl(
  productUrl: string,
  rawProduct: RawProduct,
  page: Page
) {
  const { sku, upc } = rawProduct;

  await page.goto(productUrl, { waitUntil: 'networkidle2' });

  let webUpc: string = '';

  try {
    webUpc = (await getUPC('.details span.model', page)).split('#')[1];
  } catch (error) {
    logger.warn('UPC not found. Trying to get from other sources');
  }

  if (!webUpc) {
    try {
      webUpc = (await getUPC('.guitar-details', page)).split('#')[1];
    } catch (error) {
      logger.error(`UPC not found: ${sku}`);
      return;
    }
  }

  if (webUpc.startsWith('00')) {
    webUpc = webUpc.substring(2);
  }

  if (
    upc?.toLowerCase() !== webUpc.toLowerCase() &&
    sku?.toLowerCase() !== webUpc.toLowerCase()
  ) {
    logger.error(`UPC and SKU mismatch: ${sku} | ${upc} | ${webUpc}`);
    return;
  }

  const title = await getTitle('.title h2', page);

  const imageData = await getImageData(
    '.main-gallery-wrapper .photoswipe-gallery a.photoswipe',
    sku as string,
    page,
    'href'
  );

  let overview: DescriptionData = { text: '', html: '' };
  let desc: DescriptionData = { text: '', html: '' };

  try {
    overview = await getDescriptionData('.bullets', page);
  } catch (error) {
    logger.warn(`No overview found: ${sku}`);
  }

  try {
    desc = await getDescriptionData('#guitar-overview', page);
  } catch (error) {
    logger.warn(`No description found: ${sku}`);
  }

  const description = {
    text: (overview?.text as string) + desc?.text,
    html: overview?.html + desc?.html,
  };

  await saveProduct({
    description,
    title,
    imageData,
    rawProduct,
    supplier: SupplierEnum.TAYLOR,
  });
}

async function getProductUrl(searchkey: string, rawSku: string, page: Page) {
  await page.hover('.search-icon');

  const input = await page.$('input[data-drupal-selector="edit-search"]');
  await page.click('input[data-drupal-selector="edit-search"]', { count: 4 });
  await input?.press('Backspace');

  await page.type(
    'input[data-drupal-selector="edit-search"]',
    searchkey as string,
    {
      delay: 100,
    }
  );

  await page.keyboard.press('Enter');

  await page.waitForNavigation({ waitUntil: 'networkidle2' });

  try {
    const productUrl = await page.$eval(
      '.listing-card.product-listing-card .text-container h3 a',
      (link) => link.href
    );

    if (!productUrl) {
      logger.warn(`No product URL found SKU: ${rawSku}`);
    }

    return productUrl;
  } catch (error) {
    return null;
  }
}
