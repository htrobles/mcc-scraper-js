import mongoose from 'mongoose';

import * as dotenv from 'dotenv';
import processAllparts from './lib/allparts/processAllparts';
import logger from 'node-color-log';

dotenv.config();

async function main() {
  await mongoose.connect(String(process.env.MONGODB_URI));
  logger.success('Connected to Database');

  await processAllparts();

  await mongoose.connection.close();
  logger.success('All Process done. Database connection');
}

main();
