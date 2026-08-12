import { build } from 'esbuild';
import { mkdir, cp, writeFile } from 'node:fs/promises';

await mkdir('public', { recursive: true });
await build({
  entryPoints: ['web/app/main.js'],
  bundle: true,
  minify: true,
  sourcemap: false,
  target: ['es2020'],
  outfile: 'public/app.js',
  loader: { '.css': 'css' }
});
await cp('web/index.html', 'public/index.html');
await cp('web/manifest.webmanifest', 'public/manifest.webmanifest');
await cp('web/sw.js', 'public/sw.js');
await writeFile('public/version.txt', new Date().toISOString());
