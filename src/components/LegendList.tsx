import React, { useEffect, useMemo } from 'react';
import { Platform, View } from 'react-native';
import type { LegendListProps } from '@legendapp/list/react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useEvent,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';

import { useTabIndex, useTabsContext } from '../context';
import { FOOTER_GAP } from '../constants';
import { useAutoRefreshControl } from './useAutoRefreshControl';

// On web the browser scroll view should stay a plain DOM scroller; wrapping it
// in a Native GestureDetector steals horizontal pointer drags from the pager.
const USE_DIRECT_WEB_SCROLL = Platform.OS === 'web';
// LegendList offset: `sharedValues.scrollOffset` only (UI thread via
// useScrollViewOffset). The collapsing header reads that same per-page shared
// value directly in Container — no mirrored `scrollY` reaction (that lagged a
// frame and looked like jelly). Native scroll/momentum events below only sync
// `scrollY` for pull-to-refresh bookkeeping and intercept-and-swipe.
const LEGEND_LIST_SCROLL_EVENT_NAMES = [
  'onScroll',
  'onMomentumScrollBegin',
  'onMomentumScrollEnd',
] as const;
// Host detector, NOT VirtualGestureDetector: virtual Native gestures get no
// touch events on Android, which kills the mid-momentum page swipe. See the
// listNativeGestures note in Container.tsx.
const ListDetector = GestureDetector;

// @legendapp/list is an optional peer: the require lives in a try/catch so
// Metro treats it as an optional dependency (`allowOptionalDependencies`, on
// by default in Expo / RN CLI configs) and consumers without it installed can
// still import the library. Only rendering Tabs.LegendList requires it.
let AnimatedLegendList: React.ComponentType<any> | null = null;
try {
  AnimatedLegendList = require('@legendapp/list/reanimated').AnimatedLegendList;
} catch {
  // Left null; Tabs.LegendList throws a descriptive error when rendered.
}

export type TabsLegendListProps<T> = Omit<
  LegendListProps<T>,
  'onScroll' | 'scrollEventThrottle' | 'refScrollView'
> & {
  /**
   * Optional minimum content height. Defaults to the container's
   * `minPageContentHeight` (screen height + measured header height).
   */
  minContentHeight?: number;
};

export function LegendList<T>(props: TabsLegendListProps<T>) {
  if (!AnimatedLegendList) {
    throw new Error(
      '[collapsible-fluid-tabs] Tabs.LegendList requires the optional peer dependency @legendapp/list. Install it with: npm install @legendapp/list'
    );
  }
  const ctx = useTabsContext();
  const index = useTabIndex();
  const {
    listRefs,
    listNativeGestures,
    perPageScrollY,
    scrollY,
    scrollToTopIndex,
    activeIndex,
    momentumActive,
    usesCustomPullSV,
    headerHeight,
    pinnedHeaderHeight,
    topInset,
    tabBarHeight,
    bottomInset,
    minPageContentHeight,
  } = ctx;

  const ref = listRefs[index];
  const nativeGesture = listNativeGestures[index];
  const refreshControl = useAutoRefreshControl(
    props.refreshControl,
    nativeGesture
  );
  const pageScrollY = perPageScrollY[index];

  const sharedValues = useMemo(
    () => ({ scrollOffset: pageScrollY }),
    [pageScrollY]
  );

  useLegendListNativeScrollBridge({
    enabled: !USE_DIRECT_WEB_SCROLL,
    ref,
    scrollY,
    scrollToTopIndex,
    activeIndex,
    momentumActive,
    usesCustomPullSV,
    index,
  });

  const headerSpacerStyle = useAnimatedStyle(() => ({
    height: headerHeight.value + pinnedHeaderHeight + topInset + tabBarHeight,
  }));

  // Static per layout (no shared values), so a plain View — an animated
  // style here would register a do-nothing Reanimated mapper per page.
  // Just the safe-area inset + breathing room: the tab bar is top chrome and
  // never overlaps the list bottom.
  const footerSpacerHeight = bottomInset + FOOTER_GAP;

  const userListHeader = props.ListHeaderComponent;
  const userListFooter = props.ListFooterComponent;

  const ListHeaderComponent = useMemo(
    () => (
      <>
        <Animated.View style={headerSpacerStyle} />
        {renderInjected(userListHeader)}
      </>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userListHeader]
  );

  const ListFooterComponent = useMemo(
    () => (
      <>
        {renderInjected(userListFooter)}
        <View style={{ height: footerSpacerHeight }} />
      </>
    ),
    [userListFooter, footerSpacerHeight]
  );

  const minHeight = props.minContentHeight ?? minPageContentHeight;

  const contentContainerStyle = [{ minHeight }, props.contentContainerStyle];

  const Component = AnimatedLegendList as unknown as React.ComponentType<any>;

  const list = (
    <Component
      {...(props as LegendListProps<T>)}
      refScrollView={ref}
      refreshControl={refreshControl}
      sharedValues={sharedValues}
      overScrollMode={props.overScrollMode ?? 'never'}
      directionalLockEnabled
      nestedScrollEnabled
      showsVerticalScrollIndicator={props.showsVerticalScrollIndicator ?? false}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={ListFooterComponent}
      contentContainerStyle={contentContainerStyle}
    />
  );

  if (USE_DIRECT_WEB_SCROLL) return list;

  return <ListDetector gesture={nativeGesture}>{list}</ListDetector>;
}

