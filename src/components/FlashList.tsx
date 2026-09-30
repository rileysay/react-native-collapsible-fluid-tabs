import React, { useImperativeHandle, useMemo, useRef } from 'react';
import { ScrollView as RNScrollView } from 'react-native';
import type { FlashListProps, FlashListRef } from '@shopify/flash-list';
import Animated from 'react-native-reanimated';

import { SingleHeaderPage } from './SingleHeader';
import {
  ListDetector,
  USE_DIRECT_WEB_SCROLL,
  omitTabListProps,
  useListSpacers,
  useTabList,
} from './useTabList';

// @shopify/flash-list is an optional peer: the require lives in a try/catch so
// Metro treats it as an optional dependency (`allowOptionalDependencies`, on
// by default in Expo / RN CLI configs) and consumers without it installed can
// still import the library. Only rendering Tabs.FlashList requires it.
//
// The animated component is created once at module load. It wraps FlashList so
// reanimated's UI-thread scroll handler can attach via onScroll, matching the
// FlatList/ScrollView/LegendList path. Doing this per-render would recreate
// the class every render.
let AnimatedFlashList: React.ComponentType<any> | null = null;
try {
  AnimatedFlashList = Animated.createAnimatedComponent(
    require('@shopify/flash-list').FlashList as React.ComponentType<any>
  ) as unknown as React.ComponentType<any>;
} catch {
  // Left null; Tabs.FlashList throws a descriptive error when rendered.
}

export type TabsFlashListProps<T> = Omit<
  FlashListProps<T>,
  'onScroll' | 'scrollEventThrottle' | 'ref' | 'renderScrollComponent'
> & {
  minContentHeight?: number;
};

export function FlashList<T>(
  props: TabsFlashListProps<T> & { ref?: React.Ref<FlashListRef<T>> }
): React.ReactElement {
  const { ref: forwardedRef, ...consumerProps } = props;
  const listProps = omitTabListProps(consumerProps);
  if (!AnimatedFlashList) {
    throw new Error(
      '[collapsible-fluid-tabs] Tabs.FlashList requires the optional peer dependency @shopify/flash-list. Install it with: npm install @shopify/flash-list'
    );
  }
  const FlashListComponent = AnimatedFlashList;
  const page = useTabList(props, {
    onRefresh: props.onRefresh,
    refreshing: props.refreshing,
    progressViewOffset: props.progressViewOffset,
  });
  const { nativeGesture, refreshControl } = page;

  const flashRef = useRef<FlashListRef<T>>(null);
  // The Container's shared animated ref for this page. `syncLists` / `scrollTo`
  // drive it to align every page to the collapsed scroll offset on tab change.
  // The other list wrappers bind it to their scroller; we attach it to the real
  // scroll view inside `renderScrollComponent` below so FlashList participates
  // in sync too (otherwise switching to this tab shows the un-scrolled header
  // spacer as a blank gap until the first touch).
  const listRef = page.trackedRef;

  useImperativeHandle(forwardedRef, () => flashRef.current!, []);

  const { ListHeaderComponent, ListFooterComponent } = useListSpacers(
    page,
    props.ListHeaderComponent,
    props.ListFooterComponent
  );

  // FlashList v2 nests its real scroll view inside an outer flex wrapper View,
  // so wrapping <AnimatedFlashList> in the detector would bind the Native
  // gesture to that non-scrolling wrapper (the scroll gesture then only
  // registered in a sliver of the tab). Instead, inject the gesture at the
  // actual scroller via `renderScrollComponent` so the ScrollView is the
  // detector's *direct child* — matching how the RN FlatList/ScrollView/
  // LegendList wrappers attach it. FlashList forwards its ref + onScroll
  // through `scrollProps`, so we just spread them onto the inner ScrollView.
  const renderScrollComponent = useMemo(
    () =>
      // eslint-disable-next-line react/no-unstable-nested-components -- identity is stable (memoized on [nativeGesture, listRef]); FlashList's renderScrollComponent API has no way to thread those values through as props from module scope
      function FlashScroll({
        ref: flashScrollRef,
        ...scrollProps
      }: {
        ref?: React.Ref<unknown>;
      }) {
        // Fan the scroller node out to both refs: FlashList's own scrollViewRef
        // (so it can measure / drive scrolling) and the Container's animated ref
        // (so reanimated `scrollTo` can sync this page like the others).
        const setRef = React.useCallback(
          (node: unknown) => {
            if (typeof flashScrollRef === 'function') flashScrollRef(node);
            else if (flashScrollRef) {
              (flashScrollRef as React.MutableRefObject<unknown>).current =
                node;
            }
            if (typeof listRef === 'function') {
              (listRef as (n: unknown) => void)(node);
            } else if (listRef) {
              (listRef as React.MutableRefObject<unknown>).current = node;
            }
          },
          [flashScrollRef]
        );
        const scrollView = <RNScrollView {...scrollProps} ref={setRef} />;

        if (USE_DIRECT_WEB_SCROLL) return scrollView;

        // FlashList wraps its scroller in a layout view; register the scroller.
        return (
          <SingleHeaderPage>
            <ListDetector gesture={nativeGesture}>{scrollView}</ListDetector>
          </SingleHeaderPage>
        );
      },
    [nativeGesture, listRef]
  );

  return (
    <FlashListComponent
      {...listProps}
      ref={flashRef}
      refreshControl={refreshControl}
      // Reuse the same UI-thread scrollHandler the Container created for every
      // tab. Driving scrollY on the UI thread (not via a JS onScroll callback)
      // is what keeps the collapsing header glued to the list under heavy scroll.
      {...page.scrollProps}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={ListFooterComponent}
      renderScrollComponent={renderScrollComponent}
    />
  );
}
