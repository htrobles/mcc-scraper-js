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
import waitForDuration from '../utils/waitForDuration';

export default async function processDaddario() {
  const rawData = await parseCsv('./input/daddario.csv');
  const rawProducts = rawData
    .map((row) => ({ sku: row[4], systemId: row[0] }))
    .slice(1);

  const browser = await puppeteer.launch({
    headless: config.HEADLESS,
    protocolTimeout: 60000,
    waitForInitialPage: true,
  });

  const page = await browser.newPage();

  await page.goto(config.DADDARIO_LOGIN_URL, { waitUntil: 'networkidle2' });

  await page.type('#uname', config.DADDARIO_USERNAME);
  await page.type('#pwd', config.DADDARIO_PASSWORD);

  await waitForDuration(1000);

  await page.keyboard.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });

  for (let { sku, systemId } of rawProducts) {
    await processProductUrl(sku, systemId, page);
  }

  await browser.close();

  const products = await getSupplierProductsOutput(SupplierEnum.DADDARIO);

  logger.success("Finished processing D'Addario website");

  await generateCsv(
    products,
    'daddario-scraper-output.csv',
    './output/daddario'
  );
}

export async function processProductUrl(
  sku: string,
  systemId: string,
  page: Page
) {
  const productUrl = `${config.DADDARIO_PRODUCT_URL}/${sku}`;

  try {
    const existingProduct = await MProduct.findOne({ sku }).lean();

    if (!config.UPSERT_DATA && existingProduct) {
      logger.warn(`Existing Product: ${sku}`);
      return;
    }

    await page.goto(productUrl, { timeout: 60000, waitUntil: 'networkidle2' });

    let title = await page.$eval('.description', (title) =>
      title.textContent?.trim()
    );

    try {
      const noImage = await page.$eval('.no-image', (img) => !!img);

      if (!noImage) {
        logger.error(`Skipping Product SKU: ${sku} - Product has no images`);
        return;
      }
    } catch (error) {}

    const description = await page.$eval('.details p', (description) => {
      description.removeAttribute('class');
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

    const imageData = await page.$eval(
      '.media',
      (media, sku) => {
        const baseUrl = window.location.origin; // Extract the base URL

        const mainImage = media
          .querySelector('.selected-image img')
          ?.getAttribute('src');

        if (!mainImage) {
          return;
        }

        const images: ProductImage[] = [];
        media
          .querySelectorAll('.thumbnails img')
          .forEach((thumbnail, index) => {
            const src = thumbnail.getAttribute('src');

            if (src) {
              const finalPath = src.split('/')[3];
              const fileName = finalPath.split('?')[0];

              const url = `${baseUrl}/api/images/${fileName}?ProdCode=${sku}&size=lg`;
              images.push({
                imageName: `${sku}-${index}.jpg`,
                isFeatured: index === 0,
                url,
              });
            }
          });

        return images;
      },
      sku
    );

    const images: string[] = [];
    let featuredImage = '';

    for (const data of imageData as ProductImage[]) {
      const { url, imageName, isFeatured } = data;

      await saveImage(url, imageName, './output/daddario/images');

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
        supplier: SupplierEnum.DADDARIO,
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
        supplier: SupplierEnum.DADDARIO,
        missingDescription,
      });

      await product.save();
      logger.success(`New Product: ${sku} | ${title}`);
    }
  } catch (error) {
    logger.error(`${productUrl} | ${error}`);
  }
}
