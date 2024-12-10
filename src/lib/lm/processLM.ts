import puppeteer, { Page } from 'puppeteer';
import parseCsv from '../utils/parseCsv';
import config from '../../config';
import logger from 'node-color-log';
import { MProduct, SupplierEnum } from '../../models/Product';
import saveImage from '../utils/saveImage';
import { minify } from 'html-minifier';
import getSupplierProductsOutput from '../utils/getSupplierProductsOutput';
import generateCsv from '../utils/generateCsv';
import parseHtml from '../utils/parseHtml';
import { ProductImage } from '../../models/ProductTypes';
import NumberParser from 'intl-number-parser';
import { MRawProduct } from '../../models/RawProduct';
import { MProductPricing } from '../../models/ProductPricing';

const parser = NumberParser('en-US', { style: 'decimal' });

export default async function processLM() {
  await saveRawProducts();

  const browser = await puppeteer.launch({
    headless: config.HEADLESS,
    protocolTimeout: 60000,
    waitForInitialPage: true,
  });

  const page = await browser.newPage();

  await page.goto(config.LM_URL, { waitUntil: 'networkidle2' });

  let depUrls = await page.$$eval(
    '.dropdown-menu.dropdown-content.dHome .sub-deps>li.dropdown-item>a.sub-menu-link-dep',
    (links) =>
      links
        .filter((link) => link.href.includes('/departments/'))
        .map((link) => link.href)
  );

  for (let depUrl of depUrls) {
    await processDepUrl(depUrl, page);
  }

  await browser.close();

  const products = await getSupplierProductsOutput(SupplierEnum.LM);

  logger.success('Finished processing L.M. website');

  await generateCsv(products, 'lm-scraper-output.csv', './output/lm');
}

async function processDepUrl(depUrl: string, page: Page) {
  await page.goto(depUrl, { waitUntil: 'networkidle2' });

  let totalCountStr: string = await page.$eval(
    '#top-pagination',
    (paginationRow) =>
      paginationRow.textContent?.split('of')[1].trim() as string
  );

  const totalCount = parser(totalCountStr as string);

  let skipCount: number | null = 0;

  while (skipCount !== null) {
    const nextUrl =
      depUrl + `?LocationsID=57&Current=${skipCount}&#top-pagination`;

    await page.goto(nextUrl, { waitUntil: 'networkidle2' });

    const products = await page.$$eval('.products-item', (items) =>
      items.map((item) => {
        const url = item
          .querySelector('a.products-item-link')
          ?.getAttribute('href');
        const sku = item
          .querySelector(
            '.products-item-descr .maxh-90.mt-1 p.mb-0.text-dark.fs-7'
          )
          ?.textContent?.split(':')[1]
          .trim();

        return { url, sku };
      })
    );

    const productSkus = products.map(({ sku }) => sku);

    const lightspeedProducts = await MRawProduct.find({
      sku: { $in: productSkus },
    }).lean();

    const productUrls = lightspeedProducts.reduce((prev, product) => {
      const { sku } = product;
      const exisitngProduct = products.find((p) => p.sku === sku);

      if (!exisitngProduct) {
        return prev;
      } else {
        return [...prev, exisitngProduct.url as string];
      }
    }, [] as string[]);

    for (let productUrl of productUrls) {
      await processProductUrl(productUrl, page);
    }

    skipCount = getNextSkipCount(skipCount, totalCount);
  }
}

export async function processProductUrl(productUrl: string, page: Page) {
  try {
    await page.goto(productUrl, { waitUntil: 'networkidle2' });

    const skuElement = await page.waitForSelector(
      "::-p-xpath(//*[contains(text(), 'Model: #')])"
    );
    const sku = await skuElement?.evaluate((el) =>
      el.textContent?.split('#')[1].trim()
    );

    const rawProduct = await MRawProduct.findOne({
      $or: [{ sku }, { customSku: sku }],
    }).lean();
    const existingProduct = await MProduct.findOne({ sku }).lean();

    if (!rawProduct) {
      logger.warn(`Product does not exist in Lightspeed. SKU: ${sku}`);
      return;
    }

    const title = await page.$eval('.product-header h1', (title) => {
      const text = title.textContent?.trim();
      return text?.replace(/\s+/g, ' ').trim(); // Replace multiple whitespaces with a single space
    });

    const description = await page.$eval('#Description-tab', (description) => {
      description.removeAttribute('class');
      description.removeAttribute('id');
      const text = description.textContent?.trim().replace(/\n/g, '\\n');
      const html = description.outerHTML;

      return { text, html };
    });

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
      '.row .col-12.col-lg-6.pt-2 [data-type="image"][data-src]',
      (elements, sku) =>
        elements.map((el, index) => {
          return {
            imageName: `${sku
              ?.replace('/', '-')
              .replace('/', '-')}-${index}.jpg`,
            isFeatured: index === 0,
            url: el.getAttribute('data-src'),
          };
        }),
      sku
    );

    const images: string[] = [];
    let featuredImage = '';

    for (const data of imageData as ProductImage[]) {
      const { url, imageName, isFeatured } = data;

      await saveImage(url, imageName, './output/lm/images');

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
        supplier: SupplierEnum.LM,
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
        supplier: SupplierEnum.LM,
        missingDescription,
      });

      await product.save();
      logger.success(`New Product: ${sku} | ${title}`);
    }
  } catch (error) {
    logger.error(`Unable to process product: ${productUrl}`);
    console.log(error);
  }
}

function getNextSkipCount(
  skipCount: number,
  totalCount: number
): number | null {
  const nextPage = skipCount + 32;

  return nextPage < totalCount ? nextPage : null;
}

async function saveRawProducts() {
  await MRawProduct.deleteMany();

  const PAGE_SIZE = 100;

  const rawData = await parseCsv('./input/products.csv');
  const rawProducts = rawData
    .map((row) => ({
      sku: row[4],
      systemId: row[0],
      title: row[5],
      customSku: row[3],
    }))
    .slice(1);

  let totalCount = rawProducts.length;
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const x = (page - 1) * PAGE_SIZE;
    const y = page * PAGE_SIZE - 1;

    const products = rawProducts.slice(x, y);

    try {
      await MRawProduct.insertMany(products);

      if (totalCount > y + 1) {
        page++;
      } else {
        hasMore = false;
      }
    } catch (error) {
      logger.error('ERROR SAVING RAW PRODUCTS');
      throw new Error('Error');
    }
  }
}
