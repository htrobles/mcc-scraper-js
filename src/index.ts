import mongoose from 'mongoose';

import processAllparts from './lib/allparts/processAllparts';
import logger from 'node-color-log';
import { MProduct, SupplierEnum } from './models/Product';
import config from './config';
import processCoastMusic, {
  processProductUrl,
} from './lib/jam/processCoastMusic';

async function main() {
  await mongoose.connect(config.MONGODB_URI);
  logger.success('Connected to Database');

  if (config.CLEAR_DB !== undefined && config.CLEAR_DB) {
    logger.warn('CLEARING DATABASE');
    await MProduct.deleteMany({ supplier: SupplierEnum.ALLPARTS });
  }

  // await processAllparts();
  await processCoastMusic();
  // await processProductUrl(
  //   'https://coastmusiconline.com/Catalog/ProductDetail?itemId=LEC1000SBLKFLH'
  // );

  await mongoose.connection.close();
  logger.success('All Process done. Database connection closed');
}

main();
