import mongoose from 'mongoose';

import * as dotenv from 'dotenv';
import processAllparts from './lib/allparts/processAllparts';
import logger from 'node-color-log';
import { processProductUrl } from './lib/allparts/processAllpartsProducts';
import { MProduct } from './models/Product';

dotenv.config();

async function main() {
  await mongoose.connect(String(process.env.MONGODB_URI));
  logger.success('Connected to Database');

  MProduct.deleteMany(); // TODO: Delete this

  // await processAllparts();
  await processProductUrl(
    'https://www.allparts.com/products/pk-0140-set-of-2-vintage-style-bell-knobs'
  );

  await mongoose.connection.close();
  logger.success('All Process done. Database connection closed');
}

main();
