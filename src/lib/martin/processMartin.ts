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
import processWithRetry from '../utils/processWithRetry';
import { MProcess, ProcessStatusEnum } from '../../models/Process';
import { MProductSimilarity } from '../../models/ProductSimilarity';
import initiateProcess from '../utils/initiateProcess';
import { saveRawProducts } from '../utils/saveRawProducts';
import waitForDuration from '../utils/waitForDuration';
import getBrowser from '../utils/getBrowser';

const PROCESS_QUERY = {
  status: ProcessStatusEnum.ONGOING,
  supplier: SupplierEnum.MARTIN,
};

puppeteer.use(StealthPlugin());

export default async function processMartin() {
  logger.info('PROCESSING Martin');

  const process = await initiateProcess(SupplierEnum.MARTIN);

  let rawProducts = await saveRawProducts('products-martin.csv');

  const { browser, page } = await getBrowser();

  await page.goto(config.MARTIN_URL, { waitUntil: 'networkidle2' });

  await waitForDuration(2000);

  if (!process) {
    throw new Error('Process not found');
  }

  if (process.lastSku) {
    const index = rawProducts.findIndex((p) => p.sku === process.lastSku);

    rawProducts = rawProducts.slice(index);

    logger.warn('PROCESS LAST SKU');
    logger.log(`SKU: ${process.lastSku}`);
  }

  for (let rawProduct of rawProducts) {
    logger.info(`Processing SKU: ${rawProduct.sku}`);
    await processWithRetry(() => processSku(rawProduct as RawProduct, page));
  }

  await browser.close();

  await generateSimilarityReport(
    SupplierEnum.MARTIN,
    'martin-product-similarity-report',
    './output/martin'
  );

  const products = await getSupplierProductsOutput(SupplierEnum.MARTIN);

  logger.success('Finished processing Martin website');

  await generateCsv(products, 'martin-scraper-output.csv', './output/martin');
  await generateShopifyCsv(
    products,
    `martin-scraper-output-shopify.csv`,
    `./output/martin`
  );

  await MProcess.findByIdAndUpdate(process._id, {
    status: ProcessStatusEnum.DONE,
  });

  await MProductSimilarity.deleteMany({ supplier: SupplierEnum.MARTIN });
  await MRawProduct.deleteMany();
}

export async function processSku(rawProduct: RawProduct, page: Page) {
  const { sku: rawSku, title: lsTitle } = rawProduct;

  try {
    await MProcess.findOneAndUpdate(PROCESS_QUERY, {
      lastSku: rawSku,
    });

    const input = await page.$('.col.header-column-3 input.search-field');

    await page.hover('.col.header-column-3 .site-search');

    await page.click('.col.header-column-3 input.search-field', { count: 4 });
    await input?.press('Backspace');

    await page.type(
      '.col.header-column-3 input.search-field',
      rawSku as string,
      {
        delay: 100,
      }
    );

    await waitForDuration(2000);

    try {
      const productUrl = await page.$eval(
        '.suggestions-item a',
        (link) => link.href
      );

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

  const existingProduct = await MProduct.findOne({ sku: rawSku }).lean();

  const title = await page.$eval('h1.product-name', (title) =>
    title.innerText?.trim()
  );

  const description = await page.$eval(
    '.product-data .row.mt-3 .col',
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
      logger.warn(`No description found: ${rawSku}`);
      return;
    }
  }

  const imageData = await page.$$eval(
    '.slide.tns-item img.zoomImg',
    (elements, sku) =>
      elements.map((el, index) => {
        return {
          imageName: `${sku?.replace('/', '-').replace('/', '-')}-${index}.jpg`,
          isFeatured: index === 0,
          url: el.src,
        };
      }),
    rawSku
  );

  const images: string[] = [];
  let featuredImage = '';

  for (const data of imageData as ProductImage[]) {
    const { url, imageName, isFeatured } = data;

    await saveImage(url, imageName, './output/martin/images');

    if (isFeatured) {
      featuredImage = imageName;
    } else {
      images.push(imageName);
    }
  }

  if (config.UPSERT_DATA && !!existingProduct) {
    await MProduct.findByIdAndUpdate(existingProduct._id, {
      systemId: rawProduct.systemId,
      sku: rawSku,
      title,
      descriptionText: description.text,
      descriptionHtml: description.html,
      images,
      featuredImage,
      supplier: SupplierEnum.MARTIN,
      missingDescription,
    });

    logger.success(`Updated Product: ${rawSku} | ${title}`);
  } else {
    const product = new MProduct({
      systemId: rawProduct.systemId,
      sku: rawSku,
      title,
      descriptionText: description.text,
      descriptionHtml: description.html,
      images,
      featuredImage,
      supplier: SupplierEnum.MARTIN,
      missingDescription,
    });

    await product.save();
    logger.success(`New Product: ${rawSku} | ${title}`);
  }
}
