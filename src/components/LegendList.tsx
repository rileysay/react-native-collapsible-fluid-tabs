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
import { FOOTER_GAP } from '../constants';
import { useAutoRefreshControl } from './useAutoRefreshControl';

// On web the browser scroll view should stay a plain DOM scroller; wrapping it
// in a Native GestureDetector steals horizontal pointer drags from the pager.
const USE_DIRECT_WEB_SCROLL = Platform.OS === 'web';
// Host detector, NOT VirtualGestureDetector: virtual Native gestures get no
// touch events on Android, which kills the mid-momentum page swipe. See the
// listNativeGestures note in Container.tsx.
const ListDetector = GestureDetector;

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
  // on native. The Container's scroll handler is still attached on native —
  // not for offsets, but because it carries the onMomentumBegin/End tracking
  // that arms the pager's momentum grab (relaxed failOffsetY). On web a plain
  // onScroll only fires at scroll-settle, and the grab is a native-touch
  // concern anyway, so web skips it.
  const scrollHandler = USE_DIRECT_WEB_SCROLL
    ? undefined
    : ctx.scrollHandlers[index];
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

  const list = (
    <Component
      {...(props as LegendListProps<T>)}
      refScrollView={ref}
      refreshControl={refreshControl}
      sharedValues={sharedValues}
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

function renderInjected(node: unknown): React.ReactNode {
  if (!node) return null;
  if (typeof node === 'function') {
    const Comp = node as React.ComponentType;
    return <Comp />;
  }
  return node as React.ReactNode;
}
