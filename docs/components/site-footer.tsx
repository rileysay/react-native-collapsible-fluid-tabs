import Link from 'next/link';
import { Brand } from './brand';
import { site } from '@/lib/site';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <Link href="/" aria-label="Fluid Tabs home"><Brand /></Link>
        <div className="footer-links">
          <Link href="/docs">Docs</Link>
          <a href={site.github}>GitHub</a>
          <a href={site.npm}>npm</a>
        </div>
      </div>
      <div className="footer-bottom">
        <span>Made by <a href="https://github.com/rileysay">Riley</a> · Open source, MIT licensed.</span>
        <a className="footer-social" href="https://x.com/rileysay_" aria-label="Riley on X, @rileysay_"><span className="brand-asset x-logo" aria-hidden="true" />@rileysay_</a>
      </div>
    </footer>
  );
}
