'use client';

// Adapted from beui.dev/components/blocks/command-palette (MIT).
// Base UI supplies modal focus management; Fumadocs supplies indexed results.
import { Dialog } from '@base-ui/react/dialog';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Search } from 'reicon-react/icons/Search';
import { ArrowRight } from 'reicon-react/icons/ArrowRight';
import { EASE_OUT } from '@/lib/ease';
import type { SharedProps } from 'fumadocs-ui/contexts/search';

export type CommandItem = {
  id: string;
  label: ReactNode;
  group: string;
  icon?: ReactNode;
  description?: string;
  onSelect: () => void;
};

type CommandPaletteProps = SharedProps & {
  items: CommandItem[];
  query: string;
  onQueryChange: (query: string) => void;
  isLoading?: boolean;
  error?: boolean;
};

const PANEL_SPRING = { type: 'spring', stiffness: 560, damping: 40, mass: 0.5 } as const;

export function CommandPalette({ items, open, onOpenChange, dialogHandle, query, onQueryChange, isLoading, error }: CommandPaletteProps) {
  const uid = useId();
  const reduce = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState<{ query: string; id: string | null }>({ query: '', id: null });
  const grouped = useMemo(() => {
    const groups = new Map<string, CommandItem[]>();
    for (const item of items) {
      const group = groups.get(item.group) ?? [];
      group.push(item);
      groups.set(item.group, group);
    }
    return Array.from(groups.entries());
  }, [items]);
  const rows = useMemo(() => grouped.flatMap(([, list]) => list), [grouped]);
  const found = cursor.query === query ? rows.findIndex((item) => item.id === cursor.id) : -1;
  const active = rows.length ? Math.max(0, found) : -1;

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-index="' + active + '"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, open, rows]);

  function select(item: CommandItem) {
    onOpenChange(false);
    item.onSelect();
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} handle={dialogHandle}>
      <AnimatePresence initial={false}>
        {open && <Dialog.Portal keepMounted>
          <Dialog.Backdrop render={<motion.div
            className="command-backdrop"
            style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE_OUT } }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
          />} />
          <Dialog.Popup initialFocus={inputRef} className="command-panel" render={<motion.div
            initial={{ opacity: 0, y: reduce ? 0 : -8, scale: reduce ? 1 : 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduce ? 0 : -8, scale: reduce ? 1 : 0.97, transition: { duration: 0.12, ease: EASE_OUT } }}
            transition={reduce ? { duration: 0.1 } : PANEL_SPRING}
          />}>
            <Dialog.Title className="sr-only">Search documentation</Dialog.Title>
            <Dialog.Description className="sr-only">Search guides and API reference. Use the arrow keys to choose a result and Enter to open it.</Dialog.Description>
            <div className="command-input-row">
              <Search size={20} aria-hidden="true" />
              <input
                ref={inputRef} value={query} onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Search documentation…" aria-label="Search documentation"
                role="combobox" aria-expanded={open} aria-controls={uid + '-list'}
                aria-activedescendant={active >= 0 ? uid + '-opt-' + active : undefined}
                aria-autocomplete="list" autoComplete="off" spellCheck={false}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing || !rows.length) return;
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    const next = (active + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
                    setCursor({ query, id: rows[next].id });
                  } else if (event.key === 'Enter') {
                    event.preventDefault();
                    if (rows[active]) select(rows[active]);
                  }
                }}
              />
              <Dialog.Close className="command-close" aria-label="Close search">Esc</Dialog.Close>
            </div>
            <motion.div layoutScroll ref={listRef} id={uid + '-list'} role="listbox" aria-label="Search results" aria-busy={isLoading} className="command-list">
              {rows.length === 0 ? <div className="command-empty" role="status">
                <Search size={24} aria-hidden="true" />
                <strong>{error ? 'Search is unavailable' : isLoading ? 'Searching the docs…' : 'No results found'}</strong>
                <span>{error ? 'Try again, or browse the sidebar.' : isLoading ? 'Finding the right page for you.' : 'Try “header”, “refresh”, or a prop name.'}</span>
              </div> : grouped.map(([group, list]) => <div key={group} role="group" aria-label={group}>
                <div className="command-group-label" aria-hidden="true">{group}</div>
                {list.map((item) => {
                  const index = rows.indexOf(item);
                  const selected = index === active;
                  return <button key={item.id} id={uid + '-opt-' + index} type="button" role="option"
                    tabIndex={-1} aria-selected={selected} data-index={index} className="command-option"
                    onPointerMove={(event) => { if (event.pointerType === 'mouse') setCursor({ query, id: item.id }); }}
                    onClick={() => select(item)}>
                    {selected && <motion.span layoutId={uid + '-active'} className="command-highlight" aria-hidden="true"
                      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 480, damping: 38 }} />}
                    <span className="command-option-icon" aria-hidden="true">{item.icon}</span>
                    <span className="command-option-copy"><span>{item.label}</span>{item.description && <small>{item.description}</small>}</span>
                    <ArrowRight size={16} className="command-option-arrow" aria-hidden="true" />
                  </button>;
                })}
              </div>)}
            </motion.div>
            <div className="command-footer" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> to navigate</span><span><kbd>↵</kbd> to open</span><span className="command-footer-brand">fluidtabs.</span></div>
            <span className="sr-only" role="status">{!isLoading && query ? rows.length + ' results available.' : ''}</span>
          </Dialog.Popup>
        </Dialog.Portal>}
      </AnimatePresence>
    </Dialog.Root>
  );
}
