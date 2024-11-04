import mongoose from 'mongoose';

import * as dotenv from 'dotenv';
import processAllparts from './lib/allparts/processAllparts';
import logger from 'node-color-log';
import { MProduct, SupplierEnum } from './models/Product';
import { processProductUrl } from './lib/allparts/processAllpartsProducts';
import config from './config';

async function main() {
  await mongoose.connect(config.MONGODB_URI);
  logger.success('Connected to Database');

  if (config.CLEAR_DB !== undefined && config.CLEAR_DB) {
    logger.warn('CLEARING DATABASE');
    await MProduct.deleteMany({ supplier: SupplierEnum.ALLPARTS }); // TODO: Delete this
  }

  await processAllparts();

  await mongoose.connection.close();
  logger.success('All Process done. Database connection closed');
}

main();
