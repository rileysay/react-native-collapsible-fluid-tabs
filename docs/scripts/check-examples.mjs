import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const library = path.resolve(process.argv[2] ?? path.join(root, '..'));
const virtualRoot = path.join(library, '.docs-typecheck');
const sources = new Map();
const labels = new Map();
function normalize(filename) { return path.resolve(filename).replaceAll('\\', '/'); }
async function addExample(filename, virtualName) {
  const markdown = await fs.readFile(filename, 'utf8');
  const blocks = [...markdown.matchAll(/```tsx[^\n]*\n([\s\S]*?)```/g)].map((match) => match[1]);
  const code = blocks.find((block) => /export (default )?function/.test(block));
  if (!code) throw new Error('No complete TSX example found in ' + filename);
  const virtualFile = normalize(path.join(virtualRoot, virtualName));
  sources.set(virtualFile, code);
  labels.set(virtualFile, filename);
}
await addExample(path.join(root, 'content/docs/quick-start.mdx'), 'ProfileScreen.tsx');
await addExample(path.join(root, 'content/docs/installation.mdx'), 'Providers.tsx');
await addExample(path.join(root, 'content/docs/api/hooks.mdx'), 'HeaderOverlay.tsx');
await addExample(path.join(root, 'content/docs/guides/headers.mdx'), 'PassThroughProfile.tsx');

// Type-check the complete examples against the built public declarations,
// using the library workspace's installed peers. No example is executed.
const config = ts.readConfigFile(path.join(library, 'tsconfig.json'), ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, library);
const options = {
  ...parsed.options,
  noEmit: true,
  types: [],
  paths: {
    'react-native-collapsible-fluid-tabs': [path.join(library, 'lib/typescript/src/index.d.ts')],
    'react-native-collapsible-fluid-tabs/*': [path.join(library, 'lib/typescript/src/*')],
  },
};
const host = ts.createCompilerHost(options);
const originalRead = host.readFile.bind(host);
const originalExists = host.fileExists.bind(host);
const originalDirectoryExists = host.directoryExists?.bind(host);
host.readFile = (filename) => sources.get(normalize(filename)) ?? originalRead(filename);
host.fileExists = (filename) => sources.has(normalize(filename)) || originalExists(filename);
host.directoryExists = (directory) => normalize(directory) === normalize(virtualRoot) || Boolean(originalDirectoryExists?.(directory));
host.getSourceFile = (filename, languageVersion) => {
  const text = host.readFile(filename);
  return text === undefined ? undefined : ts.createSourceFile(filename, text, languageVersion, true);
};
const program = ts.createProgram([...sources.keys()], options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (filename) => labels.get(normalize(filename)) ?? filename,
    getCurrentDirectory: () => root,
    getNewLine: () => '\n',
  }));
  process.exitCode = 1;
} else console.log('Passed: quick start, provider setup, hook, and header pass-through examples compile against the public declarations.');
