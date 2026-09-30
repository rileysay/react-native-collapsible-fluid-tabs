import React, { useLayoutEffect, useImperativeHandle } from 'react';
import {
  Platform,
  type FlatListProps,
  type FlatList as RNFlatList,
} from 'react-native';
import Animated, { type AnimatedRef } from 'react-native-reanimated';

import {
  isNativeHeaderScrollEnabled,
  useSingleHeaderScrollComponent,
} from './SingleHeader';
import {
  ListDetector,
  USE_DIRECT_WEB_SCROLL,
  omitTabListProps,
  useListSpacers,
  useTabList,
} from './useTabList';

export type TabsFlatListProps<T> = Omit<
  FlatListProps<T>,
  'onScroll' | 'scrollEventThrottle' | 'ref' | 'CellRendererComponent'
> & {
  /** Unsupported: Reanimated's Animated.FlatList supplies its own cell renderer. */
  CellRendererComponent?: never;
  minContentHeight?: number;
};

export function FlatList<T>(
  props: TabsFlatListProps<T> & { ref?: React.Ref<RNFlatList<T>> }
): React.ReactElement {
  const { ref: forwardedRef, ...consumerProps } = props;
  const listProps = omitTabListProps(consumerProps);
  const page = useTabList(props, {
    onRefresh: props.onRefresh,
    refreshing: props.refreshing,
    progressViewOffset: props.progressViewOffset,
  });
  const { trackedRef, nativeGesture, refreshControl } = page;
  const ref = page.listRef as AnimatedRef<RNFlatList<T>>;

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

  const { ListHeaderComponent, ListFooterComponent } = useListSpacers(
    page,
    props.ListHeaderComponent,
    props.ListFooterComponent
  );
  const renderScrollComponent = useSingleHeaderScrollComponent(
    listProps.renderScrollComponent,
    nativeGesture
  );
  const AnimatedFlatList =
    Animated.FlatList as unknown as React.ComponentType<any>;

  const list = (
    <AnimatedFlatList
      {...listProps}
      renderScrollComponent={renderScrollComponent}
      ref={trackedRef}
      refreshControl={refreshControl}
      // The animated event manager follows inner native view replacements.
      // Observing only the outer ref leaves listeners on the old Android view
      // after switching between native refresh and stretched pull.
      {...page.scrollProps}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={ListFooterComponent}
    />
  );

  // Native header scroll moves this detector onto the actual scroll view (see
  // renderScrollComponent). A gesture must never be attached to two detectors.
  if (USE_DIRECT_WEB_SCROLL || isNativeHeaderScrollEnabled()) return list;

  return <ListDetector gesture={nativeGesture}>{list}</ListDetector>;
}
