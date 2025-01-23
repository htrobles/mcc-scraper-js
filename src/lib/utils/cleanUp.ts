import { Types } from 'mongoose';
import { MProcess, ProcessStatusEnum } from '../../models/Process';
import { SupplierEnum } from '../../models/Product';
import { MProductSimilarity } from '../../models/ProductSimilarity';
import { MRawProduct } from '../../models/RawProduct';
import logger from 'node-color-log';
import { supplierChoices } from '../../constants/prompts';

export default async function cleanUp(
  processId: string | Types.ObjectId,
  supplier: SupplierEnum
) {
  await MProcess.findByIdAndUpdate(processId, {
    status: ProcessStatusEnum.DONE,
  });

  await MProductSimilarity.deleteMany({ supplier });
  await MRawProduct.deleteMany();

  const supplierLabel = supplierChoices.find(
    ({ key }) => key === supplier
  )?.label;

  logger.success(`Finished processing ${supplierLabel} website`);
}
