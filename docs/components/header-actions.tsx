'use client';

import { useSearchContext } from 'fumadocs-ui/contexts/search';
import { Search } from 'reicon-react/icons/Search';
import { ThemeToggle } from './motion/theme-toggle';

export function HeaderActions() {
  const { setOpenSearch } = useSearchContext();

  return (
    <div className="header-actions">
      <button className="search-trigger" onClick={() => setOpenSearch(true)} aria-label="Search documentation" aria-keyshortcuts="Control+k Meta+k">
        <Search size={17} aria-hidden="true" />
        <span>Search docs</span>
        <kbd>⌘ K</kbd>
      </button>
      <ThemeToggle />
    </div>
  );
}
