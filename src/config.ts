import { cleanEnv, str, bool } from 'envalid';
import * as dotenv from 'dotenv';

dotenv.config();

const config = cleanEnv(process.env, {
  HEADLESS: bool({ default: true }),
  CLEAR_DB: bool({ default: false }),
  MONGODB_URI: str(),
  ALLPARTS_URL: str(),
  COAST_MUSIC_URL: str(),
  KORG_CANADA_URL: str(),
  UPSERT_DATA: bool({ default: false }),
});

export default config;
