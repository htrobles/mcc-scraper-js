import puppeteer, { Page } from 'puppeteer';
import { MProduct, Product, SupplierEnum } from '../../models/Product';
import logger from 'node-color-log';
import saveImage from '../utils/saveImage';
import config from '../../config';

interface SelectData {
  id: string;
  values: string[];
}

export default async function processAllpartsProducts(categoryUrl: string) {
  let nextUrl: string | null = categoryUrl;
  const browser = await puppeteer.launch({
    headless: config.HEADLESS,
  });
  const page = await browser.newPage();

  while (nextUrl) {
    await page.goto(nextUrl);

    const productUrls = await page.$$eval(
      '#product-grid .grid__item h3 a',
      (product) => product.map((a) => a.href)
    );

    const pageNum = nextUrl.split('=')[1] ? parseInt(nextUrl.split('=')[1]) : 1;
    logger.info(`Processing Page Number: ${pageNum}`);

    for (const productUrl of productUrls) {
      try {
        await processProductUrl(productUrl);
      } catch (error) {
        logger.error(error);
      }
    }

    nextUrl = await getNextCategoryUrl(page);
  }

  await browser.close();
}

export async function processProductUrl(productUrl: string) {
  const browser = await puppeteer.launch({
    headless: config.HEADLESS,
  });
  const page = await browser.newPage();

  await page.goto(productUrl);

  const selectData: SelectData[] = await page.$$eval(
    'variant-selects select',
    (selects) =>
      selects.map((select) => {
        const id = select.id;
        const options = Array.from(select.options);
        const values = options.map((option) => option.value);

        return { id, values };
      })
  );

  if (!selectData.length) {
    await processProduct(page);
    logger.info('Product Variants found');
  } else {
    await processVariantSelects(page, selectData);
  }

  await browser.close();
}

async function processVariantSelects(
  page: Page,
  selectData: SelectData[],
  index: number = 0,
  variantTree: string[] = []
) {
  const data = selectData[index];
  const { id, values } = data;

  for (const value of values) {
    await page.select(`#${id}`, value);

    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 1 second

    if (selectData[index + 1]) {
      const newSelectData: SelectData[] = await page.$$eval(
        'variant-selects select',
        (selects) =>
          selects.map((select) => {
            const id = select.id;
            const options = Array.from(select.options);
            const values = options.map((option) => option.value);

            return { id, values };
          })
      );

      await processVariantSelects(page, newSelectData, index + 1, [
        ...variantTree,
        value,
      ]);
    } else {
      await processProduct(page, [...variantTree, value]);
    }
  }
}

async function processProduct(
  page: Page,
  variantTree?: string[]
): Promise<Product | Pick<Product, 'sku'> | undefined> {
  const productUrl = page.url();

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

  let title = await page.$eval(
    '.product__title h1',
    (title) => title.textContent
  );

  if (variantTree?.length) {
    title = [title, ...variantTree].join('-');
  }

  if (existingProduct) {
    logger.warn(`Existing Product: ${sku}. Skipped | ${title}`);
    return { sku };
  }

  const description = await page.$eval(
    'truncate-text.product__description .truncate-text__content',
    (description) => {
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
    }
  );

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

  for (const data of imageData) {
    const { url, imageName, isFeatured } = data;

    await saveImage(url, imageName, './output/allparts/images');

    images.push(imageName), imageUrls.push(url);
    if (isFeatured) {
      featuredImage = imageName;
    }
  }

  if (
    !sku ||
    !title ||
    !description ||
    !images ||
    !imageUrls ||
    !featuredImage
  ) {
    return;
  }

  const product = new MProduct({
    sku,
    url: productUrl,
    title,
    descriptionText: description.text,
    descriptionHtml: description.html,
    images,
    imageUrls,
    featuredImage,
    supplier: SupplierEnum.ALLPARTS,
  });

  await product.save();

  logger.success(`New Product: ${sku} | ${title}`);

  return product;
}

async function getNextCategoryUrl(page: Page) {
  try {
    const nextUrl = await page.$eval(
      'a.pagination__item--prev',
      (nextLink) => nextLink.href
    );

    return nextUrl;
  } catch (error) {
    logger.info('NEXT LINK NOT FOUND');
    return null;
  }
}
