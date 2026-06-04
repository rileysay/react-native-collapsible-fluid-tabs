import React, { forwardRef, useImperativeHandle } from 'react';
import {
  Platform,
  type ScrollViewProps,
  type ScrollView as RNScrollView,
  View,
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

    return (
      <ListDetector gesture={nativeGesture}>
        <AnimatedScrollView
          {...(props as ScrollViewProps)}
          ref={ref}
          refreshControl={refreshControl}
          onScroll={scrollHandler}
          scrollEventThrottle={1}
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
      </ListDetector>
    );
  }
);
