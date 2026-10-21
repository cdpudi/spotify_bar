import { criarApp } from './app.js';
import { config } from './config.js';
import { migrar } from './db.js';
import { garantirAdmin } from './lib/admin-inicial.js';
import { iniciarWorker } from './worker.js';

await migrar();
await garantirAdmin();
const app = await criarApp();
await app.listen({ port: config.porta, host: '0.0.0.0' });
console.log(`[api] http://localhost:${config.porta}  (spotify=${config.spotify.modo}, pix=${config.pix.modo})`);
iniciarWorker();
