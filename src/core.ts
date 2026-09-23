import { Container } from './components/Container';
import { Tab } from './components/Tab';
import { FlatList } from './components/FlatList';
import { ScrollView } from './components/ScrollView';
import { DefaultTabBar } from './components/DefaultTabBar';

/** Core entry point without optional list-adapter imports or declarations. */
export const Tabs: {
  Container: typeof Container;
  Tab: typeof Tab;
  FlatList: typeof FlatList;
  ScrollView: typeof ScrollView;
  DefaultTabBar: typeof DefaultTabBar;
} = { Container, Tab, FlatList, ScrollView, DefaultTabBar };

export { Container, Tab, FlatList, ScrollView, DefaultTabBar };
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
export type {
  DefaultTabBarColors,
  DefaultTabBarProps,
} from './components/DefaultTabBar';
