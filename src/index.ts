import puppeteer from 'puppeteer';
import getAllpartsBrandUrls from './lib/allparts/getAllpartsBrandUrls';
import getAllpartsProductUrls from './lib/allparts/getAllpartProductUrls';

const url = 'https://www.allparts.com/pages/shop-by-brand';

async function main() {
  const brandUrls = await getAllpartsBrandUrls();
  const [first] = brandUrls;
  const productUrls = await getAllpartsProductUrls([first]);

  console.log(productUrls);
}

main();
