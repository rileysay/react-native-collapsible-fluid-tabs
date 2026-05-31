import React, { useMemo } from 'react';
import { Platform } from 'react-native';
import { AnimatedLegendList } from '@legendapp/list/reanimated';
import type { LegendListProps } from '@legendapp/list/react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { useTabIndex, useTabsContext } from '../context';

export type TabsLegendListProps<T> = Omit<
  LegendListProps<T>,
  'onScroll' | 'scrollEventThrottle' | 'refScrollView'
> & {
  /**
   * Optional minimum content height. Defaults to the container's
   * `minPageContentHeight` (1.3x screen height).
   */
  minContentHeight?: number;
};

export function LegendList<T>(props: TabsLegendListProps<T>) {
  const ctx = useTabsContext();
  const index = useTabIndex();

  const ref = ctx.listRefs[index];
  const scrollHandler = ctx.scrollHandlers[index];
  const nativeGesture = ctx.listNativeGestures[index];
  const pageScrollY = ctx.perPageScrollY[index];
  const isWeb = Platform.OS === 'web';

  // Web only: Legend List's reanimated build reports scroll position
  // continuously through `sharedValues.scrollOffset` (driven by
  // useScrollViewOffset). The generic `onScroll` prop, by contrast, rides
  // Legend List's internal scroll state, which on web updates only at
  // scroll-settle — so the collapsing header would jump instead of track.
  // We point scrollOffset at this page's shared value and mirror it into the
  // shared `scrollY` while the tab is active — exactly what the native
  // onScroll handler does. On native nothing changes: the proven onScroll path
  // stays, and this reaction's dependency is constant so it never runs.
  const sharedValues = useMemo(
    () => ({ scrollOffset: pageScrollY }),
    [pageScrollY]
  );
  useAnimatedReaction(
    () => (isWeb ? (pageScrollY?.value ?? 0) : 0),
    (offset) => {
      'worklet';
      if (isWeb && ctx.activeIndex.value === index) {
        ctx.scrollY.value = offset;
      }
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userListFooter]
  );

  const minHeight = props.minContentHeight ?? ctx.minPageContentHeight;

  const contentContainerStyle = [{ minHeight }, props.contentContainerStyle];

  const Component = AnimatedLegendList as unknown as React.ComponentType<any>;

  return (
    <GestureDetector gesture={nativeGesture}>
      <Component
        {...(props as LegendListProps<T>)}
        refScrollView={ref}
        {...(isWeb
          ? { sharedValues }
          : { onScroll: scrollHandler, scrollEventThrottle: 1 })}
        directionalLockEnabled
        nestedScrollEnabled
        showsVerticalScrollIndicator={
          props.showsVerticalScrollIndicator ?? false
        }
        ListHeaderComponent={ListHeaderComponent}
        ListFooterComponent={ListFooterComponent}
        contentContainerStyle={contentContainerStyle}
      />
    </GestureDetector>
  );
}

function renderInjected(node: unknown): React.ReactNode {
  if (!node) return null;
  if (typeof node === 'function') {
    const Comp = node as React.ComponentType;
    return <Comp />;
  }
  return node as React.ReactNode;
}
