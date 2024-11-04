import { cleanEnv, str, bool } from 'envalid';
import * as dotenv from 'dotenv';

dotenv.config();

const config = cleanEnv(process.env, {
  HEADLESS: bool({ default: true }),
  MONGODB_URI: str(),
  CLEAR_DB: bool({ default: false }),
});

export default config;
