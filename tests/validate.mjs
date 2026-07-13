import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const required = [
  'index.html', 'manifest.webmanifest', 'service-worker.js', 'assets/styles.css',
  'assets/app.js', 'assets/storage.js', 'assets/icon.svg', 'server/server.mjs',
  'server/package.json', 'start-nexus.bat', '.github/workflows/pages.yml', 'README.md'
];
for (const file of required) {
  await fs.access(path.join(root, file));
}
const app = await fs.readFile(path.join(root, 'assets/app.js'), 'utf8');
const expectedRoutes = ['dashboard','library','backlog','timer','goals','notes','media','ai','batteries','releases','guides','training','profiles','settings'];
for (const route of expectedRoutes) {
  if (!app.includes(`${route}:` ) && !app.includes(`['${route}'`) && !app.includes(`['${route}',`)) {
    throw new Error(`Missing route: ${route}`);
  }
}
const index = await fs.readFile(path.join(root, 'index.html'), 'utf8');
for (const ref of ['assets/styles.css','assets/app.js','manifest.webmanifest']) {
  if (!index.includes(ref)) throw new Error(`index.html missing ${ref}`);
}
const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.webmanifest'), 'utf8'));
if (manifest.display !== 'standalone') throw new Error('PWA display mode is not standalone.');
console.log(`Validated ${required.length} required files and ${expectedRoutes.length} routed dashboards.`);
