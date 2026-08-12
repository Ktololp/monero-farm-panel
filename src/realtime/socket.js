import { db, audit } from '../database/index.js';
import { parseCookies, verifySessionToken } from '../security/crypto.js';
import { ssh } from '../ssh/index.js';

export function configureSockets(io) {
  io.use((socket, next) => {
    const cookies = parseCookies(socket.handshake.headers.cookie || '');
    if (!verifySessionToken(cookies.panel_session)) return next(new Error('unauthorized'));
    if (!cookies.panel_csrf || socket.handshake.auth?.csrf !== cookies.panel_csrf) return next(new Error('csrf'));
    next();
  });

  io.on('connection', (socket) => {
    const streams = new Map();
    const clientIp = socket.handshake.address || '';

    socket.on('terminal:open', async ({ serverId, cols = 100, rows = 30 } = {}, ack = () => {}) => {
      try {
        const server = db.prepare('SELECT * FROM servers WHERE id=?').get(Number(serverId));
        if (!server) throw new Error('Server not found');
        const key = String(server.id);
        if (streams.has(key)) { try { streams.get(key).end(); } catch {} streams.delete(key); }
        const stream = await ssh.shell(server, { cols: Math.max(20,Math.min(400,Number(cols)||100)), rows: Math.max(5,Math.min(200,Number(rows)||30)) });
        streams.set(key, stream);
        audit({ ip: clientIp, serverId: server.id, action: 'terminal-open' });
        stream.on('data', data => socket.emit('terminal:data', { serverId: server.id, data: data.toString('utf8') }));
        stream.stderr?.on('data', data => socket.emit('terminal:data', { serverId: server.id, data: data.toString('utf8') }));
        stream.on('close', () => { streams.delete(key); socket.emit('terminal:close', { serverId: server.id }); });
        ack({ ok: true });
      } catch (e) { ack({ ok: false, error: e.message }); }
    });

    socket.on('terminal:input', ({ serverId, data } = {}) => {
      if (typeof data !== 'string' || data.length > 65536) return;
      streams.get(String(Number(serverId)))?.write(data);
    });
    socket.on('terminal:resize', ({ serverId, cols, rows } = {}) => {
      const stream = streams.get(String(Number(serverId)));
      if (!stream) return;
      try { stream.setWindow(Math.max(5,Math.min(200,Number(rows)||30)), Math.max(20,Math.min(400,Number(cols)||100)), 0, 0); } catch {}
    });
    socket.on('terminal:close', ({ serverId } = {}) => {
      const key = String(Number(serverId)); const stream = streams.get(key);
      if (stream) { try { stream.end(); } catch {} streams.delete(key); }
    });
    socket.on('disconnect', () => {
      for (const stream of streams.values()) { try { stream.end(); } catch {} }
      streams.clear();
    });
  });
}
