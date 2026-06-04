import {
  useDerivedValue,
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { useTabsContext } from './context';

export interface CollapsibleHeader {
  /** Active page's scroll position (shared value). */
  scrollY: SharedValue<number>;
  /** Measured collapsing-header height (shared value). */
  headerHeight: SharedValue<number>;
  /** 0 = header fully expanded, 1 = fully collapsed (derived, clamped). */
  collapseProgress: DerivedValue<number>;
  /** Pinned header height (excludes the safe-area top inset). */
  pinnedHeaderHeight: number;
  /** Tab bar height. */
  tabBarHeight: number;
  /** Safe-area top inset. */
  topInset: number;
  /**
   * Y offset where scrollable content begins, i.e. the height of the fixed
   * chrome above the list (pinned header + top inset + tab bar). Handy for
   * positioning a custom sticky element or a RefreshControl.
   */
  contentTop: number;
}

/**
 * Curated view of the collapsing-header state for building custom sticky
 * elements inside a tab (filter bars, segmented controls, etc.) without
 * reaching into the raw internal context. Call inside a `<Tabs.Container>`.
 */
export function useCollapsibleHeader(): CollapsibleHeader {
  const ctx = useTabsContext();

  const collapseProgress = useDerivedValue(() => {
    'worklet';
    const h = ctx.headerHeight.value;
    if (h <= 0) return 0;
    const p = ctx.scrollY.value / h;
    return p < 0 ? 0 : p > 1 ? 1 : p;
  });

  return {
    scrollY: ctx.scrollY,
    headerHeight: ctx.headerHeight,
    collapseProgress,
    pinnedHeaderHeight: ctx.pinnedHeaderHeight,
    tabBarHeight: ctx.tabBarHeight,
    topInset: ctx.topInset,
    contentTop: ctx.pinnedHeaderHeight + ctx.topInset + ctx.tabBarHeight,
  };
}
