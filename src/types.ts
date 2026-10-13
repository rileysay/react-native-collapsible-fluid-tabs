import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type {
  AnimatedRef,
  DerivedValue,
  SharedValue,
} from 'react-native-reanimated';

/** Metadata from {@link TabProps} supplied to a custom tab bar. */
export interface TabConfig {
  /** Unique tab identity. Changing the names or their order remounts the pager. */
  name: string;
  /** Optional tab-bar icon. The default bar supplies its tint through `color` and `tintColor`. */
  icon?: ReactNode;
  /** Visible and accessible label. With no label, the default bar shows `name` only when no icon is supplied; its accessible label always falls back to `name`. */
  label?: string;
  /**
   * Badge shown on this tab in the default tab bar. A string or number renders
   * as a count bubble; `true` renders a small dot, and `false` hides it. Custom tab bars receive it
   * on their `TabConfig` and can render it however they like.
   */
  badge?: string | number | boolean;
}

/** State and navigation supplied to {@link ContainerProps.renderTabBar}. */
export interface TabBarRenderProps {
  /** Tab metadata in page order. */
  tabs: TabConfig[];
  /** Active page's mirrored offset; negative values represent overscroll. */
  scrollY: SharedValue<number>;
  /** Tracked offsets for each page. Custom chrome should also account for
   * `scrollToTopOffset` during re-taps and negative `scrollY` during a stretched pull. */
  perPageScrollY: SharedValue<number>[];
  /** Active during same-tab scroll-to-top so header chrome can follow the
   * UI-thread driven target instead of waiting on native scroll events. */
  scrollToTopIndex?: SharedValue<number>;
  /** Animated offset to read while `scrollToTopIndex` matches the active page. */
  scrollToTopOffset?: SharedValue<number>;
  /** Number of pages. */
  tabCount: number;
  /** Collapsible header height, initially estimated and then measured. */
  headerHeight: SharedValue<number>;
  /** Selected target index; changes before a paging animation finishes. */
  activeIndex: SharedValue<number>;
  /** Fractional visual page position, clamped to the first and last pages. */
  pagerOffset: DerivedValue<number>;
  /** Width of one equal-width tab slot, measured by the default tab bar. */
  pillWidth: SharedValue<number>;
  /** Pinned header height, excluding `topInset`. */
  pinnedHeaderHeight: number;
  /** Reserved tab bar height. Custom tab bars should fit this height. */
  tabBarHeight: number;
  /** Reserved top inset. */
  topInset: number;
  /** Minimum visible height of the collapsible header once chrome collapse finishes. */
  minHeaderHeight: number;
  /** Chrome behavior while the list is pulled below its start. */
  pullDownBehavior: PullDownBehavior;
  /** Select a page, or scroll the selected page to its top when enabled. */
  onTabPress: (index: number) => void;
}

/** Physical spring settings used by {@link ContainerProps.springConfig} after a swipe. */
export interface SpringConfig {
  /** Spring damping. Defaults to 30. */
  damping?: number;
  /** Spring stiffness. Defaults to 200. */
  stiffness?: number;
  /** Spring mass. Defaults to 1. */
  mass?: number;
  /** Stop the spring at its target without overshooting. Defaults to true. */
  overshootClamping?: boolean;
}

/** Measurements supplied to {@link ContainerProps.renderHeader} and the pinned header. */
export interface HeaderRenderProps {
  /** Active page's scroll position; negative values represent overscroll. */
  scrollY: SharedValue<number>;
  /** Collapsible header height, initially estimated and then measured. */
  headerHeight: SharedValue<number>;
  /** Reserved top inset. Apply it as padding inside the pinned header if needed. */
  topInset: number;
  /** Pinned header height, excluding `topInset`. */
  pinnedHeaderHeight: number;
}

/** Pull-down chrome behavior selected by {@link ContainerProps.pullDownBehavior}. */
export type PullDownBehavior = 'stretch' | 'static';
/** Pager start exclusion configured by {@link ContainerProps.swipeGestureTopInset}. */
export type SwipeGestureTopInset = 'auto' | number;