type ReanimatedScrollEvent = {
  eventName?: string;
  contentOffset: { x: number; y: number };
};

type WorkletEventHandler = {
  workletEventHandler: {
    registerForEvents: (tag: number) => void;
    unregisterFromEvents: (tag: number) => void;
  };
};

function useLegendListNativeScrollBridge({
  enabled,
  ref,
  scrollY,
  scrollToTopIndex,
  activeIndex,
  momentumActive,
  usesCustomPullSV,
  index,
}: {
  enabled: boolean;
  ref: AnimatedRef<any> | undefined;
  scrollY: SharedValue<number>;
  scrollToTopIndex: SharedValue<number>;
  activeIndex: SharedValue<number>;
  momentumActive: SharedValue<boolean>;
  usesCustomPullSV: SharedValue<boolean>;
  index: number;
}) {
  const eventHandler = useEvent<ReanimatedScrollEvent>((event) => {
    'worklet';
    const offset =
      event.contentOffset.x === 0
        ? event.contentOffset.y
        : event.contentOffset.x;

    if (event.eventName?.endsWith('onMomentumScrollEnd')) {
      momentumActive.value = false;
    } else if (
      event.eventName?.endsWith('onMomentumScrollBegin') &&
      activeIndex.value === index
    ) {
      momentumActive.value = true;
    } else if (event.eventName?.endsWith('onScroll')) {
      if (activeIndex.value !== index) return;
      if (scrollToTopIndex.value === index) return;
      const preserveCustomPull =
        usesCustomPullSV.value && scrollY.value < 0 && offset <= 1;
      if (!preserveCustomPull) {
        scrollY.value = offset;
      }
    }
  }, LEGEND_LIST_SCROLL_EVENT_NAMES) as unknown as WorkletEventHandler;

  useEffect(() => {
    if (!enabled || !ref) return;

    return ref.observe((tag) => {
      if (!tag) return;

      eventHandler.workletEventHandler.registerForEvents(tag);
      return () => {
        eventHandler.workletEventHandler.unregisterFromEvents(tag);
      };
    });
  }, [enabled, eventHandler, ref]);
}

function renderInjected(node: unknown): React.ReactNode {
  if (!node) return null;
  if (typeof node === 'function') {
    const Comp = node as React.ComponentType;
    return <Comp />;
  }
  return node as React.ReactNode;
}
