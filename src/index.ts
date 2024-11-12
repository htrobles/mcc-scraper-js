import mongoose from 'mongoose';

import processAllparts from './lib/allparts/processAllparts';
import logger from 'node-color-log';
import { MProduct, SupplierEnum } from './models/Product';
import config from './config';
import processCoastMusic from './lib/jam/processCoastMusic';
import promptSync from 'prompt-sync';

const prompt = promptSync({ sigint: true });
const supplierChoices = [
  {
    key: SupplierEnum.ALLPARTS,
    label: 'Allparts',
  },
  {
    key: SupplierEnum.COASTMUSIC,
    label: 'Coast Music',
  },
];

async function main() {
  console.log('Which supplier website should we scrape?');
  supplierChoices.forEach(({ label }, index) => {
    console.log(`${index + 1} : ${label}`);
  });

  const input = parseInt(prompt('Enter number of choice: '));

  const chosenSupplier = supplierChoices[input - 1];
  const supplierKey = chosenSupplier.key;

  if (typeof input !== 'number' || !chosenSupplier) {
    logger.error('Invalid input. Please try again.');
    return;
  }

  logger.info(`You chose: ${chosenSupplier.label}`);

  await mongoose.connect(config.MONGODB_URI);
  logger.success('Connected to Database');

  if (config.CLEAR_DB !== undefined && config.CLEAR_DB) {
    const confirmClearDb = prompt(
      `Are you sure you want to clear database products for ${chosenSupplier.label}? (y/N)`
    ).toLowerCase();

    if (['y', 'yes'].includes(confirmClearDb)) {
      logger.warn('CLEARING DATABASE');
      await MProduct.deleteMany({ supplier: supplierKey });
    } else if (['n', 'no'].includes(confirmClearDb)) {
      logger.info('Proceeding without clearing Database');
    } else {
      logger.error('Invalid choice');
      await mongoose.connection.close();
      return;
    }
  }

  switch (supplierKey) {
    case SupplierEnum.ALLPARTS:
      await processAllparts();
      break;
    case SupplierEnum.COASTMUSIC:
      await processCoastMusic();
      break;
    default:
      break;
  }

  await mongoose.connection.close();
  logger.success('All Process done. Database connection closed');
}

main();
