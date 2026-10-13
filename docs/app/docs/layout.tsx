import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';
import { DocsSidebar } from '@/components/docs-sidebar';
import { SidebarProvider, SidebarTrigger, useSidebar } from 'fumadocs-ui/layouts/docs/slots/sidebar';

export default function Layout({ children }: LayoutProps<'/docs'>) {
  const options = baseOptions();
  return (
    <DocsLayout tree={source.getPageTree()} {...options} slots={{ ...options.slots, sidebar: { root: DocsSidebar, provider: SidebarProvider, trigger: SidebarTrigger, useSidebar } }}>
      {children}
    </DocsLayout>
  );
}
