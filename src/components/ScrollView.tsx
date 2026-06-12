import React, { forwardRef, useImperativeHandle } from 'react';
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

// On web the browser scroll view should stay a plain DOM scroller; wrapping it
// in a Native GestureDetector steals horizontal pointer drags from the pager.
const USE_DIRECT_WEB_SCROLL = Platform.OS === 'web';
// Host detector, NOT VirtualGestureDetector: virtual Native gestures get no
// touch events on Android, which kills the mid-momentum page swipe. See the
// listNativeGestures note in Container.tsx.
const ListDetector = GestureDetector;

export type TabsScrollViewProps = Omit<
  ScrollViewProps,
  'onScroll' | 'scrollEventThrottle' | 'ref'
> & {
  children?: React.ReactNode;
  minContentHeight?: number;
};

export const ScrollView = forwardRef<RNScrollView, TabsScrollViewProps>(
  function TabsScrollViewInner(props, forwardedRef) {
    const ctx = useTabsContext();
    const index = useTabIndex();

    const ref = ctx.listRefs[index] as React.Ref<RNScrollView>;
    const scrollHandler = ctx.scrollHandlers[index];
    const nativeGesture = ctx.listNativeGestures[index];
    const refreshControl = useAutoRefreshControl(
      props.refreshControl,
      nativeGesture
    );

    useImperativeHandle(
      forwardedRef,
      () => (ref as unknown as React.MutableRefObject<RNScrollView>).current!,
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

    const minHeight = props.minContentHeight ?? ctx.minPageContentHeight;

    const contentContainerStyle = [{ minHeight }, props.contentContainerStyle];

    const AnimatedScrollView =
      Animated.ScrollView as unknown as React.ComponentType<any>;

    const scrollView = (
      <AnimatedScrollView
        {...(props as ScrollViewProps)}
        ref={ref}
        refreshControl={refreshControl}
        onScroll={scrollHandler}
        scrollEventThrottle={1}
        overScrollMode={props.overScrollMode ?? 'never'}
        directionalLockEnabled
        nestedScrollEnabled
        showsVerticalScrollIndicator={
          props.showsVerticalScrollIndicator ?? false
        }
        contentContainerStyle={contentContainerStyle}
      >
        <Animated.View style={headerSpacerStyle} />
        <View>{props.children}</View>
        <Animated.View style={footerSpacerStyle} />
      </AnimatedScrollView>
    );

    if (USE_DIRECT_WEB_SCROLL) return scrollView;

    return <ListDetector gesture={nativeGesture}>{scrollView}</ListDetector>;
  }
);
