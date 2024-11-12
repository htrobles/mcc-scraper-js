import puppeteer from 'puppeteer';
import { MProduct, SupplierEnum } from '../../models/Product';
import logger from 'node-color-log';
import saveImage from '../utils/saveImage';
import config from '../../config';
import generateCsv from '../utils/generateCsv';
import getSupplierProductsOutput from '../utils/getSupplierProductsOutput';
import { minify } from 'html-minifier';

export default async function processCoastMusic() {
  let hasNextPage = true;
  const browser = await puppeteer.launch({
    headless: config.HEADLESS,
  });
  const page = await browser.newPage();
  let pageNum = 1;

  while (hasNextPage) {
    const url = `${config.COAST_MUSIC_URL}#${pageNum}`;
    await page.goto(url, {
      waitUntil: ['domcontentloaded', 'load', 'networkidle0', 'networkidle2'],
    });
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const productUrls = await page.$$eval('a.catalogTileLink', (product) =>
      product.map((a) => a.href)
    );

    logger.info(`Processing Page Number: ${pageNum} | ${url}`);

    for (const productUrl of productUrls) {
      try {
        await processProductUrl(productUrl);
      } catch (error) {
        logger.error(`${productUrl}: ${error}`);
      }
    }

    await incrementPage();
  }

  async function incrementPage() {
    try {
      const nextLink = await page.$eval(
        'span.nextPage',
        (nextLink) => !!nextLink
      );

      if (nextLink) {
        pageNum += 1;
      } else {
        hasNextPage = false;
      }
    } catch (error) {
      logger.info('NEXT LINK NOT FOUND');
      hasNextPage = false;
    }
  }

  await browser.close();

  const products = await getSupplierProductsOutput(SupplierEnum.COASTMUSIC);

  logger.success('Finished processing Coast Music website');
  await generateCsv(products, 'coastMusic.csv', './output/coastMusic');
}

export async function processProductUrl(productUrl: string) {
  const browser = await puppeteer.launch({
    headless: config.HEADLESS,
  });

  const page = await browser.newPage();

  await page.goto(productUrl);

  const sku = await page.$eval('.catalogTileID', (catalogId) => {
    const sku = catalogId.textContent?.split(':')[1].trim();

    return sku;
  });

  if (!sku) {
    logger.error(`SKU not found. URL: ${productUrl}`);
    return;
  }

  const existingProduct = await MProduct.findOne({ sku: sku });

  let title = await page.$eval('#itemTitle strong', (title) =>
    title.textContent?.trim()
  );

  if (existingProduct) {
    logger.warn(`Existing Product: ${sku}. Skipped | ${title}`);
    return { sku };
  }

  const description = await page.$eval(
    '.descriptionDetail .floatLeft',
    (description) => {
      const newDescription = document.createElement('div');
      const [_, __, ...nodes] = description.childNodes;

      for (let node of nodes) {
        newDescription.appendChild(node);
      }

      const text = newDescription.textContent?.trim().replace(/\n/g, '\\n');

      return { text, html: newDescription.outerHTML };
    }
  );

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

  if (!sku || !title || !description || !images || !featuredImage) {
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

  await browser.close();
}
