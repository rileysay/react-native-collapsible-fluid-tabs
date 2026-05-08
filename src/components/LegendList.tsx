import React, { useMemo } from 'react';
import { AnimatedLegendList } from '@legendapp/list/reanimated';
import type { LegendListProps } from '@legendapp/list';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

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
    <Component
      {...(props as LegendListProps<T>)}
      refScrollView={ref}
      onScroll={scrollHandler}
      scrollEventThrottle={1}
      directionalLockEnabled
      nestedScrollEnabled
      showsVerticalScrollIndicator={props.showsVerticalScrollIndicator ?? false}
      animatedProps={ctx.scrollEnabledProps}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={ListFooterComponent}
      contentContainerStyle={contentContainerStyle}
    />
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
