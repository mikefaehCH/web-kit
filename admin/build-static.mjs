import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const output = join(root, 'dist');
const files = [
  'auth.js',
  'whatsapp.css',
  'whatsapp.html',
  'whatsapp.js',
  'vendor/supabase.js',
  'vendor/LICENSES.txt',
];

await rm(output, { recursive: true, force: true });
await mkdir(join(output, 'vendor'), { recursive: true });
for (const relativePath of files) {
  const target = join(output, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(root, relativePath), target);
}
