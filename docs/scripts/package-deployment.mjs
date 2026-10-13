import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isUtf8 } from 'node:buffer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
async function add(relative) {
  const filename = path.join(root, relative);
  const stat = await fs.stat(filename);
  if (stat.isDirectory()) {
    for (const entry of await fs.readdir(filename)) await add(relative + '/' + entry);
  } else if (!relative.endsWith('.ico')) {
    const contents = await fs.readFile(filename);
    const encoding = isUtf8(contents) ? 'utf-8' : 'base64';
    files.push({ file: relative, data: contents.toString(encoding), encoding });
  }
}
// An explicit allowlist keeps local environments, caches, and screenshots out.
for (const entry of ['app', 'components', 'content', 'lib', 'public', 'scripts', 'licenses', 'package.json', 'package-lock.json', 'next.config.mjs', 'postcss.config.mjs', 'proxy.ts', 'tsconfig.json', 'eslint.config.mjs', 'vercel.json', '.gitignore', '.vercelignore', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) await add(entry);
await fs.mkdir(path.join(root, '.deploy'), { recursive: true });
await fs.writeFile(path.join(root, '.deploy/files.json'), JSON.stringify(files));
console.log('Packaged ' + files.length + ' files (' + files.reduce((total, file) => total + Buffer.byteLength(file.data, file.encoding), 0) + ' bytes).');
