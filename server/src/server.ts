import { buildApp } from './app.js';
import { getConfig } from './config.js';

async function main() {
  const cfg = getConfig();
  const app = await buildApp();
  try {
    await app.listen({ port: cfg.PORT, host: '0.0.0.0' });
    app.log.info(`PPG Pulse API listening on :${cfg.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
