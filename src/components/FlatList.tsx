import React, { forwardRef, useImperativeHandle, useMemo } from 'react';
import {
  Platform,
  type FlatListProps,
  type FlatList as RNFlatList,
} from 'react-native';
import {
  GestureDetector,
  VirtualGestureDetector,
} from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useTabIndex, useTabsContext } from '../context';
import { FOOTER_GAP } from '../constants';
import { useAutoRefreshControl } from './useAutoRefreshControl';

// Web uses the standalone host GestureDetector; native uses VirtualGestureDetector
// under the Container's InterceptingGestureDetector. See Container's IS_WEB note.
const ListDetector =
  Platform.OS === 'web' ? GestureDetector : VirtualGestureDetector;

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

  return (
    <ListDetector gesture={nativeGesture}>
      <AnimatedFlatList
        {...(props as FlatListProps<T>)}
        ref={ref}
        refreshControl={refreshControl}
        onScroll={scrollHandler}
        scrollEventThrottle={1}
        directionalLockEnabled
        nestedScrollEnabled
        showsVerticalScrollIndicator={
          props.showsVerticalScrollIndicator ?? false
        }
        ListHeaderComponent={ListHeaderComponent}
        ListFooterComponent={ListFooterComponent}
        contentContainerStyle={contentContainerStyle}
      />
    </ListDetector>
  );
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
