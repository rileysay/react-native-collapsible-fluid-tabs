import React, { useImperativeHandle } from 'react';
import {
  Platform,
  type ScrollViewProps,
  type ScrollView as RNScrollView,
  View,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useTabIndex, useTabsContext } from '../context';
import { FOOTER_GAP } from '../constants';
import { useAutoRefreshControl } from './useAutoRefreshControl';
import { useTrackedScrollRef } from './useTrackedScrollRef';
import { useListScrollMetrics } from './useListScrollMetrics';
import { SingleHeaderPage } from './SingleHeader';

// On web the browser scroll view should stay a plain DOM scroller; wrapping it
// in a Native GestureDetector steals horizontal pointer drags from the pager.
const USE_DIRECT_WEB_SCROLL = Platform.OS === 'web';
// Host the list's Native gesture on its scrollable component.
const ListDetector = GestureDetector;
type NativeScrollViewRef = React.ComponentRef<typeof RNScrollView>;

export type TabsScrollViewProps = Omit<
  ScrollViewProps,
  'onScroll' | 'scrollEventThrottle' | 'ref'
> & {
  children?: React.ReactNode;
  minContentHeight?: number;
};

// The explicit parameter type keeps the public props alias in emitted
// declarations; inferred types expand strict RN types into private paths.
export function ScrollView(
  props: TabsScrollViewProps & { ref?: React.Ref<NativeScrollViewRef> }
): React.ReactElement {
  const {
    ref: forwardedRef,
    minContentHeight,
    onScrollBeginDrag,
    onLayout,
    onContentSizeChange,
    onMomentumScrollBegin,
    onMomentumScrollEnd,
    ...scrollProps
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
    scrollHandlers,
    listNativeGestures,
    headerHeight,
    pinnedHeaderHeight,
    topInset,
    tabBarHeight,
    bottomInset,
    minPageContentHeight,
  } = ctx;

  const ref = listRefs[index] as React.Ref<NativeScrollViewRef>;
  const trackedRef = useTrackedScrollRef(listRefs[index], listMounted[index]);
  const scrollHandler = scrollHandlers[index];
  // Container creates one Native gesture for every registered tab index.
  const nativeGesture = listNativeGestures[index]!;
  const refreshControl = useAutoRefreshControl(
    props.refreshControl,
    nativeGesture
  );

  useImperativeHandle(
    forwardedRef,
    () =>
      (ref as unknown as React.MutableRefObject<NativeScrollViewRef>).current!,
    [ref]
  );

  const headerSpacerStyle = useAnimatedStyle(() => ({
    height: headerHeight.value + pinnedHeaderHeight + topInset + tabBarHeight,
  }));

  // Static per layout (no shared values), so a plain View — an animated
  // style here would register a do-nothing Reanimated mapper per page.
  // Just the safe-area inset + breathing room: the tab bar is top chrome
  // and never overlaps the list bottom.
  const footerSpacerHeight = bottomInset + FOOTER_GAP;

  const minHeight = minContentHeight ?? minPageContentHeight;

  const contentContainerStyle = [{ minHeight }, props.contentContainerStyle];

  const AnimatedScrollView =
    Animated.ScrollView as unknown as React.ComponentType<any>;

  // Reanimated inserts momentum listeners while filtering onScroll. Append
  // supplied callbacks after it; an undefined prop would disable its listener.
  const scrollView = (
    <AnimatedScrollView
      {...scrollProps}
      ref={trackedRef}
      refreshControl={refreshControl}
      onScroll={scrollHandler}
      {...(onScrollBeginDrag ? { onScrollBeginDrag } : {})}
      {...(onMomentumScrollBegin ? { onMomentumScrollBegin } : {})}
      {...(onMomentumScrollEnd ? { onMomentumScrollEnd } : {})}
      scrollEventThrottle={1}
      {...scrollMetrics}
      overScrollMode={props.overScrollMode ?? 'never'}
      directionalLockEnabled={props.directionalLockEnabled ?? true}
      nestedScrollEnabled={props.nestedScrollEnabled ?? true}
      showsVerticalScrollIndicator={props.showsVerticalScrollIndicator ?? false}
      contentContainerStyle={contentContainerStyle}
      stickyHeaderIndices={props.stickyHeaderIndices?.map(
        (childIndex) => childIndex + 1
      )}
    >
      <Animated.View style={headerSpacerStyle} />
      {props.children}
      <View style={{ height: footerSpacerHeight }} />
    </AnimatedScrollView>
  );

  if (USE_DIRECT_WEB_SCROLL) return scrollView;

  return (
    <SingleHeaderPage>
      <ListDetector gesture={nativeGesture}>{scrollView}</ListDetector>
    </SingleHeaderPage>
  );
}
