import logger from 'node-color-log';

interface ProcessWithRetryOptionsType {
  retries: number;
}

export default async function processWithRetry(
  callback: () => any,
  options: ProcessWithRetryOptionsType = { retries: 3 }
) {
  const { retries } = options;

  let numbersTried = 0;
  let result;

  while (numbersTried < retries) {
    try {
      result = await callback();
      return result;
    } catch (error) {
      numbersTried++;
      if (numbersTried >= retries)
        logger.error(`Failed after ${retries} retries`);
      console.log(error);
    }
  }
}
