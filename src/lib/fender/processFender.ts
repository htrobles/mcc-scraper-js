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

export default async function processFender() {
  const rawData = await parseCsv('./input/fender.csv');
  const rawProducts = rawData
    .map((row) => ({ sku: row[4], systemId: row[0] }))
    .slice(1);

  const browser = await puppeteer.launch({
    headless: config.HEADLESS,
    protocolTimeout: 60000,
    waitForInitialPage: true,
  });

  const page = await browser.newPage();

  await page.goto(config.FENDER_LOGIN_URL, { waitUntil: 'networkidle2' });

  await page.type('#emailInput', config.FENDER_USERNAME);
  await page.type('#passwordInput', config.FENDER_PASSWORD);
  await page.click('#stayLoggedCheckbox');

  await Promise.all([
    await page.click('#submitLoginButton'),
    page.waitForNavigation({ waitUntil: 'networkidle2' }),
  ]);

  for (let { sku, systemId } of rawProducts) {
    await processProductUrl(sku, systemId, page);
  }

  await browser.close();

  const products = await getSupplierProductsOutput(SupplierEnum.FENDER);

  logger.success('Finished processing Fender website');

  await generateCsv(products, 'fender-scraper-output.csv', './output/fender');
}

export async function processProductUrl(
  sku: string,
  systemId: string,
  page: Page
) {
  const productUrl = `${config.FENDER_PRODUCT_URL}/${sku}`;

  try {
    const existingProduct = await MProduct.findOne({ sku }).lean();

    if (!config.UPSERT_DATA && existingProduct) {
      logger.warn(`Existing Product: ${sku}`);
      return;
    }

    await page.goto(productUrl, { timeout: 60000, waitUntil: 'networkidle2' });

    let title = await page.$eval('[data-cy="product-display-name"]', (title) =>
      title.textContent?.trim()
    );

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
