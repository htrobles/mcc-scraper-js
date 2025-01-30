import { minify } from 'html-minifier';
import parseHtml from './parseHtml';
import { RawProduct } from '../../models/RawProduct';
import config from '../../config';
import logger from 'node-color-log';
import { ProductImage } from '../../models/ProductTypes';
import saveImage from './saveImage';
import { MProduct, SupplierEnum } from '../../models/Product';
import { Page } from 'puppeteer';

export type DescriptionData = {
  text: string;
  html: string;
};

type ProcessProductInput = {
  description: DescriptionData;
  title: string;
  imageData: ProductImage[];
  rawProduct: RawProduct;
  supplier: SupplierEnum;
};

export async function saveProduct({
  description,
  title,
  imageData,
  rawProduct,
  supplier,
}: ProcessProductInput) {
  const { sku: rawSku } = rawProduct;
  const supplierKey = supplier.toLowerCase();

  const existingProduct = await MProduct.findOne({ sku: rawSku }).lean();

  description.html = minify(parseHtml(description.html), {
    removeTagWhitespace: true,
    collapseWhitespace: true,
    collapseInlineTagWhitespace: true,
  });

  let missingDescription = !description.text;

  if (!description.text) {
    if (config.REPLACE_EMPTY_DESC_WITH_TITLE) {
      description.text = title;
      description.html = `<p>${title}</p>`;
    } else {
      logger.warn(`No description found: ${rawSku}`);
      return;
    }
  }

  const images: string[] = [];
  let featuredImage = '';

  for (const data of imageData as ProductImage[]) {
    const { url, imageName, isFeatured } = data;

    await saveImage(url, imageName, `./output/${supplierKey}/images`);

    if (isFeatured) {
      featuredImage = imageName;
    } else {
      images.push(imageName);
    }
  }

  if (config.UPSERT_DATA && !!existingProduct) {
    await MProduct.findByIdAndUpdate(existingProduct._id, {
      systemId: rawProduct.systemId,
      sku: rawSku,
      title,
      descriptionText: description.text,
      descriptionHtml: description.html,
      images,
      featuredImage,
      supplier,
      missingDescription,
    });

    logger.success(`Updated Product: ${rawSku} | ${title}`);
  } else {
    const product = new MProduct({
      systemId: rawProduct.systemId,
      sku: rawSku,
      title,
      descriptionText: description.text,
      descriptionHtml: description.html,
      images,
      featuredImage,
      supplier,
      missingDescription,
    });

    await product.save();
    logger.success(`New Product: ${rawSku} | ${title}`);
  }
}

export async function getTitle(selector: string, page: Page): Promise<string> {
  return await page.$eval(selector, (title) =>
    (title as HTMLElement).innerText?.trim()
  );
}

export async function getDescriptionData(
  selector: string,
  page: Page
): Promise<DescriptionData> {
  return await page.$eval(selector, (description) => {
    description.removeAttribute('class');
    description.removeAttribute('id');
    const text = description.textContent?.trim().replace(/\n/g, '\\n') || '';

    return { text, html: description.outerHTML };
  });
}

export async function getImageData(
  selector: string,
  sku: string,
  page: Page,
  urlProp: 'href' | 'src' = 'src'
) {
  return await page.$$eval(
    selector,
    (elements, sku, urlProp) =>
      elements.map((el, index) => {
        let url: string;

        if (urlProp === 'href') {
          url = (el as HTMLAnchorElement)[urlProp];
        } else {
          url = (el as HTMLImageElement)[urlProp];
        }

        return {
          imageName: `${sku?.replace('/', '-').replace('/', '-')}-${index}.jpg`,
          isFeatured: index === 0,
          url,
        };
      }),
    sku,
    urlProp
  );
}

export async function getUPC(selector: string, page: Page): Promise<string> {
  return await page.$eval(selector, (title) =>
    (title as HTMLElement).innerText?.trim()
  );
}
