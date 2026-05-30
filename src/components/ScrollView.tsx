import React, { forwardRef, useImperativeHandle } from 'react';
import {
  type ScrollViewProps,
  type ScrollView as RNScrollView,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useTabIndex, useTabsContext } from '../context';

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
      height: ctx.tabBarHeight + ctx.bottomInset + 16,
    }));

    const minHeight = props.minContentHeight ?? ctx.minPageContentHeight;

    const contentContainerStyle = [{ minHeight }, props.contentContainerStyle];

    const AnimatedScrollView =
      Animated.ScrollView as unknown as React.ComponentType<any>;

    return (
      <AnimatedScrollView
        {...(props as ScrollViewProps)}
        ref={ref}
        onScroll={scrollHandler}
        scrollEventThrottle={1}
        directionalLockEnabled
        nestedScrollEnabled
        showsVerticalScrollIndicator={
          props.showsVerticalScrollIndicator ?? false
        }
        scrollEnabled={ctx.scrollEnabled}
        contentContainerStyle={contentContainerStyle}
      >
        <Animated.View style={headerSpacerStyle} />
        <View>{props.children}</View>
        <Animated.View style={footerSpacerStyle} />
      </AnimatedScrollView>
    );
  }
);
