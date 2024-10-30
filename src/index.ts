import getAllpartsBrandUrls from './lib/allparts/getAllpartsBrandUrls';
import processAllpartsBrands from './lib/allparts/processAllpartsBrands';

async function main() {
  const brandUrls = await getAllpartsBrandUrls();
  const [first] = brandUrls;
  await processAllpartsBrands([first]);
}

main();
