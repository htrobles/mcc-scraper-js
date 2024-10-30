import puppeteer, { Page } from 'puppeteer';
import { Product } from '../../types/Product';
import { Collection, Document, MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';

dotenv.config();

export default async function processAllpartsBrands(brandUrls: string[]) {
  const client = new MongoClient(String(process.env.MONGODB_URI));
  await client.connect();
  const db = client.db('mcc-scraper');
  const collection = db.collection('allparts');

  await Promise.all(
    brandUrls.map(async (brandUrl) => {
      await processAllpartsProducts(brandUrl, collection);
    })
  );
}

async function processAllpartsProducts(
  brandUrl: string,
  dbCollection: Collection<Document>
) {
  const browser = await puppeteer.launch({
    headless: Boolean(process.env.HEADLESS),
  });
  const page = await browser.newPage();

  await page.goto(brandUrl);

  const productUrls = await page.$$eval(
    '#product-grid .grid__item a',
    (product) => product.map((a) => a.href)
  );

  await browser.close();

  let lastSku: string | undefined = undefined;

  for (const productUrl of productUrls) {
    const product = await processProducts(productUrl, dbCollection, lastSku);

    lastSku = product?.sku;
  }
}

async function processProducts(
  productUrl: string,
  dbCollection: Collection<Document>,
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

  if (!sku) return;

  const existingProduct = await dbCollection.findOne({ sku: sku });

  if (existingProduct) {
    console.log(`Existing Product: ${sku}. Skipped`);
    return { sku };
  }

  if (lastSku === sku) return { sku };

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

  console.log(`=== NEXT PRODUCT ===`);
  console.log(`URL: ${productUrl}`);
  console.log(`SKU: ${sku} `);
  console.log(`Title: ${title}`);
  console.log(`Description: ${description}`);
  console.log(`ImageUrls: ${imageUrls.join(', ')}`);
  console.log(`Images: ${JSON.stringify(images)}`);
  console.log(`Featured Image: ${featuredImage}`);
  console.log('==================');

  if (!sku || !title || !description || !images || !imageUrls || !featuredImage)
    return;

  const product = {
    sku,
    url: productUrl,
    title,
    description,
    images,
    imageUrls,
    featuredImage,
  };

  await dbCollection.insertOne(product);

  await browser.close();

  return product;
}
