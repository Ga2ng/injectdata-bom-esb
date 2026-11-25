import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { closeDatabase, initDatabase } from './database/db.js';
import { browserRouter } from './routes/browserRoutes.js';
import * as sessionManager from './browser/sessionManager.js';

initDatabase();

const app = express();

app.disable('x-powered-by');
// Set limit lebih besar (20mb) agar dapat menerima file JSON ekspor BOM yang berisi ribuan menu
app.use(express.json({ limit: '20mb' }));

// Block requests targeting unexpected Host headers (DNS rebinding mitigation)
app.use((req, res, next) => {
  const host = (req.headers.host || '').toLowerCase();
  if (!config.ALLOWED_HOSTS.includes(host)) {
    res.status(403).json({
      ok: false,
      code: 'FORBIDDEN_HOST',
      message: 'Host header tidak diizinkan.',
    });
    return;
  }
  next();
});

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }
      const err = new Error('Origin tidak diizinkan oleh kebijakan CORS lokal.');
      err.statusCode = 403;
      callback(err);
    },
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-Requested-With'],
  })
);

// Require local CSRF header for state-changing POST and DELETE requests
app.use('/api', (req, res, next) => {
  if (req.method === 'POST' || req.method === 'DELETE') {
    const origin = req.headers.origin;
    if (origin && !config.ALLOWED_ORIGINS.includes(origin)) {
      res.status(403).json({
        ok: false,
        code: 'FORBIDDEN_ORIGIN',
        message: 'Origin tidak diizinkan.',
      });
      return;
    }

    const csrfHeader = req.get(config.CSRF_HEADER_NAME);
    if (csrfHeader !== config.CSRF_HEADER_VALUE) {
      res.status(403).json({
        ok: false,
        code: 'CSRF_HEADER_MISSING',
        message: 'Header keamanan lokal tidak valid.',
      });
      return;
    }
  }
  next();
});

app.use('/api', browserRouter);

app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    ok: false,
    code: err.code || 'INTERNAL_ERROR',
    message: err.message || 'Terjadi kesalahan internal server.',
  });
});

const server = app.listen(config.PORT, config.HOST, () => {
  console.log(`\n==================================================`);
  console.log(`[ESB Controller] Backend online di http://${config.HOST}:${config.PORT}`);
  console.log(`[ESB Controller] Otomatis mencoba connect ke Chrome port 9222...`);
  console.log(`==================================================\n`);

  sessionManager.connect().catch((err) => {
    console.log(`[ESB Controller Info] Belum bisa auto-connect: ${err.message}`);
    console.log(`[ESB Controller Info] Silakan buka Chrome dengan remote-debugging-port=9222 lalu klik Connect di Dashboard.\n`);
  });
});

let shuttingDown = false;
async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}. Menutup koneksi Playwright...`);
  try {
    await sessionManager.shutdown();
  } catch {
    // Ignore
  }
  server.close(() => {
    closeDatabase();
    process.exit(0);
  });
  setTimeout(() => {
    closeDatabase();
    process.exit(0);
  }, 3000).unref();
}

process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
