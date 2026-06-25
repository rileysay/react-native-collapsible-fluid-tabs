import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type {
  AnimatedRef,
  DerivedValue,
  SharedValue,
} from 'react-native-reanimated';

export interface TabConfig {
  name: string;
  icon?: ReactNode;
  label?: string;
  /**
   * Badge shown on this tab in the default tab bar. A string or number renders
   * as a count bubble; `true` renders a small dot. Custom tab bars receive it
   * on their `TabConfig` and can render it however they like.
   */
  badge?: string | number | boolean;
}

export interface TabBarRenderProps {
  tabs: TabConfig[];
  scrollY: SharedValue<number>;
  /** Per-tab scroll offsets — tab bar motion must read the active page's value
   *  (same as the collapsing header) rather than the mirrored `scrollY`. */
  perPageScrollY: SharedValue<number>[];
  /** Active during same-tab scroll-to-top so header chrome can follow the
   * UI-thread driven target instead of waiting on native scroll events. */
  scrollToTopIndex?: SharedValue<number>;
  scrollToTopOffset?: SharedValue<number>;
  tabCount: number;
  headerHeight: SharedValue<number>;
  activeIndex: SharedValue<number>;
  pagerOffset: DerivedValue<number>;
  pillWidth: SharedValue<number>;
  pinnedHeaderHeight: number;
  tabBarHeight: number;
  topInset: number;
  pullDownBehavior: PullDownBehavior;
  onTabPress: (index: number) => void;
}

export interface SpringConfig {
  damping?: number;
  stiffness?: number;
  mass?: number;
  overshootClamping?: boolean;
}

export interface HeaderRenderProps {
  scrollY: SharedValue<number>;
  headerHeight: SharedValue<number>;
  topInset: number;
  pinnedHeaderHeight: number;
}

export type PullDownBehavior = 'stretch' | 'static';
export type SwipeGestureTopInset = 'auto' | number;

export interface ContainerProps {
  children: ReactNode;
  renderHeader?: (props: HeaderRenderProps) => ReactNode;
  renderPinnedHeader?: (props: HeaderRenderProps) => ReactNode;
  /**
   * Height of the pinned header, excluding the safe-area top inset (which is
   * added for you). Omit it to auto-measure the rendered pinned header —
   * passing an explicit height just avoids a first-frame adjustment.
   */
  pinnedHeaderHeight?: number;
  tabBarHeight?: number;
  /** Tab to start on. Read once at mount; see `index` for controlled use. */
  initialIndex?: number;
  /**
   * Controlled active tab: whenever this prop changes, the pager animates to
   * it. Gestures and taps still move the pager directly and report via
   * `onIndexChange` — commit that value back to your state to keep the pair
   * in sync (the usual controlled pattern). Omit it (or pass `undefined`)
   * for uncontrolled behavior driven by `initialIndex`, gestures, and the
   * imperative ref.
   */
  index?: number;
  onIndexChange?: (index: number) => void;
  /**
   * Tapping the already-active tab scrolls its list back to the top (the X
   * behavior). Defaults to `true`; set `false` to make re-taps inert.
   */
  scrollToTopOnTabPress?: boolean;
  renderTabBar?: (props: TabBarRenderProps) => ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  swipeEnabled?: boolean;
  swipeActivationDistance?: number;
  swipeFailDistance?: number;
  /**
   * Vertical fail distance (dp) that replaces `swipeFailDistance` while the
   * active list is momentum-scrolling, and for the remainder of any touch
   * that grabs (catches) that momentum. A finger landing on a moving list
   * drifts vertically far more than one starting a swipe at rest, so the
   * tight at-rest threshold would almost always fail the horizontal pan
   * before it could activate. Defaults to 40.
   */
  momentumSwipeFailDistance?: number;
  /**
   * Top area where the horizontal pager pan should not activate. `'auto'`
   * (default) excludes the pinned header, safe-area inset, collapsible header,
   * and tab bar so touches over profile/header chrome keep behaving like
   * vertical list scroll/refresh gestures. Pass `0` to allow pager swipes from
   * the full page height.
   */
  swipeGestureTopInset?: SwipeGestureTopInset;
  springConfig?: SpringConfig;
  /**
   * Minimum content height per page, so short or empty pages can still
   * scroll far enough to hold the fully-collapsed chrome. Defaults to the
   * measured container height plus the measured header height — exactly the
   * collapse range, no scrolling past it. Per-list `minContentHeight`
   * overrides it for one page.
   */
  minPageContentHeight?: number;
  /**
   * Optional first-frame estimate for the collapsible header height. The real
   * measured height still wins after layout, but this keeps list spacers from
   * starting at 0 and jumping on the first scroll.
   */
  estimatedHeaderHeight?: number;
  /**
   * Lazily mount tab pages as they are visited. Mounted tabs stay mounted so
   * scroll state is preserved when returning to a tab.
   */
  lazy?: boolean;
  /**
   * Number of neighboring tabs to mount before they are visited when `lazy` is
   * enabled. Defaults to 1 so adjacent swipe targets are ready.
   */
  lazyPreloadDistance?: number;
  /**
   * How the page behaves on pull-down at the top.
   *
   * - `'stretch'` — the whole page rides down with the pull: the collapsible
   *   header and tab bar translate down while the pinned header stays put,
   *   revealing the refresh indicator near the top of the screen. On iOS
   *   this rides the native bounce with the native RefreshControl. Android
   *   has no native bounce, so the Container drives the pull itself: the
   *   native SwipeRefreshLayout is suppressed and a built-in indicator is
   *   shown instead — your `refreshControl` element's `refreshing` and
   *   `onRefresh` still drive it, no API change.
   * - `'static'` (default) — chrome stays put; the native RefreshControl
   *   appears between the header chrome and the list content on both
   *   platforms (`progressViewOffset` is injected automatically on Android;
   *   pass your own to override).
   */
  pullDownBehavior?: PullDownBehavior;
}

