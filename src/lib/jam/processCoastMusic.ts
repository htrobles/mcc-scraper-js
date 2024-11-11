import puppeteer, { Page } from 'puppeteer';
import { MProduct, Product, SupplierEnum } from '../../models/Product';
import logger from 'node-color-log';
import saveImage from '../utils/saveImage';
import config from '../../config';

interface SelectData {
  id: string;
  values: string[];
}

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
        logger.error(error);
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
}

export async function processProductUrl(productUrl: string) {
  const browser = await puppeteer.launch({
    headless: config.HEADLESS,
  });
  console.log(productUrl);

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

  const description = await page.$eval('.descriptionDetail', (description) => {
    const text = description.textContent?.trim().replace(/\n/g, '\\n');
    const children = description.children;
    let html: string;

    if (!children.length) {
      html = `<p>${description.textContent?.trim()}</p>`;
    } else {
      const childrenHtml = [];

      for (const child of children) {
        childrenHtml.push(child.outerHTML);
      }

      html = childrenHtml.join();
    }

    return { text, html };
  });

  console.log({ sku, title, description });

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

  const product = new MProduct({
    sku,
    title,
    descriptionText: description.text,
    descriptionHtml: description.html,
    images,
    featuredImage,
    supplier: SupplierEnum.COASTMUSIC,
  });

  await product.save();

  logger.success(`New Product: ${sku} | ${title}`);

  await browser.close();
}
