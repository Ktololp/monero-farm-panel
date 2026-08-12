
import { getSetting } from '../database/index.js';
import { triggerAlert, resolveAlert } from '../alerts/index.js';

export async function evaluateAlerts(server, live) {
  const globalTemp = Number(getSetting('temp_critical')) || 90;
  const tempMax = Number(server.temp_max) || globalTemp;
  const globalDrop = Number(getSetting('hash_drop_percent')) || 20;
  const hashMin = Number(server.hash_min) || null;

  if (live.status === 'offline') {
    const offlineAfter = Math.max(15, Number(getSetting('offline_after_seconds')) || 90) * 1000;
    const lastSeen = Number(server.last_seen_at) || 0;
    if (!lastSeen || Date.now() - lastSeen >= offlineAfter) await triggerAlert(server, 'offline', 'SSH-соединение недоступно.');
  } else await resolveAlert(server, 'offline', 'SSH-соединение восстановлено.');

  if (!live.grace && live.status === 'degraded') await triggerAlert(server, 'xmrig', live.lastError || 'API XMRig недоступен.');
  else if (live.status === 'online') await resolveAlert(server, 'xmrig', 'API XMRig снова доступен.');

  if (live.tempC != null && live.tempC >= tempMax) await triggerAlert(server, 'temperature', `Температура CPU ${live.tempC.toFixed(1)} °C, лимит ${tempMax} °C.`);
  else if (live.tempC != null) await resolveAlert(server, 'temperature', `Температура CPU вернулась к ${live.tempC.toFixed(1)} °C.`);

  if (live.status === 'online' && live.hash60s != null && !live.grace) {
    const threshold = hashMin || (live.baselineHash ? live.baselineHash * (1 - globalDrop / 100) : null);
    if (threshold && live.hash60s < threshold) await triggerAlert(server, 'hashrate', `Деградация: ${(live.hash60s/1000).toFixed(2)} kH/s при персональном пороге ${(threshold/1000).toFixed(2)} kH/s.`);
    else await resolveAlert(server, 'hashrate', `Хешрейт восстановился до ${(live.hash60s/1000).toFixed(2)} kH/s.`);
  }

  if (live.network?.dns === false || live.network?.internet === false) await triggerAlert(server, 'network', `Проблема сети: DNS ${live.network?.dns ? 'OK' : 'FAIL'}, Internet ${live.network?.internet ? 'OK' : 'FAIL'}.`);
  else if (live.network?.dns === true && live.network?.internet === true) await resolveAlert(server, 'network', 'DNS и доступ в Интернет восстановлены.');

  if (live.errors?.length) await triggerAlert(server, 'xmrig-errors', `XMRig сообщает об ошибках (${live.errors.length}): ${String(live.errors.at(-1)).slice(0, 300)}`);
  else if (live.status === 'online') await resolveAlert(server, 'xmrig-errors', 'Ошибки XMRig больше не обнаруживаются.');
}
