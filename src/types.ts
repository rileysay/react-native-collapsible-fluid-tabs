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
  springConfig?: SpringConfig;
  minPageContentHeight?: number;
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
  scrollEnabled: boolean;
}

export const TabSymbol = Symbol.for('collapsible-fluid-tabs/tab');

export interface TabComponent {
  (props: TabProps): null;
  $$typeofTab: typeof TabSymbol;
}
