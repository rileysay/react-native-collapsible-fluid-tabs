import { Container } from './components/Container';
import { Tab } from './components/Tab';
import { FlatList } from './components/FlatList';
import { ScrollView } from './components/ScrollView';
import { LegendList } from './components/LegendList';
import { DefaultTabBar } from './components/DefaultTabBar';

export const Tabs = {
  Container,
  Tab,
  FlatList,
  ScrollView,
  LegendList,
  DefaultTabBar,
};

export { Container, Tab, FlatList, ScrollView, LegendList, DefaultTabBar };
export { useTabsContext, useTabIndex } from './context';

export type {
  ContainerProps,
  TabProps,
  TabConfig,
  TabBarRenderProps,
  SpringConfig,
} from './types';
export type { TabsFlatListProps } from './components/FlatList';
export type { TabsScrollViewProps } from './components/ScrollView';
export type { TabsLegendListProps } from './components/LegendList';
export type {
  DefaultTabBarColors,
  DefaultTabBarProps,
} from './components/DefaultTabBar';
