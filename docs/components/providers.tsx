'use client';

import type { ReactNode } from 'react';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { DocsSearch } from './docs-search';

export function Providers({ children }: { children: ReactNode }) {
  return <RootProvider theme={{ defaultTheme: 'system', enableSystem: true }} search={{ SearchDialog: DocsSearch }}>{children}</RootProvider>;
}
