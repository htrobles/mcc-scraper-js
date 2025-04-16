import mongoose from 'mongoose';

import processAllparts from './allparts/processAllparts';
import logger from 'node-color-log';
import { ContactInfoEnum, MProduct, SupplierEnum } from '../models/Product';
import config from '../config';
import processCoastMusic from './jam/processCoastMusic';
import promptSync from 'prompt-sync';
import processKorgCanada from './jam/processKorgCanada';
import processFender from './fender/processFender';
import processDaddario from './daddario/processDaddario';
import {
  storeChoices,
  supplierChoices,
  contactInfoChoices,
} from '../constants/prompts';
import { StoreEnum } from '../models/ProductPricing';
import processTomLeeMusic from './tomleemusic/processTomLeeMusic';
import processAcclaimMusic from './acclaimmusic/processAcclaimMusic';
import processCosmoMusic from './cosmoMusic/processCosmoMusic';
import processLM from './lm/processLM';
import processBurgerLighting from './burgerLighting/processBurgerLighting';
import processLMBrand from './lm/processLMBrand';
import processRedOne from './redOne/processRedOne';
import processMartin from './martin/processMartin';
import processTaylor from './taylor/processTaylor';
import processSkateOntario from './skateOntario/processSkateOntario';

const prompt = promptSync({ sigint: true });

export async function getProductInfo() {
  logger.color('blue').bold().log('Which supplier website should we process?');
  supplierChoices.forEach(({ label }, index) => {
    logger.log(`${index + 1} : ${label}`);
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
      `Do you want to clear database products for ${chosenSupplier.label}? (y/N)`
    ).toLowerCase();

    if (['y', 'yes'].includes(confirmClearDb)) {
      logger.warn('CLEARING DATABASE');
      await MProduct.deleteMany({ supplier: supplierKey });
    } else {
      logger.info('Proceeding without clearing Database');
    }
  }

  switch (supplierKey) {
    case SupplierEnum.ALLPARTS:
      await processAllparts();
      break;
    case SupplierEnum.COASTMUSIC:
      await processCoastMusic();
      break;
    case SupplierEnum.KORGCANADA:
      await processKorgCanada();
      break;
    case SupplierEnum.FENDER:
      await processFender();
      break;
    case SupplierEnum.DADDARIO:
      await processDaddario();
      break;
    case SupplierEnum.LM:
      if (chosenSupplier.scrapeBrand) {
        await processLMBrand();
      } else {
        await processLM();
      }
      break;
    case SupplierEnum.BURGERLIGHTING:
      await processBurgerLighting();
      break;
    case SupplierEnum.REDONE:
      await processRedOne();
    case SupplierEnum.MARTIN:
      await processMartin();
    case SupplierEnum.TAYLOR:
      await processTaylor();
    default:
      break;
  }

  await mongoose.connection.close();
  logger.success('All Process done. Database connection closed');
}

export async function compareProductPricing() {
  logger.color('blue').bold().log('Which website do you want to process?');
  storeChoices.forEach(({ label }, index) => {
    logger.log(`${index + 1} : ${label}`);
  });

  const input = parseInt(prompt('Enter number of choice: '));
  const storeKey = storeChoices[input - 1].key;

  await mongoose.connect(config.MONGODB_URI);
  logger.success('Connected to Database');

  switch (storeKey) {
    case StoreEnum.TOMLEEMUSIC:
      await processTomLeeMusic();
      break;
    case StoreEnum.ACCLAIMMUSIC:
      await processAcclaimMusic();
      break;
    case StoreEnum.COSMOMUSIC:
      await processCosmoMusic();
      break;

    default:
      break;
  }

  await mongoose.connection.close();
  logger.success('All Process done. Database connection closed');
}

export async function getContactInfo() {
  logger.color('blue').bold().log('Which website should we process?');
  contactInfoChoices.forEach(({ label }, index) => {
    logger.log(`${index + 1} : ${label}`);
  });

  const input = parseInt(prompt('Enter number of choice: '));
  const storeKey = contactInfoChoices[input - 1].key;

  await mongoose.connect(config.MONGODB_URI);
  logger.success('Connected to Database');

  switch (storeKey) {
    case ContactInfoEnum.SKATE_ONTARIO:
      await processSkateOntario();
      break;
  }

  await mongoose.connection.close();
  logger.success('All Process done. Database connection closed');
}
