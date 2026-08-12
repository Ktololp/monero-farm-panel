import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const roots=['src','web','test','scripts'];
const files=[];
function walk(dir){if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.(?:js|mjs)$/.test(e.name))files.push(p);}}
for(const root of roots)walk(root);
files.push('build.mjs');
let failed=false;
for(const file of files){const r=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(r.status!==0)failed=true;}
if(process.platform!=='win32'){for(const file of ['scripts/mfp','scripts/install-mfp.sh']){const r=spawnSync('bash',['-n',file],{stdio:'inherit'});if(r.status!==0)failed=true;}}
if(failed)process.exit(1);
console.log('[check] OK:',files.length,'JavaScript files');
