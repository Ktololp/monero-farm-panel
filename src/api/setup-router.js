import express from 'express';
import { requireAuth, requireCsrf } from '../security/auth.js';
import { getXmrigInstallStatus, installXmrig } from '../operations/index.js';
import { discoverServer } from '../discovery/index.js';
import { pollServerNow } from '../monitoring/index.js';

export const setupApi = express.Router();

function ip(req) { return req.ip || req.socket.remoteAddress || ''; }

setupApi.use(requireAuth);
setupApi.use(requireCsrf);

setupApi.get('/servers/:id/status', async (req, res, next) => {
  try {
    res.json(await getXmrigInstallStatus(req.params.id));
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
