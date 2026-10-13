import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'reicon-react/icons/ArrowRight';
import { ArrowUpRight } from 'reicon-react/icons/ArrowUpRight';
import { DemoPlayer } from '@/components/demo-player';
import { demos } from '@/lib/demos';

export const metadata: Metadata = { title: 'Examples', description: 'Try Fluid Tabs in a real interactive React Native web example.' };
export default function Examples() {
  return <main id="main-content" className="examples-main">
    <div className="page-heading"><h1>Examples</h1><p>Try the X, Instagram, and Lab demos with collapsing headers and swipeable tabs.</p></div>
    <section className="example-workbench">
      <DemoPlayer demo={demos[0]} />
      <div className="example-explainer"><span className="eyebrow"><span className="status-dot" /> {(demos[0].video || demos[0].image) ? 'PROFILE EXAMPLE' : 'INTERACTIVE WEB EXAMPLE'}</span><h2>Try the demos</h2><p>Open X, Instagram, or the Lab from the home screen. Each demo runs on React Native Web.</p>
        <ol className="try-list">
          <li><span>01</span><div><strong>Choose an example</strong><p>X shows a social profile, Instagram shows a photo grid, and the Lab provides configuration controls.</p></div></li>
          <li><span>02</span><div><strong>Scroll</strong><p>Scroll the list to collapse the header while the tab bar stays visible.</p></div></li>
          <li><span>03</span><div><strong>Switch tabs</strong><p>Tap a tab or swipe horizontally to change pages.</p></div></li>
        </ol>
        <div className="hero-actions"><Link href="/docs/quick-start" className="button button-primary">Build this <ArrowRight size={18} aria-hidden="true" /></Link><a href="/demo" className="button button-secondary" target="_blank" rel="noreferrer">Open web demo <ArrowUpRight size={18} aria-hidden="true" /></a></div>
      </div>
    </section>
    <p className="example-note">This example runs on React Native Web. Native refresh indicators and device frame pacing are platform-specific; test those on iOS and Android. <Link href="/docs/guides/web" className="underline underline-offset-4">Read the web notes.</Link></p>
    <div className="recipe-links">
      <Link href="/docs/guides/headers" className="recipe-link"><h3>Headers ↗</h3><p>Configure collapsing and pinned headers.</p></Link>
      <Link href="/docs/guides/list-adapters" className="recipe-link"><h3>List adapters ↗</h3><p>Use FlatList, ScrollView, LegendList, or FlashList.</p></Link>
      <Link href="/docs/guides/pull-to-refresh" className="recipe-link"><h3>Pull to refresh ↗</h3><p>Configure native pull-to-refresh behavior.</p></Link>
    </div>
  </main>;
}
