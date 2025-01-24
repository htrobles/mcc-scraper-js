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
  REPLACE_EMPTY_DESC_WITH_TITLE: bool({ default: true }),
  FENDER_LOGIN_URL: str(),
  FENDER_PRODUCT_URL: str(),
  FENDER_USERNAME: str(),
  FENDER_PASSWORD: str(),
  DADDARIO_LOGIN_URL: str(),
  DADDARIO_PRODUCT_URL: str(),
  DADDARIO_USERNAME: str(),
  DADDARIO_PASSWORD: str(),
  TOM_LEE_MUSIC_URL: str(),
  ACCLAIM_MUSIC_URL: str(),
  COSMO_MUSIC_URL: str(),
  LM_URL: str(),
  BURGER_LIGHTING_URL: str(),
  RED_ONE_URL: str(),
  MARTIN_URL: str(),
});

export default config;
