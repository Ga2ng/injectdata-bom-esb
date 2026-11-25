import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const config = Object.freeze({
  HOST: '127.0.0.1',
  PORT: 3001,
  CDP_ENDPOINT: 'http://127.0.0.1:9222',
  ALLOWED_ORIGINS: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  ALLOWED_HOSTS: ['127.0.0.1:3001', 'localhost:3001'],
  DB_PATH: path.resolve(__dirname, '../../data/automation.sqlite'),
  ESB_DOMAIN: 'erp.esb.co.id',
  REQUIRED_BOM_URL: 'https://erp.esb.co.id/bom',
  CSRF_HEADER_NAME: 'x-requested-with',
  CSRF_HEADER_VALUE: 'ESB-Local-Controller',
});
