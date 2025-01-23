import logger from 'node-color-log';
import { MProcess, ProcessStatusEnum } from '../../models/Process';
import { SupplierEnum } from '../../models/Product';
import promptSync from 'prompt-sync';

const prompt = promptSync({ sigint: true });

export default async function initiateProcess(supplier: SupplierEnum) {
  const unfinishedProcess = await MProcess.findOne({
    status: { $in: [ProcessStatusEnum.FAILED, ProcessStatusEnum.ONGOING] },
    supplier: supplier,
  }).lean();

  if (unfinishedProcess) {
    const continueProcessResponse = prompt(
      `There was a previous ongoing process. Do you wish to continue that process? (Y/n)`
    ).toLowerCase();

    if (['n', 'no'].includes(continueProcessResponse)) {
      await MProcess.findByIdAndUpdate(unfinishedProcess._id, {
        status: ProcessStatusEnum.CANCELLED,
      });
      await new MProcess({
        supplier: supplier,
        status: ProcessStatusEnum.ONGOING,
      }).save();

      return unfinishedProcess;
    } else {
      logger.info('Continuing previous process...');

      if (unfinishedProcess.status !== ProcessStatusEnum.ONGOING) {
        await MProcess.findByIdAndUpdate(unfinishedProcess._id, {
          status: ProcessStatusEnum.ONGOING,
        });
      }

      return unfinishedProcess;
    }
  } else {
    const newProcess = await new MProcess({
      supplier: supplier,
      status: ProcessStatusEnum.ONGOING,
    }).save();

    return newProcess;
  }
}
