import logger from 'node-color-log';
import { createObjectCsvWriter } from 'csv-writer';

export default async function generateCsv(
  products: { [key: string]: any }[],
  filename: string,
  outDir: string
) {
  const headers = [
    { id: 'sku', title: 'Manufacturer SKU' },
    { id: 'title', title: 'Title' },
    { id: 'descriptionText', title: 'Description Text' },
    { id: 'descriptionHtml', title: 'Body HTML' },
    { id: 'featuredImage', title: 'Featured Image' },
    { id: 'image0', title: 'Image' },
    { id: 'image1', title: 'Image' },
    { id: 'image2', title: 'Image' },
    { id: 'image3', title: 'Image' },
    { id: 'image4', title: 'Image' },
    { id: 'image5', title: 'Image' },
    { id: 'image6', title: 'Image' },
    { id: 'image7', title: 'Image' },
    { id: 'image8', title: 'Image' },
    { id: 'image9', title: 'Image' },
    { id: 'image10', title: 'Image' },
    { id: 'image11', title: 'Image' },
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

  const rows = [];

  csvWriter
    .writeRecords(products)
    .then(() => logger.success('CSV file created successfully'))
    .catch((err) => logger.error(err));
}
