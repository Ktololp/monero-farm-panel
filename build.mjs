import { build } from 'esbuild';
import { transformAsync } from '@babel/core';
import { mkdir, cp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const linguiBabel={name:'lingui-babel-macros',setup(ctx){ctx.onLoad({filter:/\.js$/},async args=>{
  if(!args.path.includes(`${path.sep}web${path.sep}`))return;
  const source=await readFile(args.path,'utf8');
  const result=await transformAsync(source,{filename:args.path,configFile:path.resolve('babel.config.json'),babelrc:false,sourceMaps:false,ast:false,sourceType:'module'});
  return{contents:result?.code??source,loader:'js'};
});}};
await mkdir('public',{recursive:true});
await build({entryPoints:['web/app/main.js'],bundle:true,minify:true,sourcemap:false,target:['es2020'],outfile:'public/app.js',loader:{'.css':'css'},plugins:[linguiBabel]});
await cp('web/index.html','public/index.html');await cp('web/manifest.webmanifest','public/manifest.webmanifest');await cp('web/sw.js','public/sw.js');
await writeFile('public/version.txt',new Date().toISOString());
