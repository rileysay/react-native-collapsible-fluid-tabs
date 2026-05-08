import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type {
  AnimatedRef,
  DerivedValue,
  SharedValue,
} from 'react-native-reanimated';
import type {
  ComposedGesture,
  GestureType,
} from 'react-native-gesture-handler';

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
  onTabPress: (index: number) => void;
}

export interface SpringConfig {
  damping?: number;
  stiffness?: number;
  mass?: number;
  overshootClamping?: boolean;
}

export interface ContainerProps {
  children: ReactNode;
  renderHeader?: () => ReactNode;
  renderPinnedHeader?: () => ReactNode;
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
}

export interface TabProps extends TabConfig {
  children: ReactNode;
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
  panGesture: ComposedGesture | GestureType;
  scrollEnabledProps: any;
}

export const TabSymbol = Symbol.for('collapsible-fluid-tabs/tab');

export interface TabComponent {
  (props: TabProps): null;
  $$typeofTab: typeof TabSymbol;
}
