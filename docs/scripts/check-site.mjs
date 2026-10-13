import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = new URL(process.argv[2] ?? 'http://localhost:3015');
const links = [];
async function listPages(directory, prefix = '') {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) result.push(...await listPages(path.join(directory, entry.name), prefix + entry.name + '/'));
    else if (entry.name.endsWith('.mdx')) {
      const slug = prefix + entry.name.replace(/\.mdx$/, '');
      const route = '/docs' + (slug === 'index' ? '' : '/' + slug);
      result.push(route);
      const markdown = await fs.readFile(path.join(directory, entry.name), 'utf8');
      for (const match of markdown.matchAll(/\]\((\/[^)\s]+)\)|href=["'](\/[^"']+)["']/g)) {
        links.push({ from: route, href: match[1] ?? match[2] });
      }
    }
  }
  return result;
}
const routes = ['/', '/examples', '/studio', '/llms.txt', '/llms-full.txt', '/sitemap.xml', '/robots.txt', '/icon.svg', '/demo/index.html', ...await listPages(path.join(root, 'content/docs'))];
const failed = [];
const pages = new Map();
for (let start = 0; start < routes.length; start += 4) {
  await Promise.all(routes.slice(start, start + 4).map(async (route) => {
    const response = await fetch(new URL(route, base));
    if (!response.ok) failed.push(route + ': ' + response.status);
    pages.set(route, await response.text());
  }));
}
for (const { from, href } of links) {
  const target = new URL(href, base);
  if (!pages.has(target.pathname)) {
    const response = await fetch(target);
    if (!response.ok) failed.push(from + ' links to ' + href + ': ' + response.status);
    pages.set(target.pathname, await response.text());
  }
  const anchor = decodeURIComponent(target.hash.slice(1));
  if (anchor && !pages.get(target.pathname).includes('id="' + anchor + '"')) {
    failed.push(from + ' links to missing anchor ' + href);
  }
}
const search = await fetch(new URL('/api/search?query=swipeDirectionRatio', base)).then((response) => response.json());
if (!search.some((item) => item.url?.includes('/docs/api/container#swipedirectionratio'))) failed.push('API property search did not resolve to the prop anchor.');
const markdown = await fetch(new URL('/docs/api/container.md', base)).then((response) => response.text());
if (!markdown.includes('swipeDirectionRatio')) failed.push('Markdown content negotiation omitted the API properties.');
const installation = await fetch(new URL('/docs/installation.md', base)).then((response) => response.text());
if (!installation.includes('npm install react-native-collapsible-fluid-tabs') ||
    !installation.includes('npm install react-native-reanimated') ||
    !installation.includes('0.9.1') || /<(InstallCommand|CompatibilityTable)/.test(installation)) {
  failed.push('Installation Markdown omitted the install commands or peer requirements.');
}
const notFound = await fetch(new URL('/this-page-does-not-exist', base));
if (notFound.status !== 404) failed.push('Unknown routes did not return 404.');
if (failed.length) { console.error(failed.join('\n')); process.exitCode = 1; }
else console.log('Passed: ' + routes.length + ' routes, ' + links.length + ' internal documentation links/anchors, API search, Markdown negotiation, and 404 behavior.');
