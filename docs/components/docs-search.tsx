'use client';

import { useDocsSearch } from 'fumadocs-core/search/client';
import { fetchClient } from 'fumadocs-core/search/client/fetch';
import type { SharedProps } from 'fumadocs-ui/contexts/search';
import { useRouter } from 'next/navigation';
import { BookOpen } from 'reicon-react/icons/BookOpen';
import { ArrowRight } from 'reicon-react/icons/ArrowRight';
import { CommandPalette, type CommandItem } from './motion/command-palette';

const client = fetchClient();
const shortcuts = [
  { label: 'Introduction', href: '/docs', group: 'Get started', description: 'An overview of Fluid Tabs and its components.' },
  { label: 'Installation', href: '/docs/installation', group: 'Get started', description: 'Add Fluid Tabs to your project.' },
  { label: 'Quick start', href: '/docs/quick-start', group: 'Get started', description: 'Build your first collapsing screen.' },
  { label: 'Tabs.Container', href: '/docs/api/container', group: 'Reference', description: 'Every prop, default, and callback.' },
  { label: 'Examples', href: '/examples', group: 'Explore', description: 'Try the X, Instagram, and Lab demos.' },
];

function plainText(value: string) {
  return value.replace(/<\/?mark>/g, '').replace(/(^|\n)>\s?/g, '$1').replaceAll('**', '').replaceAll(String.fromCharCode(96), '');
}

function HighlightedText({ value }: { value: string }) {
  return value.split(/(<mark>.*?<\/mark>)/g).map((part, index) =>
    part.startsWith('<mark>') ? <mark key={index}>{plainText(part)}</mark> : plainText(part));
}

export function DocsSearch(props: SharedProps) {
  const router = useRouter();
  const { search, setSearch, query } = useDocsSearch({ client, delayMs: 80 });
  const items: CommandItem[] = !search.trim() ? shortcuts.map((item) => ({
    id: item.href, label: item.label, group: item.group, description: item.description,
    icon: <BookOpen size={18} />, onSelect: () => router.push(item.href),
  })) : query.data && query.data !== 'empty' ? query.data.map((result) => ({
    id: result.id,
    label: <HighlightedText value={result.content} />,
    group: result.breadcrumbs?.map(plainText).filter((part) => part !== 'Documentation').join(' / ') || 'Documentation',
    icon: result.type === 'page' ? <BookOpen size={18} /> : <ArrowRight size={18} />,
    onSelect: () => router.push(result.url),
  })) : [];
  return <CommandPalette {...props} onOpenChange={(open) => { props.onOpenChange(open); if (!open) setSearch(''); }}
    query={search} onQueryChange={setSearch} items={items} isLoading={query.isLoading} error={Boolean(query.error)} />;
}
