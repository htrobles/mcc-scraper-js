import logger from 'node-color-log';
import puppeteer, { Page } from 'puppeteer';
import config from '../../config';
import { ContactInfo, MContactInfo } from '../../models/ContactInfo';
import { generateContactInfoCsv } from '../utils/generateCsv';

export default async function processSkateOntario() {
  logger.color('blue').bold().log('Processing Skate Ontario');

  await MContactInfo.deleteMany({});

  const browser = await puppeteer.launch({
    headless: config.HEADLESS,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  let nextPage: string | null = config.SKATE_ONTARIO_URL;

  while (nextPage) {
    await page.goto(nextPage, { waitUntil: 'networkidle2' });

    let nextPageUrl;

    try {
      nextPageUrl = await page.$eval('li.bpn-next-link a', (el) =>
        el.getAttribute('href')
      );
    } catch (error) {
      logger.warn(`Could not find next page URL for ${nextPage}`);
    }

    const clubLinks = await page.$$eval('a.club-detail-link', (elements) =>
      elements.reduce((acc, el) => {
        const href = el.getAttribute('href');
        if (href) {
          acc.push(href);
        }
        return acc;
      }, [] as string[])
    );

    const newPage = await browser.newPage();

    for (const clubLink of clubLinks) {
      await processClub(clubLink, newPage);
    }

    if (nextPageUrl) {
      nextPage = nextPageUrl;
    } else {
      nextPage = null;
    }

    await newPage.close();
  }

  const date = new Date();
  const formattedDate = date.toISOString().split('T')[0];
  await generateContactInfoCsv(`skate-ontario-${formattedDate}`);

  await browser.close();
}

async function processClub(clubLink: string, page: Page) {
  await page.goto(clubLink, { waitUntil: 'networkidle2' });

  let name: string | undefined = undefined;
  let address1: string | undefined = undefined;
  let secondaryAddresses: (string | undefined)[] = [];
  let phone: string | undefined = undefined;
  let website: string | undefined = undefined;

  try {
    name = await page.$eval('h2.entry-title', (el) => el.textContent?.trim());
  } catch (error) {
    logger.warn(`Could not find club name for ${clubLink}`);
  }

  if (!name) {
    return;
  }

  try {
    address1 = await page.$eval('p.primary_address', (el) =>
      el.textContent?.trim()
    );
  } catch (error) {
    logger.warn(`Could not find primary address for ${clubLink}`);
  }

  try {
    secondaryAddresses = await page.$$eval('p.secondary_address', (elements) =>
      elements.map((el) => el.textContent?.split(':')[1].trim())
    );
  } catch (error) {
    logger.warn(`Could not find secondary addresses for ${clubLink}`);
  }

  try {
    phone = await page.$eval('p.contact_phone', (el) => el.textContent?.trim());
  } catch (error) {
    logger.warn(`Could not find phone number for ${clubLink}`);
  }

  try {
    website =
      (await page.$eval('li.website_hover a', (el) =>
        el.getAttribute('href')
      )) || undefined;
  } catch (error) {
    logger.warn(`Could not find website for ${clubLink}`);
  }

  const club: ContactInfo = {
    name: name || '',
    address1,
    address2: secondaryAddresses[0] || null,
    address3: secondaryAddresses[1] || null,
    phone,
    website,
  };

  await MContactInfo.create(club);
}
