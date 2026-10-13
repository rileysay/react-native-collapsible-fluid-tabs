import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'reicon-react/icons/ArrowRight';
import { ArrowUpRight } from 'reicon-react/icons/ArrowUpRight';
import { BookOpen } from 'reicon-react/icons/BookOpen';
import { InstallCommand } from '@/components/install-command';
import { NpmDownloads } from '@/components/npm-downloads';
import { MomentumVisual } from '@/components/momentum-visual';
import { FeatureArt } from '@/components/feature-art';
import { DemoPlayer } from '@/components/demo-player';
import { QuickExample } from '@/components/quick-example';
import { demos } from '@/lib/demos';
import { site } from '@/lib/site';

export default function Home() {
  return (
    <main id="main-content" className="home-main">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <div className="eyebrow"><span className="status-dot" /> A REACT NATIVE LIBRARY</div>
          <h1 id="hero-title">Some things<br />just <span className="flow-word">flow<svg viewBox="0 0 220 20" fill="none" aria-hidden="true"><path d="M4 13C58 3 128 1 214 9" stroke="currentColor" strokeWidth="5" strokeLinecap="round" /></svg></span>.</h1>
          <p className="hero-description">Collapsing headers. Swipeable tabs.<br className="desktop-break" /> Synchronized scrolling.</p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/docs/quick-start">Get started <ArrowRight size={19} aria-hidden="true" /></Link>
            <Link className="button button-secondary" href="/examples">Explore examples <ArrowUpRight size={18} aria-hidden="true" /></Link>
          </div>
          <InstallCommand />
          <NpmDownloads />
          <div className="hero-meta"><span>iOS</span><span>Android</span><span>Web</span><i /><a href={site.github + '/blob/main/LICENSE'}>MIT licensed</a></div>
        </div>
        <div className="hero-visual">
          <div className="hero-orbit orbit-one" aria-hidden="true" /><div className="hero-orbit orbit-two" aria-hidden="true" /><div className="hero-orbit orbit-three" aria-hidden="true" />
          <DemoPlayer demo={demos[0]} />
          <p className="hero-demo-caption"><span className="status-dot" /> {(demos[0].video || demos[0].image) ? 'Example recording' : 'Interactive web example'}</p>
        </div>
      </section>
      <div className="compatibility-strip">
        <span className="strip-label">WORKS WITH</span>
        <a href="https://reactnative.dev/"><span className="brand-asset react-logo" aria-hidden="true" />React Native</a>
        <a href="https://expo.dev/"><span className="brand-asset expo-logo" aria-hidden="true" />Expo</a>
        <a href="https://docs.swmansion.com/react-native-reanimated/"><span className="brand-asset swmansion-logo" aria-hidden="true" />Reanimated</a>
        <a href="https://legendapp.com/open-source/list/"><span className="brand-asset legend-logo" aria-hidden="true" />Legend List</a>
        <a href="https://shopify.github.io/flash-list/"><Image src="/brands/shopify.svg" width={20} height={20} alt="" unoptimized className="brand-shopify" />FlashList</a>
      </div>
      <section id="features" className="features-section" aria-labelledby="features-title">
        <div className="section-heading"><div><span className="eyebrow">FEATURES</span><h2 id="features-title">Headers and tabs.</h2></div></div>
        <div className="features-grid">
          <Link href="/docs/guides/headers" className="feature-card">
            <FeatureArt className="art-collapse">
              <div className="collapse-window">
                <div className="collapse-chrome">
                  <div className="mini-header"><span /><i /></div>
                  <div className="mini-tabs"><i /><i /><i /></div>
                </div>
                <div className="mini-lines">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div>
              </div>
              <svg className="art-motion-line" width="12" height="66" viewBox="0 0 12 66" fill="none">
                <path d="M1.5 6 6 1.5 10.5 6M6 1.5v63" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </FeatureArt>
            <span className="feature-number">01 / HEADERS</span><h3>Collapsing headers.</h3><p>Collapse the header as you scroll, with an optional pinned bar above the tabs.</p><span className="feature-link">Header guide <ArrowUpRight size={18} aria-hidden="true" /></span>
          </Link>
          <Link href="/docs/guides/scroll-sync" className="feature-card">
            <FeatureArt className="art-sync"><div className="sync-column"><div className="sync-content"><i /><i /><i /><i /></div></div><div className="sync-connector">↔</div><div className="sync-column"><div className="sync-content"><i /><i /><i /><i /></div></div><span className="sync-guide" /></FeatureArt>
            <span className="feature-number">02 / SCROLLING</span><h3>Synchronized scrolling.</h3><p>Share header position between tabs while retaining deeper list offsets once the header is collapsed.</p><span className="feature-link">Scroll guide <ArrowUpRight size={18} aria-hidden="true" /></span>
          </Link>
          <Link href="/docs/guides/tab-bars" className="feature-card">
            <FeatureArt className="art-tabs"><div className="illustrated-tabs"><span>Posts</span><span>Photos</span><span>About</span><i className="illustrated-pill" /></div><div className="tab-arc" /></FeatureArt>
            <span className="feature-number">03 / TABS</span><h3>Custom tab bars.</h3><p>Use the adaptive pill tab bar or build a custom bar with live animation values.</p><span className="feature-link">Tab bar guide <ArrowUpRight size={18} aria-hidden="true" /></span>
          </Link>
          <article className="feature-card">
            <MomentumVisual />
            <span className="feature-number">04 / GESTURES</span><h3>Interrupt momentum.</h3><p>Catch a scrolling list and swipe to another tab in one gesture.</p><Link href="/docs/guides/scroll-sync#gesture-direction" className="feature-link">Gesture settings <ArrowUpRight size={18} aria-hidden="true" /></Link>
          </article>
        </div>
      </section>
      <section className="composition-section" aria-labelledby="composition-title">
        <div className="composition-copy"><span className="eyebrow">USAGE</span><h2 id="composition-title">Compose a screen.</h2><p>A container connects the header, tab bar, and lists. Each tab renders one scrollable page.</p><div className="composition-steps"><div><span>01</span><p><strong>Add a header.</strong>Provide your collapsing header component.</p></div><div><span>02</span><p><strong>Add your lists.</strong>Use FlatList, ScrollView, LegendList, or FlashList.</p></div><div><span>03</span><p><strong>Configure the tabs.</strong>Set the appearance and gesture behavior.</p></div></div><Link href="/docs/quick-start" className="text-link">View quick start <ArrowRight size={18} aria-hidden="true" /></Link></div>
        <QuickExample />
      </section>
      <section className="docs-cta"><div className="docs-cta-icon"><BookOpen size={28} aria-hidden="true" /></div><div><h2>Documentation</h2><p>Installation, guides, and API reference.</p></div><Link href="/docs" className="button button-primary">Read the docs <ArrowRight size={18} aria-hidden="true" /></Link></section>
    </main>
  );
}
