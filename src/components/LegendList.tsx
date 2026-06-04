import React, { useMemo } from 'react';
import { Platform } from 'react-native';
import { AnimatedLegendList } from '@legendapp/list/reanimated';
import type { LegendListProps } from '@legendapp/list/react-native';
import {
  GestureDetector,
  VirtualGestureDetector,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { useTabIndex, useTabsContext } from '../context';
import { FOOTER_GAP } from '../constants';
import { useAutoRefreshControl } from './useAutoRefreshControl';

// Web uses the standalone host GestureDetector; native uses VirtualGestureDetector
// under the Container's InterceptingGestureDetector. See Container's IS_WEB note.
const ListDetector =
  Platform.OS === 'web' ? GestureDetector : VirtualGestureDetector;

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
  const nativeGesture = ctx.listNativeGestures[index];
  const refreshControl = useAutoRefreshControl(
    props.refreshControl,
    nativeGesture
  );
  const pageScrollY = ctx.perPageScrollY[index];

  // Legend List exposes a shared scroll offset from its reanimated build. Use
  // that value on every platform so the collapsible header follows the same
  // shared-value path instead of mixing shared values on web with scroll events
  // on native.
  const sharedValues = useMemo(
    () => ({ scrollOffset: pageScrollY }),
    [pageScrollY]
  );
  useAnimatedReaction(
    () => pageScrollY?.value ?? 0,
    (offset) => {
      'worklet';
      if (ctx.activeIndex.value === index) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userListFooter]
  );

  const minHeight = props.minContentHeight ?? ctx.minPageContentHeight;

  const contentContainerStyle = [{ minHeight }, props.contentContainerStyle];

  const Component = AnimatedLegendList as unknown as React.ComponentType<any>;

  return (
    <ListDetector gesture={nativeGesture}>
      <Component
        {...(props as LegendListProps<T>)}
        refScrollView={ref}
        refreshControl={refreshControl}
        sharedValues={sharedValues}
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

function renderInjected(node: unknown): React.ReactNode {
  if (!node) return null;
  if (typeof node === 'function') {
    const Comp = node as React.ComponentType;
    return <Comp />;
  }
  return node as React.ReactNode;
}
