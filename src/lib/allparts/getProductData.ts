import puppeteer from 'puppeteer';
import { Product } from '../../types/Product';

export default async function getProductData(
  productUrl: string,
  lastSku?: string
): Promise<Product | undefined> {
  console.log('URL');
  console.log(productUrl);
  const browser = await puppeteer.launch();
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

  if (lastSku === sku) return;

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

  console.log(`===SKU: ${sku} ===`);
  console.log(`URL: ${productUrl}`);
  console.log(`Title: ${title}`);
  console.log(`Description: ${description}`);
  console.log(`ImageUrls: ${imageUrls.join(', ')}`);
  console.log(`Images: ${JSON.stringify(images)}`);
  console.log(`Featured Image: ${featuredImage}`);
  console.log('==================');

  if (!sku || !title || !description) return;

  await browser.close();

  return {
    sku,
    url: productUrl,
    title,
    description,
    images,
    imageUrls,
    featuredImage,
  };
}
