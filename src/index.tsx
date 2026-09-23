import { Container } from './components/Container';
import { Tab } from './components/Tab';
import { FlatList } from './components/FlatList';
import { ScrollView } from './components/ScrollView';
import { LegendList } from './components/LegendList';
import { FlashList } from './components/FlashList';
import { DefaultTabBar } from './components/DefaultTabBar';

// Keep component aliases intact in declarations instead of expanding native
// component props into React Native's private generated type paths.
/** Coordinated header, pager, tab bar, and list components. Import from `/core` to omit optional adapters. */
export const Tabs: {
  Container: typeof Container;
  Tab: typeof Tab;
  FlatList: typeof FlatList;
  ScrollView: typeof ScrollView;
  LegendList: typeof LegendList;
  FlashList: typeof FlashList;
  DefaultTabBar: typeof DefaultTabBar;
} = {
  Container,
  Tab,
  FlatList,
  ScrollView,
  LegendList,
  FlashList,
  DefaultTabBar,
};

export {
  Container,
  Tab,
  FlatList,
  ScrollView,
  LegendList,
  FlashList,
  DefaultTabBar,
};
export { useTabsContext, useTabIndex } from './context';
export { useCollapsibleHeader } from './hooks';
export type { CollapsibleHeader } from './hooks';

export type {
  ContainerProps,
  TabProps,
  TabConfig,
  TabBarRenderProps,
  HeaderRenderProps,
  PullDownBehavior,
  SwipeGestureTopInset,
  SpringConfig,
  TabsRef,
} from './types';
export type { TabsFlatListProps } from './components/FlatList';
export type { TabsScrollViewProps } from './components/ScrollView';
export type { TabsLegendListProps } from './components/LegendList';
export type { TabsFlashListProps } from './components/FlashList';
export type {
  DefaultTabBarColors,
  DefaultTabBarProps,
} from './components/DefaultTabBar';
