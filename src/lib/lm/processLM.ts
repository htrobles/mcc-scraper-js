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
import { MRawProduct } from '../../models/RawProduct';
import processWithRetry from '../utils/processUrl';
import promptSync from 'prompt-sync';
import {
  MProcess,
  ProcessDocument,
  ProcessStatusEnum,
} from '../../models/Process';
import { autoScroll } from '../utils/autoScroll';
import { stringSimilarity } from 'string-similarity-js';
import { MProductSimilarity } from '../../models/ProductSimilarity';
import initiateProcess from '../utils/initiateProcess';
import { clearRawProducts, saveRawProducts } from '../utils/saveRawProducts';

const prompt = promptSync({ sigint: true });
const parser = NumberParser('en-US', { style: 'decimal' });

const PAGE_SIZE = 32;

const PROCESS_QUERY = {
  status: ProcessStatusEnum.ONGOING,
  supplier: SupplierEnum.LM,
};

const EXCLUDED_DEP_URLS = [
  'https://www.long-mcquade.com/departments/20621/Brass-Accessories/Band---Orchestral.htm',
  'https://www.long-mcquade.com/departments/20391/Brass/Band---Orchestral.htm',
  'https://www.long-mcquade.com/departments/20671/General-Accessories/Band---Orchestral.htm',
  'https://www.long-mcquade.com/departments/1671/Band/Folk_Ethnic_Instruments.htm',
  'https://www.long-mcquade.com/departments/20536/Music-Stands--Lights---Furniture/Band---Orchestral.htm',
  'https://www.long-mcquade.com/departments/20651/Orchestral-Accessories/Band---Orchestral.htm',
  'https://www.long-mcquade.com/departments/20411/Orchestra-Strings/Band---Orchestral.htm',
  'https://www.long-mcquade.com/departments/1644/Drums/Novelty_Instuments.htm',
  'https://www.long-mcquade.com/departments/20356/Tuners---Metronomes/Band---Orchestral.htm',
  'https://www.long-mcquade.com/departments/20626/Woodwind-Accessories/Band---Orchestral.htm',
  'https://www.long-mcquade.com/departments/20406/Woodwinds/Band---Orchestral.htm',
  'https://www.long-mcquade.com/departments/66/Print-Music/Bass_Guitar.htm',
  'https://www.long-mcquade.com/departments/882/Print-Music/Brass_Instrument.htm',
  'https://www.long-mcquade.com/departments/884/Print-Music/Choral.htm',
  'https://www.long-mcquade.com/departments/887/Print-Music/Classroom.htm',
  'https://www.long-mcquade.com/departments/889/Print-Music/Concert_Band.htm',
  'https://www.long-mcquade.com/departments/19836/Print-Music/Folk_Instruments.htm',
  'https://www.long-mcquade.com/departments/65/Print-Music/Guitar.htm',
  'https://www.long-mcquade.com/departments/902/Print-Music/Jazz_Band.htm',
  'https://www.long-mcquade.com/departments/19831/Print-Music/Orchestra.htm',
  'https://www.long-mcquade.com/departments/914/Print-Music/Orchestral_Strings.htm',
  'https://www.long-mcquade.com/departments/918/Print-Music/Percussion.htm',
  'https://www.long-mcquade.com/departments/67/Print-Music/Piano.htm',
  'https://www.long-mcquade.com/departments/925/Print-Music/Theory.htm',
  'https://www.long-mcquade.com/departments/19826/Print-Music/Voice.htm',
  'https://www.long-mcquade.com/departments/930/Print-Music/Woodwind.htm',
  'https://www.long-mcquade.com/departments/1673/Drums/Clothing_Hats_Misc.htm',
  'https://www.long-mcquade.com/departments/257/Guitars/Accessories/Clothing_And_Accessories.htm',
  'https://www.long-mcquade.com/departments/19941/Clothing---Merch/L-M-Gear.htm',
  'https://www.long-mcquade.com/departments/19676/Print-Music/Novelties---Giftware.htm',
  'https://www.long-mcquade.com/departments/19936/Clothing---Merch/Recording-Brands.htm',
];

export default async function processLM() {
  await initiateProcess(SupplierEnum.BURGERLIGHTING);

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
    (links, excludedHrefs) =>
      links
        .filter(
          (link) =>
            link.href.includes('/departments/') &&
            !excludedHrefs.includes(link.href)
        )
        .map((link) => link.href),
    EXCLUDED_DEP_URLS
  );

  const process = (await MProcess.findOne(
    PROCESS_QUERY
  ).lean()) as ProcessDocument;

  if (!process) {
    throw new Error('Process not found');
  }

  if (process.lastDepUrl) {
    const index = depUrls.findIndex((url) => url === process.lastDepUrl);

    depUrls = depUrls.slice(index);

    logger.warn('PROCESS LAST DEP URL FOUND');
    console.log(`INDEX: ${index} | URL: ${process.lastDepUrl}`);
  }

  for (let depUrl of depUrls) {
    await processWithRetry(() => processDepUrl(depUrl, page));
  }

  await browser.close();

  const productSimilarities = await MProductSimilarity.find({
    supplier: SupplierEnum.LM,
  });

  await generateSimilarityReport(
    productSimilarities,
    'lm-product-similarity-report',
    './output/lm'
  );

  const products = await getSupplierProductsOutput(SupplierEnum.LM);

  logger.success('Finished processing L.M. website');

  await generateCsv(products, 'lm-scraper-output.csv', './output/lm');

  await MProcess.findByIdAndUpdate(process._id, {
    status: ProcessStatusEnum.DONE,
  });

  await clearRawProducts();
}

