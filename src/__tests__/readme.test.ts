/// <reference types="node" />
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (path: string) =>
  readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

it('keeps the README quick start identical to its type-checked fixture', () => {
  const readme = read(join(__dirname, '..', '..', 'README.md'));
  const fixture = read(join(__dirname, 'readme-quick-start.typecheck.tsx'));
  const block = readme.match(/## Quick start[\s\S]*?```tsx\n([\s\S]*?)```/);

  expect(block?.[1]).toBe(fixture);
});
