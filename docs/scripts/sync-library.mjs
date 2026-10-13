import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const check = args.includes('--check');
const skipDemo = check || args.includes('--skip-demo');
const library = path.resolve(args.find((arg) => !arg.startsWith('--')) ?? path.join(root, '..'));
const staleFiles = [];
async function writeGenerated(relative, contents) {
  const filename = path.join(root, relative);
  if (check) {
    const current = await fs.readFile(filename, 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (current !== contents) staleFiles.push(relative);
    return;
  }
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, contents);
}

function commentText(comment, source) {
  if (typeof comment === 'string') return comment;
  return comment?.map((part) => {
    if (ts.isJSDocLink(part) || ts.isJSDocLinkCode(part) || ts.isJSDocLinkPlain(part)) {
      const target = part.name?.getText(source) ?? '';
      const label = part.text || target;
      return target.startsWith('https://') ? `[${label}](${target})` : '`' + label + '`';
    }
    return part.text;
  }).join('') ?? '';
}
const pkg = JSON.parse(await fs.readFile(path.join(library, 'package.json'), 'utf8'));
if (pkg.name !== 'react-native-collapsible-fluid-tabs') throw new Error('Expected the Fluid Tabs library folder.');
const sourceFiles = ['src/types.ts', 'src/hooks.ts', 'src/components/DefaultTabBar.tsx'];
const interfaces = {};
const sourceHashes = {};
for (const file of sourceFiles) {
  const source = (await fs.readFile(path.join(library, file), 'utf8')).replaceAll('\r\n', '\n');
  sourceHashes[file] = createHash('sha256').update(source).digest('hex');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  for (const node of ast.statements) {
    if (!ts.isInterfaceDeclaration(node) || node.name.text.startsWith('Internal')) continue;
    interfaces[node.name.text] = {
      file,
      extends: node.heritageClauses?.flatMap((clause) => clause.types.map((type) => type.expression.getText(ast))) ?? [],
      properties: node.members.filter(ts.isPropertySignature).map((member) => ({
        name: member.name.getText(ast),
        optional: !!member.questionToken,
        type: member.type?.getText(ast) ?? 'unknown',
        description: member.jsDoc?.map((doc) => commentText(doc.comment, ast)).join('\n') ?? '',
        deprecated: ts.getJSDocDeprecatedTag(member) ? commentText(ts.getJSDocDeprecatedTag(member).comment, ast) || 'Deprecated.' : null,
      })),
    };
  }
}
const generated = { version: pkg.version, packageName: pkg.name, sourceHashes, peerDependencies: pkg.peerDependencies, optionalPeers: Object.entries(pkg.peerDependenciesMeta ?? {}).filter(([, metadata]) => metadata.optional).map(([name]) => name), interfaces };
await writeGenerated('lib/generated/library.json', JSON.stringify(generated, null, 2) + '\n');
if (!check) console.log('Synced public types and peer requirements from ' + pkg.name + '@' + pkg.version);

