import mongoose from 'mongoose';

import * as dotenv from 'dotenv';
import processAllparts from './lib/allparts/processAllparts';

dotenv.config();

async function main() {
  await mongoose.connect(String(process.env.MONGODB_URI));
  await processAllparts();

  await mongoose.connection.close();
}

main();
