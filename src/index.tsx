import { Container } from './components/Container';
import { Tab } from './components/Tab';
import { FlatList } from './components/FlatList';
import { ScrollView } from './components/ScrollView';
import { LegendList } from './components/LegendList';
import { FlashList } from './components/FlashList';
import { DefaultTabBar } from './components/DefaultTabBar';

export const Tabs = {
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
