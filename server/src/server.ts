import { buildApp } from './app.js';
import { getConfig } from './config.js';
import { ensureDatabase } from './lib/db-setup.js';

async function main() {
  const cfg = getConfig();

  // Self-contained boot: ensure schema + demo data exist (prod / RUN_DB_SETUP).
  ensureDatabase({
    info: (m) => console.log(m),
    error: (m, e) => console.error(m, e ?? ''),
  });

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
