import logger from 'node-color-log';
import { createObjectCsvWriter } from 'csv-writer';
import { Product } from '../../models/Product';

export default async function generateCsv(
  products: Product[],
  filename: string,
  outDir: string
) {
  const headers = [
    { id: 'sku', title: 'Manufacturer SKU' },
    { id: 'title', title: 'Title' },
    { id: 'descriptionText', title: 'Description Text' },
    { id: 'descriptionHtml', title: 'Description HTML' },
    { id: 'images', title: 'Images' },
    { id: 'imageUrls', title: 'Image URLS' },
    { id: 'featuredImage', title: 'Featured Image' },
    { id: 'url', title: 'URL' },
    { id: 'supplier', title: 'Supplier' },
  ];

  let finalFilename = filename;

  if (!filename.endsWith('.csv')) {
    finalFilename = `${filename}.csv`;
  }

  const pathname = `${outDir}/${finalFilename}`;

  const csvWriter = createObjectCsvWriter({
    path: pathname,
    header: headers,
  });

  csvWriter
    .writeRecords(products)
    .then(() => logger.success('CSV file created successfully'))
    .catch((err) => logger.error(err));
}
