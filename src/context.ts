import { createContext, useContext } from 'react';
import type { InternalTabsContextValue } from './types';

export const TabsContext = createContext<InternalTabsContextValue | null>(null);

export const TabIndexContext = createContext<number>(0);

/** Returns the container's low-level coordination state. Throws outside a Tabs.Container. Prefer useCollapsibleHeader for custom header effects. */
export function useTabsContext(): InternalTabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error(
      '[collapsible-fluid-tabs] useTabsContext must be used inside a <Tabs.Container>.'
    );
  }
  return ctx;
}

/** Index of the containing tab page. Returns 0 outside a tab page provider. */
export function useTabIndex(): number {
  return useContext(TabIndexContext);
}
