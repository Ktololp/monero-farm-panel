import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { Server as SocketIOServer } from 'socket.io';
import { config, validateConfig } from '../config/index.js';
import { db, getAdminPasswordHash } from '../database/index.js';
import { api } from '../api/router.js';
import { setupApi } from '../api/setup-router.js';
import { configureSockets } from '../realtime/socket.js';
import { setMonitorIO, startMonitor, stopMonitor } from '../monitoring/index.js';
import { setAlertIO } from '../alerts/index.js';
import { setMarketIO, startMarket, stopMarket } from '../market/index.js';
import { setJobsIO } from '../jobs/index.js';
import { setUpdatesIO, startUpdateChecker, stopUpdateChecker } from '../updates/index.js';
import { ssh } from '../ssh/index.js';

validateConfig();
if (!getAdminPasswordHash()) throw new Error('Admin password hash was not initialized; check PANEL_ADMIN_PASSWORD and remove an empty data directory if this is the first start.');

fs.mkdirSync(config.certDir, { recursive: true });
function ensureCertificate() {
  if (config.tlsPfxPath) {
    const pfxPath = path.resolve(config.tlsPfxPath);
    if (!fs.existsSync(pfxPath)) throw new Error(`TLS PFX file not found: ${pfxPath}`);
    console.log(`[tls] using PFX certificate: ${pfxPath}`);
    return { pfx: fs.readFileSync(pfxPath), passphrase: config.tlsPfxPassphrase || undefined };
  }

  const keyPath = path.join(config.certDir, 'panel.key');
  const certPath = path.join(config.certDir, 'panel.crt');
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    console.log('[tls] generating self-signed PEM certificate with OpenSSL');
    try {
      execFileSync('openssl', ['req','-x509','-newkey','rsa:2048','-sha256','-nodes','-keyout',keyPath,'-out',certPath,'-days','825','-subj','/CN=monero-farm-panel'], { stdio: 'ignore' });
    } catch (err) {
      throw new Error('Не удалось создать HTTPS-сертификат. Установите OpenSSL либо задайте TLS_PFX_PATH/TLS_PFX_PASSPHRASE (Windows setup создаёт PFX автоматически).', { cause: err });
    }
    try { fs.chmodSync(keyPath, 0o600); } catch {}
  }
  return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
}

const app = express();
if (config.trustProxy) app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'], connectSrc: ["'self'", 'ws:', 'wss:'], fontSrc: ["'self'", 'data:'], objectSrc: ["'none'"], baseUri: ["'self'"], frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.get('/healthz', (req,res)=>res.json({ok:true,time:Date.now()}));
// Dedicated setup namespace keeps provisioning actions isolated from the stable API router.
app.use('/api/v1/setup', setupApi);
app.use('/api/setup', setupApi);
// Canonical API namespace for v1.1+. Keep /api as a backwards-compatible alias.
app.use('/api/v1', api);
app.use('/api', api);
app.use('/api/v1', (req,res)=>res.status(404).json({error:'API route not found'}));
app.use('/api', (req,res)=>res.status(404).json({error:'API route not found'}));
// Never expose Express development HTML/stack traces to the browser. Keep the
// full stack in the panel console, while API clients receive one concise JSON error.
app.use((error, req, res, next) => {
  const originalUrl = String(req.originalUrl || req.url || '');
  if (!originalUrl.startsWith('/api/')) return next(error);
  console.error(`[api] ${req.method} ${originalUrl}:`, error?.stack || error);
  if (res.headersSent) return next(error);
  const rawStatus = Number(error?.status || error?.statusCode || 500);
  const status = Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;
  return res.status(status).json({ error: error?.message || 'Internal server error' });
});
app.use(express.static(path.resolve('public'), { maxAge: config.nodeEnv === 'production' ? '1h' : 0 }));
app.use((req,res)=>res.sendFile(path.resolve('public/index.html')));

const server = config.httpsEnabled ? https.createServer(ensureCertificate(), app) : http.createServer(app);
const io = new SocketIOServer(server, { transports: ['websocket','polling'], maxHttpBufferSize: 1_000_000, cors: false });
configureSockets(io); setMonitorIO(io); setAlertIO(io); setMarketIO(io); setJobsIO(io); setUpdatesIO(io);

server.listen(config.port, '0.0.0.0', () => {
  console.log(`[panel] listening on ${config.httpsEnabled ? 'https' : 'http'}://0.0.0.0:${config.port}`);
  startMonitor();
  startMarket();
  startUpdateChecker();
});

function shutdown(signal) {
  console.log(`[panel] ${signal}: shutting down`);
  stopMonitor(); stopMarket(); stopUpdateChecker(); ssh.closeAll(); io.close(); server.close(() => { db.close(); process.exit(0); });
  setTimeout(()=>process.exit(1),5000).unref();
}
process.on('SIGTERM',()=>shutdown('SIGTERM'));
process.on('SIGINT',()=>shutdown('SIGINT'));


function writeCrashLog(kind, error) {
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
    const text = `[${new Date().toISOString()}] ${kind}\n${error?.stack || error?.message || String(error)}\n\n`;
    fs.appendFileSync(path.join(config.dataDir, 'panel-crash.log'), text, 'utf8');
  } catch {}
}

process.on('unhandledRejection', (reason) => {
  console.error('[panel] unhandledRejection:', reason);
  writeCrashLog('unhandledRejection', reason);
});
process.on('uncaughtException', (error) => {
  console.error('[panel] uncaughtException:', error);
  writeCrashLog('uncaughtException', error);
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 100).unref();
});
