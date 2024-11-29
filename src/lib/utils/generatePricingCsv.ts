import logger from 'node-color-log';
import { createObjectCsvWriter } from 'csv-writer';
import fs from 'fs';
import parseCsv from './parseCsv';
import { MProductPricing, StoreEnum } from '../../models/ProductPricing';
import NumberParser from 'intl-number-parser';
import { StoreChoice, storeChoices } from '../../constants/prompts';

const parser = NumberParser('en-US', { style: 'currency', currency: 'USD' });

export default async function generatePricingCsv(
  pricings: { [key: string]: any }[],
  filename: string,
  outDir: string
) {
  const headers = [
    { id: 'systemId', title: 'System ID' },
    { id: 'sku', title: 'Variant SKU' },
    { id: 'title', title: 'Title' },
    { id: 'theirPrice', title: 'Their Price' },
    { id: 'ourPrice', title: 'Our Price' },
    { id: 'store', title: 'Store' },
  ];

  let finalFilename = filename;

  if (!filename.endsWith('.csv')) {
    finalFilename = `${filename}.csv`;
  }

  ensureDirectoryExistence(outDir);

  const pathname = `${outDir}/${finalFilename}`;

  const csvWriter = createObjectCsvWriter({
    path: pathname,
    header: headers,
  });

  csvWriter
    .writeRecords(pricings)
    .then(() => logger.success('CSV file created successfully'))
    .catch((err) => logger.error(err));
}

async function ensureDirectoryExistence(directoryPath: string) {
  try {
    if (!fs.existsSync(directoryPath)) {
      await fs.promises.mkdir(directoryPath, { recursive: true });
      logger.info(`Created output directory: ${directoryPath}`);
    }
  } catch (err) {
    logger.error(`Error creating directory: ${err}`);
  }
}

const PRICE_COMPARISON_PAGE_SIZE = 100;

export async function generatePriceComparisonCsv(store: StoreEnum) {
  const { label, fileOutputName } = storeChoices.find(
    (storeChoice) => storeChoice.key === store
  ) as StoreChoice;

  try {
    const rawData = await parseCsv('./input/products.csv');
    const rawProducts: { sku: string; systemId: string; ourPrice: number }[] =
      rawData
        .map((row) => {
          const rawPrice = row[8];

          const ourPrice = parser(rawPrice);

          return { sku: row[4], systemId: row[0], ourPrice };
        })
        .slice(1);
    const rawProductsMap: {
      [key: string]: { systemId: string; sku: string; ourPrice: number };
    } = {};

    rawProducts.forEach((p) => {
      rawProductsMap[p.sku.toLowerCase()] = {
        systemId: p.systemId,
        sku: p.sku,
        ourPrice: p.ourPrice,
      };
    });

    let page = 1;

    const totalCount = await MProductPricing.countDocuments({
      store: store,
    });

    let totalProcessed = 0;

    const pricingsToProcess: { [key: string]: any }[] = [];

    while (totalCount > totalProcessed) {
      let offset = (page - 1) * PRICE_COMPARISON_PAGE_SIZE;

      let pricings = await MProductPricing.find({
        store: store,
      })
        .sort({ sku: 1 })
        .skip(offset)
        .limit(PRICE_COMPARISON_PAGE_SIZE)
        .lean();

      await Promise.all(
        pricings.map(async (pricing) => {
          const existingPricing = rawProductsMap[pricing.sku.toLowerCase()];

          if (!existingPricing) {
            pricingsToProcess.push(pricing);
            return;
          }

          const updatedPricing = await MProductPricing.findOneAndUpdate(
            pricing._id,
            {
              ourPrice: existingPricing.ourPrice,
              systemId: existingPricing.systemId,
            },
            { new: true }
          );

          pricingsToProcess.push(updatedPricing as { [key: string]: any });
        })
      );

      totalProcessed += pricings.length;
      page++;
    }

    logger.success(`Finished processing ${label} website`);

    await generatePricingCsv(
      pricingsToProcess,
      `${fileOutputName}.csv`,
      './output/store-pricings'
    );
  } catch (error) {
    logger.error('Failed to generate Price Comparison');
    console.log(error);
  }
}