/** Configuration for the coordinated header, tab bar, and tab pages. */
export interface ContainerProps {
  /** One or more Tabs.Tab elements. Changing tab names, count, or order resets pager and page state. */
  children: ReactNode;
  /** Collapsible header rendered above the tab bar. Its height is measured automatically. */
  renderHeader?: (props: HeaderRenderProps) => ReactNode;
  /** Fixed top header. Its content should include any desired padding for `topInset`. */
  renderPinnedHeader?: (props: HeaderRenderProps) => ReactNode;
  /**
   * Height of the pinned header, excluding the safe-area top inset (which is
   * added to the wrapper's height). Omit it to measure the rendered pinned
   * header, including its own top-inset padding, then subtract that inset.
   * An explicit height avoids the first-frame measurement adjustment.
   */
  pinnedHeaderHeight?: number;
  /**
   * Top inset reserved by the container. Defaults to the device safe-area
   * inset. Set to 0 to let chrome and content reach the status-bar/notch area,
   * or when an ancestor already handles that inset. Negative values clamp to 0;
   * non-finite values fall back to the device inset.
   */
  topInset?: number;
  /**
   * Minimum height of the collapsible header left visible after scrolling.
   * The tab bar stops below this strip instead of under the top inset alone.
   * Defaults to 0 (header may collapse fully). Clamped to the measured header height.
   */
  minHeaderHeight?: number;
  /** Reserved tab bar height in layout units. Defaults to 56. */
  tabBarHeight?: number;
  /** Tab to start on. Defaults to 0; rounded and clamped to the available pages. Read once at mount. */
  initialIndex?: number;
  /**
   * Controlled active tab: a new external value navigates to that tab.
   * Gestures and taps still move the pager directly and report via
   * `onIndexChange` — commit that value back to your state to keep the pair
   * in sync. An echoed report acknowledges navigation without restarting it
   * or undoing a newer swipe. Omit it (or pass `undefined`)
   * for uncontrolled behavior driven by `initialIndex`, gestures, and the
   * imperative ref.
   */
  index?: number;
  /** Reports the selected navigation target without waiting for animation
   * completion. Gesture notifications reach React asynchronously; obsolete
   * queued notifications may be coalesced during rapid navigation. */
  onIndexChange?: (index: number) => void;
  /**
   * Tapping the already-active tab scrolls its list back to the top (the X
   * behavior). Defaults to `true`; set `false` to make re-taps inert.
   */
  scrollToTopOnTabPress?: boolean;
  /** Custom tab bar; omit for the default pill bar, or return null to hide it. Set tabBarHeight to 0 to remove its reserved space. */
  renderTabBar?: (props: TabBarRenderProps) => ReactNode;
  /** Style for the outer container. Give it a bounded width and height. */
  containerStyle?: StyleProp<ViewStyle>;
  /** Enable horizontal paging gestures. Defaults to true; tab presses and ref navigation still work when false. */
  swipeEnabled?: boolean;
  /** Allow vertical dragging on the collapsible header and tab bar. Defaults to true. */
  headerScrollEnabled?: boolean;
  /** Minimum horizontal travel before the direction rule can select paging. Defaults to 15 dp. */
  swipeActivationDistance?: number;
  /** Minimum vertical travel before a clearly vertical drag yields to scrolling. Defaults to 10 dp. */
  swipeFailDistance?: number;
  /**
   * Required dominance of one axis over the other. Defaults to 1.4; values
   * below 1 are clamped to 1. Ambiguous diagonals yield to scrolling after
   * twice the larger activation distance. Direction locks until release.
   */
  swipeDirectionRatio?: number;
  /**
   * @deprecated Ignored. Direction recognition now uses the same ratio and
   * distances during momentum as at rest. Use swipeDirectionRatio,
   * swipeActivationDistance and swipeFailDistance to tune recognition.
   */
  momentumSwipeFailDistance?: number;
  /**
   * Top area where the horizontal pager pan should not activate. `'auto'`
   * (default) follows the currently visible pinned header, safe-area inset,
   * collapsible header, and tab bar. A number reserves a fixed area instead.
   * Pass `0` to allow pager swipes from the full page height.
   */
  swipeGestureTopInset?: SwipeGestureTopInset;
  /** Spring for gesture releases. Programmatic navigation uses a timing animation. */
  springConfig?: SpringConfig;
  /**
   * Minimum content height per page, so short or empty pages can still
   * scroll far enough to hold the fully-collapsed chrome. Defaults to the
   * measured container height plus the measured header height. Longer content
   * can scroll further. Per-list `minContentHeight` overrides it for one page.
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
   * scroll state is preserved when returning to a tab. Defaults to false.
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
   *   platforms (`progressViewOffset` is injected automatically; pass your
   *   own to override). iOS stretch mode offsets its native indicator below
   *   the pinned header and top inset. Android stretch uses a built-in
   *   indicator and does not apply native indicator styling props.
   *
   * The web wrappers do not implement native pull-to-refresh gestures.
   */
  pullDownBehavior?: PullDownBehavior;
}

/** A named page declared as a child of the container; see {@link ContainerProps.children}. */
export interface TabProps extends TabConfig {
  /** Page content, normally one coordinated list wrapper. */
  children: ReactNode;
}

/** Imperative navigation exposed by the container's ref. */
export interface TabsRef {
  /** Move to a tab, animated by default. Indices round and clamp; non-finite values select 0. Reports through onIndexChange. */
  setIndex: (index: number, animated?: boolean) => void;
  /** Current selected target index, even while its animation is settling. */
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
  minHeaderHeight: number;
  bottomInset: number;
  minPageContentHeight: number;
  listRefs: AnimatedRef<any>[];
  listMounted: SharedValue<boolean>[];
  listScrollMetrics: SharedValue<
    import('./utils/scrollMetrics').ListScrollMetrics
  >[];
  perPageScrollY: SharedValue<number>[];
  scrollToTopIndex: SharedValue<number>;
  scrollToTopOffset: SharedValue<number>;
  scrollHandlers: any[];
  /** Per-tab Native gestures wrapping each scroll view. They `requireToFail`
   * the pager pan so the list stays frozen during a horizontal page swipe. */
  listNativeGestures: any[];
  /** Native refresh controls wait for the same horizontal direction decision. */
  pagerPanGesture: any;
  /** Vertical chrome scrolling and Android stretched pull. Tab-bar taps wait
   * for it to fail so a drag cannot also select a tab on release. */
  pullPanGesture: any;
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
