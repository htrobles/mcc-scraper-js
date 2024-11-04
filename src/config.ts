import { cleanEnv, str, bool } from 'envalid';
import * as dotenv from 'dotenv';

dotenv.config();

const config = cleanEnv(process.env, {
  HEADLESS: bool({ default: true }),
  CLEAR_DB: bool({ default: false }),
  MONGODB_URI: str(),
  ALLPARTS_URL: str(),
});

export default config;
