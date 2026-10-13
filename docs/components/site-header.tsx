import Link from 'next/link';
import { ArrowUpRight } from 'reicon-react/icons/ArrowUpRight';
import { Brand } from './brand';
import { HeaderActions } from './header-actions';
import { site } from '@/lib/site';

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" aria-label="Fluid Tabs home"><Brand /></Link>
        <nav className="header-links" aria-label="Main navigation">
          <Link href="/docs">Documentation</Link>
          <Link href="/examples">Examples</Link>
          <a href={site.github} target="_blank" rel="noreferrer"><span className="brand-asset github-logo" aria-hidden="true" />GitHub <ArrowUpRight size={14} aria-hidden="true" /></a>
        </nav>
        <HeaderActions />
      </div>
    </header>
  );
}
