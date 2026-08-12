import fs from 'node:fs';
import path from 'node:path';

function loadEnvFile(filePath = path.resolve('.env')) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] != null) continue;
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function writeStartupCrash(error) {
  try {
    const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve('data');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.appendFileSync(path.join(dataDir, 'panel-crash.log'), `[${new Date().toISOString()}] startup\n${error?.stack || error}\n\n`, 'utf8');
  } catch {}
}

loadEnvFile();
try {
  await import('./server.js');
} catch (error) {
  console.error('[panel] startup failed:', error);
  writeStartupCrash(error);
  process.exitCode = 1;
}
