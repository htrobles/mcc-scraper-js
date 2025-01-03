import puppeteer, { Page } from 'puppeteer';
import config from '../../config';
import logger from 'node-color-log';
import { MProduct, SupplierEnum } from '../../models/Product';
import saveImage from '../utils/saveImage';
import { minify } from 'html-minifier';
import getSupplierProductsOutput from '../utils/getSupplierProductsOutput';
import generateCsv, { generateSimilarityReport } from '../utils/generateCsv';
import parseHtml from '../utils/parseHtml';
import { ProductImage } from '../../models/ProductTypes';
import NumberParser from 'intl-number-parser';
import { MRawProduct, RawProduct } from '../../models/RawProduct';
import processWithRetry from '../utils/processUrl';
import promptSync from 'prompt-sync';
import {
  MProcess,
  ProcessDocument,
  ProcessStatusEnum,
} from '../../models/Process';
import { stringSimilarity } from 'string-similarity-js';
import { MProductSimilarity } from '../../models/ProductSimilarity';
import initiateProcess from '../utils/initiateProcess';
import { saveRawProducts } from '../utils/saveRawProducts';
import waitForDuration from '../utils/waitForDuration';

const PROCESS_QUERY = {
  status: ProcessStatusEnum.ONGOING,
  supplier: SupplierEnum.BURGERLIGHTING,
};

export default async function processBurgerLighting() {
  logger.info('PROCESSING BURGER LIGHTING');

  await initiateProcess(SupplierEnum.BURGERLIGHTING);

  await saveRawProducts();

  const browser = await puppeteer.launch({
    headless: config.HEADLESS,
    protocolTimeout: 60000,
    waitForInitialPage: true,
  });

  const page = await browser.newPage();

  await page.goto(config.BURGER_LIGHTING_URL, { waitUntil: 'networkidle2' });

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
    supplier: SupplierEnum.BURGERLIGHTING,
  });

  await generateSimilarityReport(
    productSimilarities,
    'burgerLighting-product-similarity-report',
    './output/burgerLighting'
  );

  const products = await getSupplierProductsOutput(SupplierEnum.BURGERLIGHTING);

  logger.success('Finished processing Burger Lighting website');

  await generateCsv(
    products,
    'burgerLighting-scraper-output.csv',
    './output/burgerLighting'
  );

  await MProcess.findByIdAndUpdate(process._id, {
    status: ProcessStatusEnum.DONE,
  });

  await MRawProduct.deleteMany();
}

export async function processSku(rawProduct: RawProduct, page: Page) {
  const { sku: rawSku, title: lsTitle } = rawProduct;

  try {
    await MProcess.findOneAndUpdate(PROCESS_QUERY, {
      lastSku: rawSku,
    });

    const input = await page.$('#searchInput');

    await page.click('#searchInput', { count: 4 });
    await input?.press('Backspace');

    await page.type('#searchInput', rawSku as string, { delay: 100 });

    await waitForDuration(2000);

    let productUrl: string;

    try {
      productUrl = await page.$eval(
        '#suggestions .suggestion a',
        (a) => a.href
      );
    } catch (error) {
      logger.warn('Product not found');
      logger.log(`SKU: ${rawSku}`);

      return;
    }

    await page.goto(productUrl, { waitUntil: 'networkidle2' });

    const sku = await page.$eval('#productTitle h3.sub_title', (skuEl) => {
      const words = skuEl.innerText.split(' ');

      return words[words.length - 1].trim();
    });

    const existingProduct = await MProduct.findOne({ sku }).lean();

    const title = await page.$eval('#productTitle h1.title_product', (title) =>
      title.innerText?.trim()
    );

    const similarity = stringSimilarity(lsTitle as string, title as string);

    const isSimilar = similarity > 0.3;

    await new MProductSimilarity({
      sku,
      lsTitle,
      storeTitle: title,
      similarity,
      supplier: SupplierEnum.BURGERLIGHTING,
    }).save();

    if (!isSimilar) {
      logger.error(
        `SIMILARITY FAILED SKIPPING PRODUCT: ${similarity} | SKU: ${sku}`
      );
      logger.log(`LS TITLE: ${lsTitle} | WEB TITLE: ${title}`);

      return;
    }

    const description = await page.$eval(
      '#productDescription',
      (description) => {
        description.removeAttribute('class');
        description.removeAttribute('id');
        const text = description.textContent?.trim().replace(/\n/g, '\\n');
        const html = description.outerHTML;

        return { text, html };
      }
    );

    description.html = parseHtml(description.html);

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
      '#product-images a',
      (elements, sku) =>
        elements.map((el, index) => {
          return {
            imageName: `${sku
              ?.replace('/', '-')
              .replace('/', '-')}-${index}.jpg`,
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

      await saveImage(url, imageName, './output/burgerLighting/images');

      if (isFeatured) {
        featuredImage = imageName;
      } else {
        images.push(imageName);
      }
    }

    const minifiedHtmlDesc = minify(description.html, {
      removeTagWhitespace: true,
      collapseWhitespace: true,
      collapseInlineTagWhitespace: true,
    });

    if (config.UPSERT_DATA && !!existingProduct) {
      await MProduct.findByIdAndUpdate(existingProduct._id, {
        systemId: rawProduct.systemId,
        sku,
        title,
        descriptionText: description.text,
        descriptionHtml: minifiedHtmlDesc,
        images,
        featuredImage,
        supplier: SupplierEnum.BURGERLIGHTING,
        missingDescription,
      });

      logger.success(`Updated Product: ${sku} | ${title}`);
    } else {
      const product = new MProduct({
        systemId: rawProduct.systemId,
        sku,
        title,
        descriptionText: description.text,
        descriptionHtml: minifiedHtmlDesc,
        images,
        featuredImage,
        supplier: SupplierEnum.BURGERLIGHTING,
        missingDescription,
      });

      await product.save();
      logger.success(`New Product: ${sku} | ${title}`);
    }
  } catch (error) {
    logger.error(`Unable to process product: ${rawSku} | ${lsTitle}`);
    console.log(error);
  }
}
