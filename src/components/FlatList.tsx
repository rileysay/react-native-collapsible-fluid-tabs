import React, { forwardRef, useImperativeHandle, useMemo } from 'react';
import { type FlatListProps, type FlatList as RNFlatList } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useTabIndex, useTabsContext } from '../context';

export type TabsFlatListProps<T> = Omit<
  FlatListProps<T>,
  'onScroll' | 'scrollEventThrottle' | 'ref'
> & {
  /**
   * Optional minimum content height. Defaults to the container's
   * `minPageContentHeight` (1.3x screen height) which keeps short pages
   * scrollable enough for the collapsing header to feel right.
   */
  minContentHeight?: number;
};

function TabsFlatListInner<T>(
  props: TabsFlatListProps<T>,
  forwardedRef: React.Ref<RNFlatList<T>>
) {
  const ctx = useTabsContext();
  const index = useTabIndex();

  const ref = ctx.listRefs[index] as React.Ref<RNFlatList<T>>;
  const scrollHandler = ctx.scrollHandlers[index];

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
    // headerSpacerStyle is stable; user component identity drives updates.
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

  const AnimatedFlatList =
    Animated.FlatList as unknown as React.ComponentType<any>;

  return (
    <AnimatedFlatList
      {...(props as FlatListProps<T>)}
      ref={ref}
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
