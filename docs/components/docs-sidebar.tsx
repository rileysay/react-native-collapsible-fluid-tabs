'use client';

import { usePathname } from 'next/navigation';
import { Sidebar, type SidebarProps } from 'fumadocs-ui/layouts/docs/slots/sidebar';
import { SidebarItem, SidebarFolder, SidebarFolderTrigger, SidebarFolderLink, useFolder, useFolderDepth } from 'fumadocs-ui/components/sidebar/base';
import { useTreePath } from 'fumadocs-ui/contexts/tree';
import type { Item, Folder } from 'fumadocs-core/page-tree';
import type { ReactNode } from 'react';
import { AnimatedSidebarMenuItem, AnimatedSidebarMenuSub } from './motion/animated-sidebar';

function NavigationItem({ item }: { item: Item }) {
  const pathname = usePathname();
  const depth = useFolderDepth();
  const active = pathname === item.url;
  return (
    <AnimatedSidebarMenuItem>
      <SidebarItem href={item.url} external={item.external} active={active} aria-current={active ? 'page' : undefined} className="docs-sidebar-row" style={{ paddingInlineStart: 8 + depth * 12 }}>
        {item.icon && <span className="docs-sidebar-label">{item.icon}</span>}
        <span className="docs-sidebar-label">{item.name}</span>
      </SidebarItem>
    </AnimatedSidebarMenuItem>
  );
}

function NavigationFolder({ item, children }: { item: Folder; children: ReactNode }) {
  const path = useTreePath();
  return (
    <SidebarFolder collapsible={item.collapsible} active={path.includes(item)} defaultOpen={item.defaultOpen}>
      <FolderRow item={item} />
      <FolderContent>{children}</FolderContent>
    </SidebarFolder>
  );
}

function FolderContent({ children }: { children: ReactNode }) {
  const folder = useFolder();
  return <AnimatedSidebarMenuSub open={folder?.open ?? false}>{children}</AnimatedSidebarMenuSub>;
}

function FolderRow({ item }: { item: Folder }) {
  const pathname = usePathname();
  const depth = useFolderDepth();
  const active = item.index?.url === pathname;
  const content = <span className="docs-sidebar-label">{item.icon}{item.name}</span>;
  const props = { className: 'docs-sidebar-row', style: { paddingInlineStart: 8 + (depth - 1) * 12 } };
  return item.index
    ? <SidebarFolderLink {...props} href={item.index.url} external={item.index.external} active={active} aria-current={active ? 'page' : undefined}>{content}</SidebarFolderLink>
    : <SidebarFolderTrigger {...props}>{content}</SidebarFolderTrigger>;
}

const components = { Item: NavigationItem, Folder: NavigationFolder };

export function DocsSidebar(props: SidebarProps) {
  return <Sidebar {...props} components={components} />;
}
