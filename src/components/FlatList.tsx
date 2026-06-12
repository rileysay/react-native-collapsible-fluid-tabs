import React, { forwardRef, useImperativeHandle, useMemo } from 'react';
import {
  Platform,
  type FlatListProps,
  type FlatList as RNFlatList,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useTabIndex, useTabsContext } from '../context';
import { FOOTER_GAP } from '../constants';
import { useAutoRefreshControl } from './useAutoRefreshControl';

// On web the browser scroll view should stay a plain DOM scroller; wrapping it
// in a Native GestureDetector steals horizontal pointer drags from the pager.
const USE_DIRECT_WEB_SCROLL = Platform.OS === 'web';
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

  const ref = ctx.listRefs[index] as React.Ref<RNFlatList<T>>;
  const nativeGesture = ctx.listNativeGestures[index];
  // Reuse the Container's shared UI-thread scroll handler, same as
  // Tabs.ScrollView and Tabs.FlashList. Negative (overscroll) values are
  // clamped downstream by collapseTranslateY / the tab bar / collapseProgress,
  // so no per-list clamping is needed here.
  const scrollHandler = ctx.scrollHandlers[index];
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
    height:
      ctx.headerHeight.value +
      ctx.pinnedHeaderHeight +
      ctx.topInset +
      ctx.tabBarHeight,
  }));

  const footerSpacerStyle = useAnimatedStyle(() => ({
    height: ctx.tabBarHeight + ctx.bottomInset + FOOTER_GAP,
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

  const minHeight = props.minContentHeight ?? ctx.minPageContentHeight;
  const contentContainerStyle = [{ minHeight }, props.contentContainerStyle];
  const AnimatedFlatList =
    Animated.FlatList as unknown as React.ComponentType<any>;

  const list = (
    <AnimatedFlatList
      {...(props as FlatListProps<T>)}
      ref={ref}
      refreshControl={refreshControl}
      onScroll={scrollHandler}
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
