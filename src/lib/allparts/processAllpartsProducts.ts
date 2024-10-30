import puppeteer from 'puppeteer';
import { MProduct, Product } from '../../models/Product';
import * as dotenv from 'dotenv';
import logger from 'node-color-log';

dotenv.config();

export default async function processAllpartsProducts(brandUrl: string) {
  let nextUrl: string | null = brandUrl;

  while (nextUrl) {
    const browser = await puppeteer.launch({
      headless: Boolean(process.env.HEADLESS),
    });
    const page = await browser.newPage();

    await page.goto(nextUrl);

    const productUrls = await page.$$eval(
      '#product-grid .grid__item a',
      (product) => product.map((a) => a.href)
    );

    await browser.close();

    let lastSku: string | undefined = undefined;

    for (const productUrl of productUrls) {
      try {
        const product = await processProduct(productUrl, lastSku);

        lastSku = product?.sku;
      } catch (error) {
        logger.error(error);
      }
    }

    try {
      const nextLink = await page.$eval(
        'a.pagination__item--prev',
        (nextLink) => nextLink.href
      );

      nextUrl = nextLink;
    } catch (error) {
      nextUrl = null;
    }
  }
}

async function processProduct(
  productUrl: string,
  lastSku?: string
): Promise<Product | Pick<Product, 'sku'> | undefined> {
  const browser = await puppeteer.launch({
    headless: Boolean(process.env.HEADLESS),
  });
  const page = await browser.newPage();

  await page.goto(productUrl);

  const sku = await page.$$eval(
    '.product__info-box .information',
    (details) => {
      if (details.length === 1)
        return details[0].querySelector('.information__value')?.textContent;

      return details[1].querySelector('.information__value')?.textContent;
    }
  );

  if (!sku) {
    logger.error(`SKU not found. URL: ${productUrl}`);
    return;
  }

  const existingProduct = await MProduct.findOne({ sku: sku });

  if (lastSku === sku) {
    return { sku };
  }

  if (existingProduct) {
    logger.warn(`Existing Product: ${sku}. Skipped`);
    return { sku };
  }

  const title = await page.$eval(
    '.product__title h1',
    (title) => title.textContent
  );

  const description = (
    await page.$eval(
      'truncate-text.product__description',
      (description) => description.textContent
    )
  )?.trim();

  const imageData = await page.$$eval(
    '.product__media-list .product__media-item',
    (imgContainers, sku) =>
      imgContainers.map((imgContainer, index) => {
        const images: string[] = [];
        const imgUrl = imgContainer.querySelector('img')?.src as string;

        const lastDotIndex = imgUrl.lastIndexOf('.');
        const extension = imgUrl.substring(lastDotIndex + 1).split('?')[0];

        const imageName = `${sku}-${index}.${extension}`;

        images.push(imageName);

        return {
          url: imgUrl as string,
          imageName,
          isFeatured: imgContainer.classList.contains('is-active'),
        };
      }),
    sku
  );

  const images: string[] = [];
  const imageUrls: string[] = [];
  let featuredImage = '';

  imageData.forEach(({ url, imageName, isFeatured }) => {
    images.push(imageName), imageUrls.push(url);
    if (isFeatured) {
      featuredImage = imageName;
    }
  });

  if (!sku || !title || !description || !images || !imageUrls || !featuredImage)
    return;

  const product = new MProduct({
    sku,
    url: productUrl,
    title,
    description,
    images,
    imageUrls,
    featuredImage,
  });

  await product.save();

  logger.color('cyan').log(`New Product: ${sku}`);
  console.log(product);

  await browser.close();

  return product;
}
