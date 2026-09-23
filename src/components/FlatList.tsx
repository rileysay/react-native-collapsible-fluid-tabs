import React, {
  forwardRef,
  useLayoutEffect,
  useImperativeHandle,
  useMemo,
} from 'react';
import {
  Platform,
  View,
  type FlatListProps,
  type FlatList as RNFlatList,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  type AnimatedRef,
} from 'react-native-reanimated';

import { useTabIndex, useTabsContext } from '../context';
import { FOOTER_GAP } from '../constants';
import { renderListComponent } from '../utils/renderListComponent';
import { useAutoRefreshControl } from './useAutoRefreshControl';
import { useTrackedScrollRef } from './useTrackedScrollRef';
import { useListScrollMetrics } from './useListScrollMetrics';

// On web the browser scroll view should stay a plain DOM scroller; wrapping it
// in a Native GestureDetector steals horizontal pointer drags from the pager.
const USE_DIRECT_WEB_SCROLL = Platform.OS === 'web';
// Host the list's Native gesture on its scrollable component.
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
  const {
    onRefresh,
    refreshing,
    progressViewOffset,
    minContentHeight,
    onScrollBeginDrag,
    onLayout,
    onContentSizeChange,
    onMomentumScrollBegin,
    onMomentumScrollEnd,
    ...listProps
  } = props;
  const ctx = useTabsContext();
  const index = useTabIndex();
  const scrollMetrics = useListScrollMetrics(ctx.listScrollMetrics[index]!, {
    onLayout,
    onContentSizeChange,
    scrollEnabled: props.scrollEnabled,
    decelerationRate: props.decelerationRate,
  });
  const {
    listRefs,
    listMounted,
    listNativeGestures,
    scrollHandlers,
    headerHeight,
    pinnedHeaderHeight,
    topInset,
    tabBarHeight,
    bottomInset,
    minPageContentHeight,
  } = ctx;

  const ref = listRefs[index] as AnimatedRef<RNFlatList<T>>;
  const trackedRef = useTrackedScrollRef(ref, listMounted[index]);
  const nativeGesture = listNativeGestures[index];
  const refreshControl = useAutoRefreshControl(
    props.refreshControl,
    nativeGesture,
    { onRefresh, refreshing, progressViewOffset }
  );

  // Android replaces the inner native scroll view when its refresh wrapper
  // changes, while the outer FlatList ref stays attached. Refresh the animated
  // ref's cached native handle so UI-thread scrollTo targets the new view too.
  useLayoutEffect(() => {
    if (Platform.OS === 'android' && ref.current) {
      ref(ref.current);
    }
  }, [ref, refreshControl]);

  useImperativeHandle(
    forwardedRef,
    () => (ref as unknown as React.MutableRefObject<RNFlatList<T>>).current!,
    [ref]
  );

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
        {renderListComponent(userListHeader)}
      </>
    ),
    [headerSpacerStyle, userListHeader]
  );

  const ListFooterComponent = useMemo(
    () => (
      <>
        {renderListComponent(userListFooter)}
        <View style={{ height: footerSpacerHeight }} />
      </>
    ),
    [userListFooter, footerSpacerHeight]
  );

  const minHeight = minContentHeight ?? minPageContentHeight;
  const contentContainerStyle = [{ minHeight }, props.contentContainerStyle];
  const AnimatedFlatList =
    Animated.FlatList as unknown as React.ComponentType<any>;

  const list = (
    <AnimatedFlatList
      {...listProps}
      ref={trackedRef}
      refreshControl={refreshControl}
      // The animated event manager follows inner native view replacements.
      // Observing only the outer ref leaves listeners on the old Android view
      // after switching between native refresh and stretched pull.
      onScroll={scrollHandlers[index]}
      {...(onScrollBeginDrag ? { onScrollBeginDrag } : {})}
      {...(onMomentumScrollBegin ? { onMomentumScrollBegin } : {})}
      {...(onMomentumScrollEnd ? { onMomentumScrollEnd } : {})}
      scrollEventThrottle={1}
      {...scrollMetrics}
      overScrollMode={props.overScrollMode ?? 'never'}
      directionalLockEnabled={props.directionalLockEnabled ?? true}
      nestedScrollEnabled={props.nestedScrollEnabled ?? true}
      showsVerticalScrollIndicator={props.showsVerticalScrollIndicator ?? false}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={ListFooterComponent}
      contentContainerStyle={contentContainerStyle}
    />
  );

  if (USE_DIRECT_WEB_SCROLL) return list;

  return <ListDetector gesture={nativeGesture}>{list}</ListDetector>;
}

export const FlatList = forwardRef(TabsFlatListInner) as <T>(
  props: TabsFlatListProps<T> & { ref?: React.Ref<RNFlatList<T>> }
) => React.ReactElement;
