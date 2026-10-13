import { llms, loader } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { docsContentRoute, docsImageRoute, docsRoute } from './shared';
import { defineDocs } from 'fumadocs-mdx/macro';
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';
import { createElement } from 'react';
import { asMarkdown } from 'fumadocs-core/server';
import { CompatibilityTable } from '@/components/api-properties';
import { site } from './site';

const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: pageSchema,
    postprocess: {
      includeProcessedMarkdown: { output: 'function' },
    },
  },
  meta: {
    schema: metaSchema,
  },
});

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  baseUrl: docsRoute,
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

export const docsLlms = llms(source, {
  renderPage: async (page) => `# ${page.data.title} (${page.url})

${await page.data.getText('processed', {
  components: {
    CompatibilityTable: () => {
      asMarkdown();
      return CompatibilityTable();
    },
    InstallCommand: ({ peers = false }: { peers?: boolean }) => {
      asMarkdown();
      return createElement('pre', null, createElement('code', { className: 'language-sh' }, 'npm install ' + (peers
        ? 'react-native-reanimated react-native-gesture-handler react-native-safe-area-context react-native-worklets'
        : site.packageName)));
    },
  },
})}`,
});
