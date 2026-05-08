import { createContext, useContext } from 'react';
import type { InternalTabsContextValue } from './types';

export const TabsContext = createContext<InternalTabsContextValue | null>(null);

export const TabIndexContext = createContext<number>(0);

export function useTabsContext(): InternalTabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error(
      '[collapsible-fluid-tabs] useTabsContext must be used inside a <Tabs.Container>.'
    );
  }
  return ctx;
}

export function useTabIndex(): number {
  return useContext(TabIndexContext);
}
