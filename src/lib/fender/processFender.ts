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
import { saveRawProducts } from '../utils/saveRawProducts';
import { MRawProduct, RawProduct } from '../../models/RawProduct';
import initiateProcess from '../utils/initiateProcess';
import getBrowser from '../utils/getBrowser';
import checkSimilarity from '../utils/checkSimilarity';
import { MProductSimilarity } from '../../models/ProductSimilarity';
import { MProcess, ProcessStatusEnum } from '../../models/Process';
import cleanUp from '../utils/cleanUp';

export default async function processFender() {
  const process = await initiateProcess(SupplierEnum.FENDER);
  saveRawProducts('products-fender.csv');

  const { browser, page } = await getBrowser();

  await page.goto(config.FENDER_LOGIN_URL, { waitUntil: 'networkidle2' });

  await page.type('#emailInput', config.FENDER_USERNAME);
  await page.type('#passwordInput', config.FENDER_PASSWORD);
  await page.click('#stayLoggedCheckbox');

  await Promise.all([
    await page.click('#submitLoginButton'),
    page.waitForNavigation({ waitUntil: 'networkidle2' }),
  ]);

  let rawProducts = await MRawProduct.find().lean();

  for (const rawProduct of rawProducts) {
    await processProductUrl(rawProduct as RawProduct, page);
  }

  await browser.close();

  await generateSimilarityReport(
    SupplierEnum.REDONE,
    'redOne-product-similarity-report',
    './output/redOne'
  );

  const products = await getSupplierProductsOutput(SupplierEnum.FENDER);

  await generateCsv(products, 'fender-scraper-output.csv', './output/fender');
  await generateShopifyCsv(
    products,
    `fender-scraper-output-shopify.csv`,
    `./output/fender`
  );

  await cleanUp(process._id, SupplierEnum.FENDER);

  logger.success('Finished processing Fender website');
}

export async function processProductUrl(rawProduct: RawProduct, page: Page) {
  const { systemId, sku, title: lsTitle } = rawProduct;

  let urlSku = sku as string;
  if (urlSku.length < 10) {
    urlSku = '0' + sku;
  }

  const productUrl = `${config.FENDER_PRODUCT_URL}/${urlSku}`;

  try {
    await page.goto(productUrl, { timeout: 60000, waitUntil: 'networkidle2' });

    let title = await page.$eval(
      '[data-cy="product-display-name"]',
      (title) => title.textContent?.trim() as string
    );

    const { isSimilar, similarity } = await checkSimilarity({
      lsTitle: lsTitle as string,
      title,
      supplier: SupplierEnum.REDONE,
      sku: sku as string,
    });

    if (!isSimilar) {
      if (!isSimilar) {
        logger.error(
          `SIMILARITY FAILED SKIPPING PRODUCT: ${similarity} | SKU: ${sku}`
        );
        logger.log(`LS TITLE: ${lsTitle} | WEB TITLE: ${title}`);

        return;
      }
    }

    const existingProduct = await MProduct.findOne({ sku }).lean();

    if (!config.UPSERT_DATA && existingProduct) {
      logger.warn(`Existing Product: ${sku}`);
      return;
    }

    const mainImgSrc = await page.$eval('img.main-image', (img) => img.src);

    if (mainImgSrc.endsWith('fender-no-image-logo.svg')) {
      logger.error(`Skipping Product SKU: ${sku} - Product has no images`);
      return;
    }

    const description = await page.$eval(
      '.col-lg-7.col-md-7.col-sm-7',
      (description) => {
        description.removeAttribute('class');
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
      '.detail-carousel-prod-details .detail-image-prod-details img',
      (thumbnails, sku) =>
        thumbnails.map((thumbnail, index) => {
          const imgUrl = thumbnail.src.replace('Thumbnail', 'Zoom');

          const lastDotIndex = imgUrl.lastIndexOf('.');
          let extension = imgUrl.substring(lastDotIndex + 1).split('?')[0];

          if (!['jpg', 'png'].includes(extension)) {
            extension = 'png';
          }

          const imageName = `${sku}-${index}.jpg`.toLowerCase();

          return {
            url: imgUrl as string,
            imageName,
            isFeatured: index === 0,
          };
        }),
      sku
    );

    const images: string[] = [];
    let featuredImage = '';

    for (const data of imageData) {
      const { url, imageName, isFeatured } = data;

      await saveImage(url, imageName, './output/fender/images');

      if (isFeatured) {
        featuredImage = imageName;
      } else {
        images.push(imageName);
      }
    }

    if (!title || !description || !featuredImage) {
      return;
    }

    const minifiedHtmlDesc = minify(description.html, {
      removeTagWhitespace: true,
      collapseWhitespace: true,
      collapseInlineTagWhitespace: true,
    });

    if (config.UPSERT_DATA && !!existingProduct) {
      await MProduct.findByIdAndUpdate(existingProduct._id, {
        systemId,
        sku,
        title,
        descriptionText: description.text,
        descriptionHtml: minifiedHtmlDesc,
        images,
        featuredImage,
        supplier: SupplierEnum.FENDER,
        missingDescription,
      });

      logger.success(`Updated Product: ${sku} | ${title}`);
    } else {
      const product = new MProduct({
        systemId,
        sku,
        title,
        descriptionText: description.text,
        descriptionHtml: minifiedHtmlDesc,
        images,
        featuredImage,
        supplier: SupplierEnum.FENDER,
        missingDescription,
      });

      await product.save();
      logger.success(`New Product: ${sku} | ${title}`);
    }
  } catch (error) {
    logger.error(`${productUrl} | ${error}`);
  }
}
