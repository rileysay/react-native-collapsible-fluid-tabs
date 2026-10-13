import { source } from '@/lib/source';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
} from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/components/mdx';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { getPageImageUrl, getPageMarkdownUrl } from '@/lib/shared';
import { DocsTOC, DocsTOCPopover, DocsTOCProvider } from '@/components/docs-toc';

export default async function Page(props: PageProps<'/docs/[[...slug]]'>) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const markdownUrl = getPageMarkdownUrl(page).url;
  const generatedSources: Record<string, string> = {
    'api/container.mdx': 'src/types.ts',
    'api/tab.mdx': 'src/types.ts',
    'api/tab-bar.mdx': 'src/components/DefaultTabBar.tsx',
    'api/header-values.mdx': 'src/hooks.ts',
    'api/tab-bar-values.mdx': 'src/types.ts',
    'api/ref.mdx': 'src/types.ts',
  };
  const editPath = generatedSources[page.path] ?? `docs/content/docs/${page.path}`;
  const editUrl = `https://github.com/rileysay/react-native-collapsible-fluid-tabs/edit/main/${editPath}`;

  return (
    <DocsPage
      toc={page.data.toc}
      full={page.data.full}
      slots={{ toc: { provider: DocsTOCProvider, main: DocsTOC, popover: DocsTOCPopover } }}
    >
      <span id="main-content" /><DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription className="mb-0">{page.data.description}</DocsDescription>
      <div className="flex flex-row flex-wrap gap-3 items-center border-b pb-6">
        <MarkdownCopyButton markdownUrl={markdownUrl} />
        <a className="text-xs text-fd-muted-foreground hover:text-fd-foreground" href={editUrl}>Edit this page ↗</a>
        <a className="text-xs text-fd-muted-foreground hover:text-fd-foreground" href="https://github.com/rileysay/react-native-collapsible-fluid-tabs">Library source ↗</a>
      </div>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: PageProps<'/docs/[[...slug]]'>): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
    openGraph: {
      images: getPageImageUrl(page).url,
    },
  };
}
