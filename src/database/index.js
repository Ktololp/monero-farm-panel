import { initializeDefaults } from './defaults.js';
import { initializeSchema } from './schema.js';

initializeSchema();
initializeDefaults();

export { db } from './connection.js';
export { getAdminPasswordHash, setAdminPasswordHash } from './admin.js';
export { audit } from './audit.js';
export { cleanupHistory } from './maintenance.js';
export { getSetting, getSettings, setSettings } from './settings.js';
