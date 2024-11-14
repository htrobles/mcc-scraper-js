import puppeteer, { Page } from 'puppeteer';
import parseCsv from '../utils/parseCsv';
import config from '../../config';
import logger from 'node-color-log';
import { MProduct, SupplierEnum } from '../../models/Product';
import saveImage from '../utils/saveImage';
import { minify } from 'html-minifier';
import getSupplierProductsOutput from '../utils/getSupplierProductsOutput';
import generateCsv from '../utils/generateCsv';

export default async function processCoastMusic() {
  const rawData = await parseCsv('./input/coastMusic.csv');
  const skus = rawData.map((row) => row[4]).slice(1);

  const browser = await puppeteer.launch({
    headless: config.HEADLESS,
    protocolTimeout: 60000,
    waitForInitialPage: true,
  });

  const page = await browser.newPage();

  for (let sku of skus) {
    await processProductUrl(sku, page);
  }

  await browser.close();

  const products = await getSupplierProductsOutput(SupplierEnum.COASTMUSIC);

  logger.success('Finished processing Coast Music website');
  await generateCsv(products, 'coastMusic.csv', './output/coastMusic');
}

export async function processProductUrl(productSku: string, page: Page) {
  const productUrl = `${config.COAST_MUSIC_URL}=${productSku}`;

  const existingProduct = await MProduct.findOne({ sku: productSku });

  if (existingProduct) {
    logger.warn(`Existing Product: ${productSku}`);
    return;
  }

  await page.goto(productUrl, { timeout: 60000, waitUntil: 'networkidle2' });

  try {
    const sku = await page.$eval('.catalogTileID', (catalogId) => {
      const sku = catalogId.textContent?.split(':')[1].trim();

      return sku;
    });

    if (!sku) {
      logger.error(`SKU not found. URL: ${productUrl}`);
      return;
    }

    let title = await page.$eval('#itemTitle strong', (title) =>
      title.textContent?.trim()
    );

    const description = await page.$eval(
      '.descriptionDetail .floatLeft',
      (description) => {
        description.removeAttribute('class');
        const text = description.textContent?.trim().replace(/\n/g, '\\n');
        const html = description.outerHTML;

        return { text, html };
      }
    );

    if (!description.text) {
      description.text = title;
    }

    if (!description.html) {
      description.html = `<p>${title}</p>`;
    }

    const imageData = await page.$$eval(
      '#gallery .thumbnailLink',
      (thumbnails, sku) =>
        thumbnails.map((thumbnail, index) => {
          const imgUrl = thumbnail
            .getAttribute('data-image')
            ?.replace('~lg', '~hqw') as string;

          const lastDotIndex = imgUrl.lastIndexOf('.');
          let extension = imgUrl.substring(lastDotIndex + 1).split('?')[0];

          if (!['jpg', 'png'].includes(extension)) {
            extension = 'png';
          }

          const imageName = `${sku}-${index}.${extension}`.toLowerCase();

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

      await saveImage(url, imageName, './output/coastMusic/images');

      if (isFeatured) {
        featuredImage = imageName;
      } else {
        images.push(imageName);
      }
    }

    if (!sku || !title || !description || !featuredImage) {
      return;
    }

    const minifiedHtmlDesc = minify(description.html, {
      removeTagWhitespace: true,
      collapseWhitespace: true,
      collapseInlineTagWhitespace: true,
    });

    const product = new MProduct({
      sku,
      title,
      descriptionText: description.text,
      descriptionHtml: minifiedHtmlDesc,
      images,
      featuredImage,
      supplier: SupplierEnum.COASTMUSIC,
    });

    await product.save();

    logger.success(`New Product: ${sku} | ${title}`);
  } catch (error) {
    logger.error(`${productUrl} | ${error}`);
  }
}
