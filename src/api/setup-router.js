import express from 'express';
import { requireAuth, requireCsrf } from '../security/auth.js';
import {
  getXmrigInstallStatus,
  installXmrig,
  getMonerodInstallStatus,
  installMonerod,
  getMonerodTorStatus,
  configureMonerodTor
} from '../operations/index.js';
import { discoverServer } from '../discovery/index.js';
import { pollServerNow } from '../monitoring/index.js';

export const setupApi = express.Router();

function ip(req) { return req.ip || req.socket.remoteAddress || ''; }

setupApi.use(requireAuth);
setupApi.use(requireCsrf);

setupApi.get('/servers/:id/status', async (req, res, next) => {
  try {
    const [xmrigResult, monerodResult] = await Promise.all([
      getXmrigInstallStatus(req.params.id),
      getMonerodInstallStatus(req.params.id)
    ]);
    const torResult = await getMonerodTorStatus(req.params.id, monerodResult.monerod);
    res.json({ ok: true, xmrig: xmrigResult.xmrig, monerod: monerodResult.monerod, tor: torResult.tor });
  } catch (error) {
    next(error);
  }
});

setupApi.post('/servers/:id/xmrig/install', async (req, res, next) => {
  try {
    const result = await installXmrig(req.params.id, req.body || {}, { actorIp: ip(req) });
    await discoverServer(req.params.id, { apply: true, actorIp: ip(req) }).catch(() => null);
    const live = await pollServerNow(req.params.id).catch(() => null);
    res.json({ ...result, live });
  } catch (error) {
    next(error);
  }
});

setupApi.post('/servers/:id/monerod/install', async (req, res, next) => {
  try {
    const result = await installMonerod(req.params.id, req.body || {}, { actorIp: ip(req) });
    await discoverServer(req.params.id, { apply: true, actorIp: ip(req) }).catch(() => null);
    const live = await pollServerNow(req.params.id).catch(() => null);
    res.json({ ...result, live });
  } catch (error) {
    next(error);
  }
});

setupApi.post('/servers/:id/monerod/tor', async (req, res, next) => {
  try {
    const result = await configureMonerodTor(req.params.id, req.body || {}, { actorIp: ip(req) });
    const live = await pollServerNow(req.params.id).catch(() => null);
    res.json({ ...result, live });
  } catch (error) {
    next(error);
  }
});