async function processDepUrl(depUrl: string, page: Page) {
  const process = await MProcess.findOneAndUpdate(PROCESS_QUERY, {
    lastDepUrl: depUrl,
  }).lean();

  await page.goto(depUrl, { waitUntil: 'networkidle2' });

  let totalCountStr: string = await page.$eval(
    '#top-pagination',
    (paginationRow) =>
      paginationRow.textContent?.split('of')[1].trim() as string
  );

  const totalCount = parser(totalCountStr as string);

  let currentPage = 1;

  if (process?.lastDepUrl === depUrl) {
    currentPage = process.productListPage || 1;

    logger.info(`CONTINUING DEPARTMENT URL FROM PREVIOUS PROCESS: ${depUrl}`);
  } else {
    currentPage = 1;
    logger.info(`PROCESSING NEW DEPARTMENT URL: ${depUrl}`);
  }

  let hasMore = true;

  while (hasMore) {
    await MProcess.findOneAndUpdate(PROCESS_QUERY, {
      productListPage: currentPage,
    });

    const skipCount = (currentPage - 1) * PAGE_SIZE;
    const nextPage = skipCount + 32;

    const nextUrl =
      depUrl + `?LocationsID=57&Current=${skipCount}&#top-pagination`;

    logger.info(
      `Processing Department URL Page Number ${currentPage} | ${nextUrl}`
    );

    if (nextPage > totalCount) {
      hasMore = false;
    } else {
      currentPage++;
    }

    await processWithRetry(async () => {
      await page.goto(nextUrl, { waitUntil: 'networkidle2' });

      await autoScroll(page);

      let products = await page.$$eval('.products-item', (items) =>
        items.reduce((prev, item) => {
          const imgSrc = item
            .querySelector('img.img-fluid.maxh.w-auto.item-img')
            ?.getAttribute('src');

          const sku = item
            .querySelector(
              '.products-item-descr .maxh-90.mt-1 p.mb-0.text-dark.fs-7'
            )
            ?.textContent?.split(':')[1]
            .trim();

          if (imgSrc?.endsWith('noimage.jpg')) {
            logger.warn(`Ignoring product with no image | SKU: ${sku}`);
            return prev;
          }

          const url = item
            .querySelector('a.products-item-link')
            ?.getAttribute('href');

          let title = item.querySelector(
            '.fs-6.fw-bolder.text-grey.maxh-65.m-0'
          )?.textContent;

          if (!title) {
            title = item.querySelector(
              '.fs-6.fw-bolder.text-grey.mb-0.maxh-60'
            )?.textContent;
          }

          return [
            ...prev,
            { url: url as string, sku: sku as string, title: title as string },
          ];
        }, [] as { sku: string; url: string; title: string }[])
      );

      const process = await MProcess.findOne(PROCESS_QUERY).lean();

      if (process?.lastProductUrl) {
        const index = products.findIndex(
          ({ url }) => url === process.lastProductUrl
        );

        if (index >= 0) {
          products = products.slice(index);

          logger.warn('PROCESS LAST PRODUCT URL FOUND');
          console.log(process?.lastProductUrl);
          console.log(`INDEX: ${index}`);
        }
      }

      const productSkus = products.map(({ sku }) => sku);

      const lightspeedProducts = await MRawProduct.find({
        $or: [
          { sku: { $in: productSkus } },
          { customSku: { $in: productSkus } },
        ],
      }).lean();

      let productUrls: string[] = [];

      for (const { sku, url } of products) {
        const exisitngProduct = lightspeedProducts.find(
          ({ sku: lsSku, customSku }) => {
            const isSameSku = lsSku === sku || customSku === sku;
            return isSameSku;
          }
        );

        if (!exisitngProduct) {
          continue;
        }

        productUrls.push(url as string);
      }

      for (let productUrl of productUrls) {
        await processWithRetry(() => processProductUrl(productUrl, page));
      }
    });
  }
}

export async function processProductUrl(productUrl: string, page: Page) {
  try {
    await MProcess.findOneAndUpdate(PROCESS_QUERY, {
      lastProductUrl: productUrl,
    });

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

    const { title: lsTitle } = rawProduct;

    const title = await page.$eval('.product-header h1', (title) => {
      const text = title.textContent?.trim();
      return text?.replace(/\s+/g, ' ').trim(); // Replace multiple whitespaces with a single space
    });

    const similarity = stringSimilarity(lsTitle as string, title as string);

    const isSimilar = similarity > 0.3;

    await new MProductSimilarity({
      sku,
      lsTitle,
      storeTitle: title,
      similarity,
      supplier: SupplierEnum.LM,
    }).save();

    if (!isSimilar) {
      logger.error(
        `SIMILARITY FAILED SKIPPING PRODUCT: ${similarity} | SKU: ${sku}`
      );
      logger.log(`LS TITLE: ${lsTitle} | WEB TITLE: ${title}`);

      return;
    }

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