const apiPages = {
  ContainerProps: ['container', 'Tabs.Container', 'Connect a collapsing header, tab bar, and scrollable pages.'],
  TabProps: ['tab', 'Tabs.Tab', 'Give a page its identity, label, icon, and content.'],
  DefaultTabBarProps: ['tab-bar', 'Tabs.DefaultTabBar', 'Customize the adaptive pill tab bar.'],
  CollapsibleHeader: ['header-values', 'Header values', 'The values returned by useCollapsibleHeader.'],
  TabBarRenderProps: ['tab-bar-values', 'Tab bar values', 'The values supplied to your renderTabBar function.'],
  TabsRef: ['ref', 'Imperative ref', 'Navigate to a tab from a parent component.'],
};
function collectProperties(name) {
  const value = interfaces[name];
  return value ? [...value.extends.flatMap(collectProperties), ...value.properties] : [];
}
const tick = String.fromCharCode(96);
for (const [name, [slug, title, description]] of Object.entries(apiPages)) {
  let markdown = '---\ntitle: ' + JSON.stringify(title) + '\ndescription: ' + JSON.stringify(description) + '\n---\n\n';
  markdown += 'Type: ' + tick + name + tick + '. [View library source](https://github.com/rileysay/react-native-collapsible-fluid-tabs/blob/main/' + interfaces[name].file + ').\n\n';
  if (name === 'DefaultTabBarProps') markdown += 'The container supplies the animation and navigation values. In your ' + tick + 'renderTabBar' + tick + ' callback, spread those props onto the default bar before setting colors or sizing. See [custom tab bars](/docs/guides/tab-bars).\n\n';
  if (name === 'TabsRef') markdown += 'Create the ref with ' + tick + 'useRef<TabsRef>(null)' + tick + ' and pass it to ' + tick + 'Tabs.Container' + tick + '. The component must be mounted before calling its methods.\n\n';
  for (const prop of collectProperties(name)) {
    markdown += '## ' + prop.name + '\n\n' + (prop.optional ? 'Optional' : 'Required') + (prop.deprecated ? ' · **Deprecated**' : '') + '\n\n';
    markdown += tick.repeat(3) + 'ts\n' + prop.type + '\n' + tick.repeat(3) + '\n\n';
    markdown += (prop.description || 'See the [usage guides](/docs/quick-start) for how this value fits into a screen.') + '\n\n';
    if (prop.name === 'minHeaderHeight') {
      if (pkg.version === '1.5.1') markdown += '> **Unreleased:** this value is merged into `main` and is not included in npm `1.5.1`.\n\n';
      markdown += 'See [retaining part of the header](/docs/guides/headers#keep-part-of-the-header-visible) for the layout and custom tab-bar behavior.\n\n';
    }
    if (prop.deprecated) markdown += '> ' + String(prop.deprecated) + '\n\n';
    const nestedType = prop.name === 'springConfig' ? 'SpringConfig' : prop.name === 'colors' ? 'DefaultTabBarColors' : null;
    if (nestedType && interfaces[nestedType]) {
      for (const field of collectProperties(nestedType)) {
        markdown += '### ' + field.name + '\n\n' + tick + field.type + tick + '\n\n' + field.description + '\n\n';
      }
    }
  }
  if (name === 'ContainerProps') {
    markdown += '## Header render values\n\nBoth ' + tick + 'renderHeader' + tick + ' and ' + tick + 'renderPinnedHeader' + tick + ' receive ' + tick + 'HeaderRenderProps' + tick + '. Read shared values in animated styles or reactions to respond to scrolling.\n\n';
    for (const field of collectProperties('HeaderRenderProps')) {
      markdown += '### HeaderRenderProps.' + field.name + '\n\n' + tick + field.type + tick + '\n\n' + field.description + '\n\n';
    }
  }
  await writeGenerated('content/docs/api/' + slug + '.mdx', markdown.trimEnd() + '\n');
}
if (check) {
  if (staleFiles.length) {
    console.error('Generated documentation is stale. Run npm run docs:sync -- --skip-demo:\n' + staleFiles.join('\n'));
    process.exitCode = 1;
  } else console.log('Public API pages and peer requirements match the library source.');
} else console.log('Generated ' + Object.keys(apiPages).length + ' searchable API reference pages.');

if (!skipDemo) {
const demoSource = path.join(library, 'example/dist');
const demoTarget = path.join(root, 'public/demo');
async function copyDir(from, to) {
  await fs.mkdir(to, { recursive: true });
  for (const entry of await fs.readdir(from, { withFileTypes: true })) {
    if (entry.name === 'android' || entry.name === 'ios' || entry.name === 'metadata.json') continue;
    const sourcePath = path.join(from, entry.name);
    const targetPath = path.join(to, entry.name);
    if (entry.isDirectory()) await copyDir(sourcePath, targetPath);
    else await fs.copyFile(sourcePath, targetPath);
  }
}
try {
  const html = await fs.readFile(path.join(demoSource, 'index.html'), 'utf8');
  // Hashed assets can still be requested by an already-open preview. Keep
  // earlier hashes while replacing the entry document with the latest export.
  await copyDir(demoSource, demoTarget);
  await fs.writeFile(path.join(demoTarget, 'index.html'), html
    .replaceAll('"/_expo/', '"/demo/_expo/')
    .replaceAll('"/assets/', '"/demo/assets/')
    .replaceAll('"/favicon.ico"', '"/icon.svg"')
    .replace('</head>', '<link rel="stylesheet" href="/demo/frame.css" />\n</head>'));
  console.log('Copied the existing web export. The library folder was only read.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  console.warn('No existing Expo web export found. Build it in the library example, then sync again.');
}
}
