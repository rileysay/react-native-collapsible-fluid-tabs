'use client';

import { createContext, use, useEffect, useRef, useState } from 'react';
import type { TOCItemType } from 'fumadocs-core/toc';
import type { TOCProviderProps } from 'fumadocs-ui/layouts/docs/page/slots/toc';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from 'fumadocs-ui/components/ui/collapsible';
import { ChevronDown, Text } from 'lucide-react';
import { getActiveSection } from '@/lib/toc-tracking';

const Context = createContext<{
  toc: TOCItemType[];
  active: string | undefined;
  select: (url: string) => void;
}>({ toc: [], active: undefined, select: () => {} });

export function DocsTOCProvider({ toc, children }: TOCProviderProps) {
  const [active, setActive] = useState<string>();
  const selectedAnchor = useRef<{ url: string; top: number } | undefined>(undefined);
  const select = (url: string) => {
    const heading = document.getElementById(decodeURIComponent(url.slice(1)));
    const page = document.scrollingElement;
    if (!heading || !page) return;
    const offset = parseFloat(getComputedStyle(heading).scrollMarginTop) || 0;
    const top = Math.max(0, Math.min(page.scrollHeight - page.clientHeight, page.scrollTop + heading.getBoundingClientRect().top - offset));
    selectedAnchor.current = { url, top };
    setActive(url);
  };

  useEffect(() => {
    const headings = toc.flatMap((item) => {
      const element = document.getElementById(decodeURIComponent(item.url.slice(1)));
      return element ? [{ url: item.url, element }] : [];
    });
    let frame = 0;
    let disposed = false;
    selectedAnchor.current = undefined;
    const update = () => {
      frame = 0;
      const page = document.scrollingElement;
      if (!page) return;
      let current = getActiveSection(headings.map(({ url, element }) => ({
        url,
        top: element.getBoundingClientRect().top + page.scrollTop,
        scrollMarginTop: parseFloat(getComputedStyle(element).scrollMarginTop) || 0,
      })), {
        scrollTop: page.scrollTop,
        viewportHeight: page.clientHeight,
        scrollHeight: page.scrollHeight,
      });
      // Preserve a clicked short section when its anchor is clamped to page end.
      const selected = selectedAnchor.current;
      if (selected && Math.abs(page.scrollTop - selected.top) <= 2) current = selected.url;
      else selectedAnchor.current = undefined;
      setActive(current);
    };
    const schedule = () => {
      if (!disposed && !frame) frame = requestAnimationFrame(update);
    };
    const resize = new ResizeObserver(schedule);
    const article = document.getElementById('nd-page');
    if (article) resize.observe(article);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const hashChange = () => {
      const heading = headings.find((item) => item.url === window.location.hash);
      const page = document.scrollingElement;
      if (heading && page) selectedAnchor.current = { url: heading.url, top: page.scrollTop };
      schedule();
    };
    window.addEventListener('hashchange', hashChange);
    window.addEventListener('pageshow', schedule);
    void document.fonts.ready.then(schedule);
    hashChange();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('hashchange', hashChange);
      window.removeEventListener('pageshow', schedule);
    };
  }, [toc]);

  return <Context value={{ toc, active, select }}>{children}</Context>;
}

function Contents({ onSelect }: { onSelect?: () => void }) {
  const { toc, active, select } = use(Context);
  const viewport = useRef<HTMLDivElement>(null);
  const selected = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const container = viewport.current;
    if (!container) return;
    const keepVisible = () => {
      const link = selected.current;
      if (!link || !container.clientHeight) return;
      const bounds = container.getBoundingClientRect();
      const row = link.getBoundingClientRect();
      if (row.top < bounds.top || row.bottom > bounds.bottom) {
        container.scrollTop += row.top - bounds.top - (container.clientHeight - row.height) / 2;
      }
    };
    keepVisible();
    const resize = new ResizeObserver(keepVisible);
    resize.observe(container);
    return () => resize.disconnect();
  }, [active, toc]);

  return (
    <div ref={viewport} className="docs-toc-scroll">
      <nav aria-label="On this page" className="docs-toc-links">
        {toc.map((item) => (
          <a key={item.url} ref={active === item.url ? selected : undefined} href={item.url}
            aria-current={active === item.url ? 'location' : undefined}
            data-active={active === item.url} onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              select(item.url);
              onSelect?.();
            }}
            style={{ paddingInlineStart: 12 + Math.max(0, item.depth - 2) * 12 }}>
            {item.title}
          </a>
        ))}
      </nav>
    </div>
  );
}

export function DocsTOC() {
  const { toc } = use(Context);
  if (!toc.length) return <div id="nd-toc-placeholder" className="hidden xl:layout:[--fd-toc-width:268px]" />;
  return (
    <aside id="nd-toc" className="sticky top-(--fd-docs-row-1) h-[calc(var(--fd-docs-height)-var(--fd-docs-row-1))] flex flex-col [grid-area:toc] w-(--fd-toc-width) pt-12 pe-4 pb-2 xl:layout:[--fd-toc-width:268px] max-xl:hidden">
      <h3 className="inline-flex items-center gap-1.5 text-sm text-fd-muted-foreground"><Text size={16} aria-hidden />On this page</h3>
      <Contents />
    </aside>
  );
}

export function DocsTOCPopover() {
  const { toc, active } = use(Context);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const current = toc.find((item) => item.url === active);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener('pointerdown', dismiss);
    return () => window.removeEventListener('pointerdown', dismiss);
  }, [open]);

  return (
    <Collapsible ref={root} open={open} onOpenChange={setOpen} data-toc-popover=""
      className="sticky top-(--fd-docs-row-2) z-10 [grid-area:toc-popover] h-(--fd-toc-popover-height) xl:hidden max-xl:layout:[--fd-toc-popover-height:--spacing(10)]"
      onKeyDown={(event) => {
        if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
      }}>
      <div className="border-b bg-fd-background/95 backdrop-blur-sm">
        <CollapsibleTrigger ref={trigger} className="flex w-full h-10 items-center gap-2.5 px-4 text-sm text-fd-muted-foreground md:px-6">
          <Text size={16} aria-hidden />
          <span className="flex-1 truncate text-start">{open ? 'On this page' : current?.title ?? 'On this page'}</span>
          <ChevronDown size={16} aria-hidden className={open ? 'rotate-180' : undefined} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex max-h-[50vh] flex-col px-4 md:px-6"><Contents onSelect={() => setOpen(false)} /></div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
