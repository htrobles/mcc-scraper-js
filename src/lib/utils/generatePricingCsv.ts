import logger from 'node-color-log';
import { createObjectCsvWriter } from 'csv-writer';
import fs from 'fs';

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
