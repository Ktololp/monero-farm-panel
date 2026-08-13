import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse=traverseModule.default??traverseModule,root=path.resolve(import.meta.dirname,'..');
const walk=(d,o=[])=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p,o);else if(p.endsWith('.js'))o.push(p);}return o;};
const ids=new Set();
for(const f of walk(path.join(root,'web/i18n/messages'))){if(f.endsWith(path.join('messages','index.js')))continue;const ast=parse(fs.readFileSync(f,'utf8'),{sourceType:'module'});
  traverse(ast,{CallExpression(p){if(p.node.callee.type!=='Identifier'||p.node.callee.name!=='msg')return;const a=p.node.arguments[0];if(a?.type!=='ObjectExpression')return;let id,msg;for(const x of a.properties){if(x.type!=='ObjectProperty')continue;const n=x.key.type==='Identifier'?x.key.name:x.key.value;if(n==='id'&&x.value.type==='StringLiteral')id=x.value.value;if(n==='message'&&x.value.type==='StringLiteral')msg=x.value.value;}if(!id||!msg)throw new Error('msg() needs static id+message: '+path.relative(root,f));if(ids.has(id))throw new Error('duplicate id '+id);ids.add(id);}});
}
const poIds=f=>new Set([...fs.readFileSync(path.join(root,f),'utf8').matchAll(/^msgid "([^"]+)"$/gm)].map(m=>m[1]).filter(Boolean));
for(const l of ['en','ru']){const p=poIds(`web/locales/${l}/messages.po`),m=[...ids].filter(x=>!p.has(x)),x=[...p].filter(x=>!ids.has(x));if(m.length||x.length)throw new Error(`${l} catalog mismatch missing=${m.slice(0,8)} extra=${x.slice(0,8)}`);}
const missing=[];
for(const f of walk(path.join(root,'web'))){if(f.includes(path.join('web','locales'))||f.includes(path.join('web','i18n','messages')))continue;const src=fs.readFileSync(f,'utf8'),ast=parse(src,{sourceType:'module'});
  traverse(ast,{CallExpression(p){if(p.node.callee.type==='Identifier'&&p.node.callee.name==='t'&&p.node.arguments[0]?.type==='StringLiteral'&&!ids.has(p.node.arguments[0].value))missing.push(path.relative(root,f)+': '+p.node.arguments[0].value);}});
  if(/[А-Яа-яЁё]/.test(src))throw new Error('embedded Cyrillic outside catalogs: '+path.relative(root,f));
}
if(missing.length)throw new Error('unknown translation ids:\n'+missing.slice(0,20).join('\n'));
if(fs.existsSync(path.join(root,'web/i18n/ru.js'))||fs.existsSync(path.join(root,'web/i18n/en.js')))throw new Error('legacy dictionaries still exist');
console.log(`[i18n] OK: ${ids.size} Lingui explicit IDs, RU/EN synchronized`);