export interface TabProps extends TabConfig {
  children: ReactNode;
}

export interface TabsRef {
  /** Programmatically move to a tab. Animated by default. */
  setIndex: (index: number, animated?: boolean) => void;
  /** The current active tab index. */
  getIndex: () => number;
}

export interface InternalTabsContextValue {
  scrollY: SharedValue<number>;
  headerHeight: SharedValue<number>;
  activeIndex: SharedValue<number>;
  momentumActive: SharedValue<boolean>;
  pagerOffset: DerivedValue<number>;
  pillWidth: SharedValue<number>;
  pinnedHeaderHeight: number;
  headerHeightValue: number;
  tabBarHeight: number;
  topInset: number;
  bottomInset: number;
  minPageContentHeight: number;
  listRefs: AnimatedRef<any>[];
  perPageScrollY: SharedValue<number>[];
  scrollToTopIndex: SharedValue<number>;
  scrollToTopOffset: SharedValue<number>;
  scrollHandlers: any[];
  /** Per-tab Native gestures wrapping each scroll view. They `requireToFail`
   * the pager pan so the list stays frozen during a horizontal page swipe. */
  listNativeGestures: any[];
  pullDownBehavior: PullDownBehavior;
  usesCustomPullSV: SharedValue<boolean>;
  /**
   * True when the Container drives pull-to-refresh itself (Android `stretch`
   * mode): the native SwipeRefreshLayout is suppressed and the wrappers
   * report their RefreshControl's `refreshing`/`onRefresh` instead.
   */
  usesCustomPull: boolean;
  /** Wrappers report the active RefreshControl config for the custom pull. */
  reportRefreshConfig: (
    index: number,
    config: { refreshing: boolean; onRefresh?: () => void } | null
  ) => void;
}

export const TabSymbol = Symbol.for('collapsible-fluid-tabs/tab');

export interface TabComponent {
  (props: TabProps): null;
  $$typeofTab: typeof TabSymbol;
}
