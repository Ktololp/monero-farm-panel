import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const files = ['src/ssh/index.js','src/ssh/authentication.js','src/ssh/connection-manager.js','src/ssh/commands.js','src/ssh/terminal.js','src/ssh/errors.js','src/ssh/utils.js','src/ssh/README.md'];
test('SSH subsystem has explicit responsibility files',()=>{for(const file of files)assert.equal(fs.existsSync(file),true,'missing '+file);});
test('SSH index stays a small stable facade',()=>{const lines=fs.readFileSync('src/ssh/index.js','utf8').split(/\r?\n/).length;assert.ok(lines<=35,`src/ssh/index.js is too large: ${lines} lines`);});
