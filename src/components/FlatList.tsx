import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
} from 'react';
import {
  Platform,
  type FlatListProps,
  type FlatList as RNFlatList,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useEvent,
  useScrollOffset,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';

import { useTabIndex, useTabsContext } from '../context';
import { FOOTER_GAP } from '../constants';
import { useAutoRefreshControl } from './useAutoRefreshControl';

// On web the browser scroll view should stay a plain DOM scroller; wrapping it
// in a Native GestureDetector steals horizontal pointer drags from the pager.
const USE_DIRECT_WEB_SCROLL = Platform.OS === 'web';
const FLAT_LIST_SCROLL_EVENT_NAMES = [
  'onScroll',
  'onMomentumScrollBegin',
  'onMomentumScrollEnd',
] as const;
// Host detector, NOT VirtualGestureDetector: virtual Native gestures get no
// touch events on Android, which kills the mid-momentum page swipe. See the
// listNativeGestures note in Container.tsx.
const ListDetector = GestureDetector;

export type TabsFlatListProps<T> = Omit<
  FlatListProps<T>,
  'onScroll' | 'scrollEventThrottle' | 'ref'
> & {
  minContentHeight?: number;
};

function TabsFlatListInner<T>(
  props: TabsFlatListProps<T>,
  forwardedRef: React.Ref<RNFlatList<T>>
) {
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

  const ref = listRefs[index] as AnimatedRef<RNFlatList<T>>;
  const nativeGesture = listNativeGestures[index];
  const pageScrollY = perPageScrollY[index];
  useScrollOffset(!USE_DIRECT_WEB_SCROLL ? ref : undefined, pageScrollY);
  useFlatListNativeScrollBridge({
    enabled: !USE_DIRECT_WEB_SCROLL,
    ref,
    scrollY,
    scrollToTopIndex,
    activeIndex,
    momentumActive,
    usesCustomPullSV,
    index,
  });
  const refreshControl = useAutoRefreshControl(
    props.refreshControl,
    nativeGesture
  );

  useImperativeHandle(
    forwardedRef,
    () => (ref as unknown as React.MutableRefObject<RNFlatList<T>>).current!,
    [ref]
  );

  const headerSpacerStyle = useAnimatedStyle(() => ({
    height: headerHeight.value + pinnedHeaderHeight + topInset + tabBarHeight,
  }));

  const footerSpacerStyle = useAnimatedStyle(() => ({
    height: tabBarHeight + bottomInset + FOOTER_GAP,
  }));

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
        <Animated.View style={footerSpacerStyle} />
      </>
    ),
    [userListFooter, footerSpacerStyle]
  );

  const minHeight = props.minContentHeight ?? minPageContentHeight;
  const contentContainerStyle = [{ minHeight }, props.contentContainerStyle];
  const AnimatedFlatList =
    Animated.FlatList as unknown as React.ComponentType<any>;

  const list = (
    <AnimatedFlatList
      {...(props as FlatListProps<T>)}
      ref={ref}
      refreshControl={refreshControl}
      scrollEventThrottle={1}
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

function useFlatListNativeScrollBridge({
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
      if (scrollToTopIndex.value === index) return;
      if (activeIndex.value !== index) return;
      const preserveCustomPull =
        usesCustomPullSV.value && scrollY.value < 0 && offset <= 1;
      if (!preserveCustomPull) {
        scrollY.value = offset;
      }
    }
  }, FLAT_LIST_SCROLL_EVENT_NAMES) as unknown as WorkletEventHandler;

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

function renderInjected(
  node: FlatListProps<unknown>['ListHeaderComponent']
): React.ReactNode {
  if (!node) return null;
  if (typeof node === 'function') {
    const Comp = node as React.ComponentType;
    return <Comp />;
  }
  return node as React.ReactNode;
}

export const FlatList = forwardRef(TabsFlatListInner) as <T>(
  props: TabsFlatListProps<T> & { ref?: React.Ref<RNFlatList<T>> }
) => React.ReactElement;
