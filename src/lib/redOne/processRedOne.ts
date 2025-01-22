import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Page } from 'puppeteer';
import config from '../../config';
import logger from 'node-color-log';
import { MProduct, SupplierEnum } from '../../models/Product';
import saveImage from '../utils/saveImage';
import { minify } from 'html-minifier';
import getSupplierProductsOutput from '../utils/getSupplierProductsOutput';
import generateCsv, {
  generateShopifyCsv,
  generateSimilarityReport,
} from '../utils/generateCsv';
import parseHtml from '../utils/parseHtml';
import { ProductImage } from '../../models/ProductTypes';
import { MRawProduct, RawProduct } from '../../models/RawProduct';
import processWithRetry from '../utils/processUrl';
import {
  MProcess,
  ProcessDocument,
  ProcessStatusEnum,
} from '../../models/Process';
import { MProductSimilarity } from '../../models/ProductSimilarity';
import initiateProcess from '../utils/initiateProcess';
import { saveRawProducts } from '../utils/saveRawProducts';
import waitForDuration from '../utils/waitForDuration';
import checkSimilarity from '../utils/checkSimilarity';

const PROCESS_QUERY = {
  status: ProcessStatusEnum.ONGOING,
  supplier: SupplierEnum.REDONE,
};

puppeteer.use(StealthPlugin());

export default async function processRedOne() {
  logger.info('PROCESSING Red One Music');

  await initiateProcess(SupplierEnum.REDONE);

  await saveRawProducts('products.csv');

  const browser = await puppeteer.launch({
    headless: config.HEADLESS,
    protocolTimeout: 120000,
    waitForInitialPage: true,
  });

  const page = await browser.newPage();

  await page.goto(config.RED_ONE_URL, { waitUntil: 'networkidle2' });

  const process = (await MProcess.findOne(
    PROCESS_QUERY
  ).lean()) as ProcessDocument;

  if (!process) {
    throw new Error('Process not found');
  }

  let rawProducts = await MRawProduct.find().lean();

  if (process.lastSku) {
    const index = rawProducts.findIndex((p) => p.sku === process.lastSku);

    rawProducts = rawProducts.slice(index);

    logger.warn('PROCESS LAST SKU');
    logger.log(`SKU: ${process.lastSku}`);
  }

  for (let rawProduct of rawProducts) {
    await processWithRetry(() => processSku(rawProduct as RawProduct, page));
  }

  await browser.close();

  const productSimilarities = await MProductSimilarity.find({
    supplier: SupplierEnum.REDONE,
  });

  await generateSimilarityReport(
    productSimilarities,
    'redOne-product-similarity-report',
    './output/redOne'
  );

  const products = await getSupplierProductsOutput(SupplierEnum.REDONE);

  logger.success('Finished processing RedOne Music website');

  await generateCsv(products, 'redOne-scraper-output.csv', './output/redOne');
  await generateShopifyCsv(
    products,
    `redOne-scraper-output-shopify.csv`,
    `./output/redOne`
  );

  await MProcess.findByIdAndUpdate(process._id, {
    status: ProcessStatusEnum.DONE,
  });

  await MProductSimilarity.deleteMany({ supplier: SupplierEnum.REDONE });
  await MRawProduct.deleteMany();
}

export async function processSku(rawProduct: RawProduct, page: Page) {
  const { sku: rawSku, title: lsTitle } = rawProduct;

  try {
    await MProcess.findOneAndUpdate(PROCESS_QUERY, {
      lastSku: rawSku,
    });

    const input = await page.$('input.search-bar__input');

    await page.click('input.search-bar__input', { count: 4 });
    await input?.press('Backspace');

    await page.type('input.search-bar__input', rawSku as string, {
      delay: 100,
    });

    await waitForDuration(2000);

    try {
      const productUrl = await page.$eval('a.snize-item', (link) => link.href);

      if (!productUrl) {
        logger.warn(`No product URL found SKU: ${rawSku}`);
      }

      await processProductUrl(productUrl, rawProduct, page);
    } catch (error) {
      logger.error(`Cannot find product SKU: ${rawSku}`);
    }
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
  const { title: lsTitle, sku: rawSku } = rawProduct;

  await page.goto(productUrl, { waitUntil: 'networkidle2' });

  const sku = await page.$eval('span.product-meta__sku-number', (skuEl) =>
    skuEl.textContent?.trim()
  );

  if (rawSku !== sku) return;

  const existingProduct = await MProduct.findOne({ sku }).lean();

  const title = await page.$eval('h1.product-meta__title', (title) =>
    title.innerText?.trim()
  );

  const { isSimilar, similarity } = await checkSimilarity({
    lsTitle: lsTitle as string,
    title,
    supplier: SupplierEnum.REDONE,
    sku: rawSku as string,
  });

  if (!isSimilar) {
    logger.error(
      `SIMILARITY FAILED SKIPPING PRODUCT: ${similarity} | SKU: ${rawSku}`
    );
    logger.log(`LS TITLE: ${lsTitle} | WEB TITLE: ${title}`);

    return;
  }

  const description = await page.$eval(
    '.product-block-list__item--description .rte.text--pull',
    (description) => {
      description.removeAttribute('class');
      description.removeAttribute('id');
      const text = description.textContent?.trim().replace(/\n/g, '\\n');

      return { text, html: description.outerHTML };
    }
  );

  description.html = minify(parseHtml(description.html), {
    removeTagWhitespace: true,
    collapseWhitespace: true,
    collapseInlineTagWhitespace: true,
  });

  let missingDescription = !description.text;

  if (!description.text) {
    if (config.REPLACE_EMPTY_DESC_WITH_TITLE) {
      description.text = title;
      description.html = `<p>${title}</p>`;
    } else {
      logger.warn(`No description found: ${sku}`);
      return;
    }
  }

  const imageData = await page.$$eval(
    'a.product-gallery__thumbnail',
    (elements, sku) =>
      elements.map((el, index) => {
        return {
          imageName: `${sku?.replace('/', '-').replace('/', '-')}-${index}.jpg`,
          isFeatured: index === 0,
          url: el.href,
        };
      }),
    sku
  );

  const images: string[] = [];
  let featuredImage = '';

  for (const data of imageData as ProductImage[]) {
    const { url, imageName, isFeatured } = data;

    await saveImage(url, imageName, './output/redOne/images');

    if (isFeatured) {
      featuredImage = imageName;
    } else {
      images.push(imageName);
    }
  }

  if (config.UPSERT_DATA && !!existingProduct) {
    await MProduct.findByIdAndUpdate(existingProduct._id, {
      systemId: rawProduct.systemId,
      sku,
      title,
      descriptionText: description.text,
      descriptionHtml: description.html,
      images,
      featuredImage,
      supplier: SupplierEnum.REDONE,
      missingDescription,
    });

    logger.success(`Updated Product: ${sku} | ${title}`);
  } else {
    const product = new MProduct({
      systemId: rawProduct.systemId,
      sku,
      title,
      descriptionText: description.text,
      descriptionHtml: description.html,
      images,
      featuredImage,
      supplier: SupplierEnum.REDONE,
      missingDescription,
    });

    await product.save();
    logger.success(`New Product: ${sku} | ${title}`);
  }
}
