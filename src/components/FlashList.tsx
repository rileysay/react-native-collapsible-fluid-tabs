import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { Platform, ScrollView as RNScrollView } from 'react-native';
import {
  FlashList as ShopifyFlashList,
  type FlashListProps,
  type FlashListRef,
} from '@shopify/flash-list';
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

// Create the animated component once at module load. `createAnimatedComponent`
// wraps it so reanimated's UI-thread scroll handler can attach via onScroll,
// matching the FlatList/ScrollView/LegendList path. Doing this per-render
// would recreate the class every render.
const AnimatedFlashList = Animated.createAnimatedComponent(
  ShopifyFlashList as unknown as React.ComponentType<any>
) as unknown as React.ComponentType<any>;

export type TabsFlashListProps<T> = Omit<
  FlashListProps<T>,
  'onScroll' | 'scrollEventThrottle' | 'ref' | 'renderScrollComponent'
> & {
  minContentHeight?: number;
};

function TabsFlashListInner<T>(
  props: TabsFlashListProps<T>,
  forwardedRef: React.Ref<FlashListRef<T>>
) {
  const ctx = useTabsContext();
  const index = useTabIndex();
  const {
    listRefs,
    listNativeGestures,
    scrollHandlers,
    headerHeight,
    pinnedHeaderHeight,
    topInset,
    tabBarHeight,
    bottomInset,
    minPageContentHeight,
  } = ctx;

  const flashRef = useRef<FlashListRef<T>>(null);
  const nativeGesture = listNativeGestures[index];
  // The Container's shared animated ref for this page. `syncLists` / `scrollTo`
  // drive it to align every page to the collapsed scroll offset on tab change.
  // The other list wrappers bind it to their scroller; we attach it to the real
  // scroll view inside `renderScrollComponent` below so FlashList participates
  // in sync too (otherwise switching to this tab shows the un-scrolled header
  // spacer as a blank gap until the first touch).
  const listRef = listRefs[index];
  // Reuse the same UI-thread scrollHandler the Container created for every
  // tab. Driving scrollY on the UI thread (not via a JS onScroll callback) is
  // what keeps the collapsing header glued to the list under heavy scroll.
  const scrollHandler = scrollHandlers[index];
  const refreshControl = useAutoRefreshControl(
    props.refreshControl,
    nativeGesture
  );

  useImperativeHandle(forwardedRef, () => flashRef.current!, []);

  const headerSpacerStyle = useAnimatedStyle(() => ({
    height: headerHeight.value + pinnedHeaderHeight + topInset + tabBarHeight,
  }));

  const footerSpacerStyle = useAnimatedStyle(() => ({
    height: tabBarHeight + bottomInset + FOOTER_GAP,
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

  const minHeight = props.minContentHeight ?? minPageContentHeight;
  const contentContainerStyle = [{ minHeight }, props.contentContainerStyle];

  // FlashList v2 nests its real scroll view inside an outer flex wrapper View,
  // so wrapping <AnimatedFlashList> in the detector would bind the Native
  // gesture to that non-scrolling wrapper (the scroll gesture then only
  // registered in a sliver of the tab). Instead, inject the gesture at the
  // actual scroller via `renderScrollComponent` so the ScrollView is the
  // detector's *direct child* ΓÇö matching how the RN FlatList/ScrollView/
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
        const setRef = (node: unknown) => {
          if (typeof flashScrollRef === 'function') flashScrollRef(node);
          else if (flashScrollRef) {
            (flashScrollRef as React.MutableRefObject<unknown>).current = node;
          }
          if (typeof listRef === 'function') {
            (listRef as (n: unknown) => void)(node);
          } else if (listRef) {
            (listRef as React.MutableRefObject<unknown>).current = node;
          }
        };
        const scrollView = <RNScrollView {...scrollProps} ref={setRef} />;

        if (USE_DIRECT_WEB_SCROLL) return scrollView;

        return (
          <ListDetector gesture={nativeGesture}>{scrollView}</ListDetector>
        );
      },
    [nativeGesture, listRef]
  );

  return (
    <AnimatedFlashList
      {...(props as FlashListProps<T>)}
      ref={flashRef}
      refreshControl={refreshControl}
      onScroll={scrollHandler}
      scrollEventThrottle={1}
      overScrollMode={props.overScrollMode ?? 'never'}
      directionalLockEnabled
      nestedScrollEnabled
      showsVerticalScrollIndicator={props.showsVerticalScrollIndicator ?? false}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={ListFooterComponent}
      contentContainerStyle={contentContainerStyle}
      renderScrollComponent={renderScrollComponent}
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

export const FlashList = forwardRef(TabsFlashListInner) as <T>(
  props: TabsFlashListProps<T> & { ref?: React.Ref<FlashListRef<T>> }
) => React.ReactElement;
