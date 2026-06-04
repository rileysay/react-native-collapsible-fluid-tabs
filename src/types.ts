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
}

export interface TabBarRenderProps {
  tabs: TabConfig[];
  scrollY: SharedValue<number>;
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
  pinnedHeaderHeight?: number;
  tabBarHeight?: number;
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
  renderTabBar?: (props: TabBarRenderProps) => ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  swipeEnabled?: boolean;
  swipeActivationDistance?: number;
  swipeFailDistance?: number;
  /**
   * Top area where the horizontal pager pan should not activate. `'auto'`
   * (default) excludes the pinned header, safe-area inset, collapsible header,
   * and tab bar so touches over profile/header chrome keep behaving like
   * vertical list scroll/refresh gestures. Pass `0` to allow pager swipes from
   * the full page height.
   */
  swipeGestureTopInset?: SwipeGestureTopInset;
  springConfig?: SpringConfig;
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
   * How the collapsible header behaves on overscroll (pull-down).
   *
   * - `'stretch'` — header translates down with the pull. RefreshControl
   *   appears at the top of the screen, above the translated header. Briefly
   *   shows a gap between the pinned header and the moving collapsible
   *   header during the pull.
   * - `'static'` (default) — header stays put. List bounces independently.
   *   RefreshControl appears below the header, above the list content (use
   *   `progressViewOffset={pinnedHeaderHeight + topInset + headerHeight}` on
   *   Android to position it correctly).
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
  pagerOffset: DerivedValue<number>;
  pillWidth: SharedValue<number>;
  pinnedHeaderHeight: number;
  tabBarHeight: number;
  topInset: number;
  bottomInset: number;
  minPageContentHeight: number;
  listRefs: AnimatedRef<any>[];
  perPageScrollY: SharedValue<number>[];
  scrollHandlers: any[];
  /** Per-tab Native gestures wrapping each scroll view. They `requireToFail`
   * the pager pan so the list stays frozen during a horizontal page swipe. */
  listNativeGestures: any[];
  pullDownBehavior: PullDownBehavior;
}

export const TabSymbol = Symbol.for('collapsible-fluid-tabs/tab');

export interface TabComponent {
  (props: TabProps): null;
  $$typeofTab: typeof TabSymbol;
}
