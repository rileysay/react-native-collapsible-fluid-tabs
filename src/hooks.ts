import {
  useDerivedValue,
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { useTabsContext } from './context';
import { getHeaderScrollOffset } from './utils/paging';

/** Header measurements and animation values returned by {@link useCollapsibleHeader}. */
export interface CollapsibleHeader {
  /** Active page's scroll position (shared value). */
  scrollY: SharedValue<number>;
  /** Collapsing-header height: the initial estimate until layout provides a measurement. Zero without a header. */
  headerHeight: SharedValue<number>;
  /** 0 = fully expanded, 1 = fully collapsed (derived, clamped). Remains 0 when header height is 0. */
  collapseProgress: DerivedValue<number>;
  /** Pinned header height (excludes the safe-area top inset). */
  pinnedHeaderHeight: number;
  /** Tab bar height. */
  tabBarHeight: number;
  /** Reserved top inset (the device safe area unless Container.topInset overrides it). */
  topInset: number;
  /**
   * Fixed chrome height when the collapsing header is fully collapsed
   * (pinned header + top inset + tab bar). Excludes the collapsing header. Handy for
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
  const {
    scrollY,
    headerHeight,
    activeIndex,
    perPageScrollY,
    scrollToTopIndex,
    scrollToTopOffset,
    pinnedHeaderHeight,
    tabBarHeight,
    topInset,
  } = useTabsContext();

  const collapseProgress = useDerivedValue(() => {
    'worklet';
    const h = headerHeight.value;
    if (h <= 0) return 0;
    const offset = getHeaderScrollOffset(
      activeIndex.value,
      perPageScrollY.length,
      perPageScrollY,
      scrollY,
      scrollToTopIndex.value,
      scrollToTopOffset.value
    );
    const p = offset / h;
    return p < 0 ? 0 : p > 1 ? 1 : p;
  });

  return {
    scrollY,
    headerHeight,
    collapseProgress,
    pinnedHeaderHeight,
    tabBarHeight,
    topInset,
    contentTop: pinnedHeaderHeight + topInset + tabBarHeight,
  };
}
