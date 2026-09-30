import React, { useImperativeHandle } from 'react';
import {
  View,
  type ScrollViewProps,
  type ScrollView as RNScrollView,
} from 'react-native';
import Animated from 'react-native-reanimated';

import { SingleHeaderPage } from './SingleHeader';
import {
  ListDetector,
  USE_DIRECT_WEB_SCROLL,
  omitTabListProps,
  useTabList,
} from './useTabList';

type NativeScrollViewRef = React.ComponentRef<typeof RNScrollView>;

export type TabsScrollViewProps = Omit<
  ScrollViewProps,
  'onScroll' | 'scrollEventThrottle' | 'ref'
> & {
  children?: React.ReactNode;
  minContentHeight?: number;
};

// The explicit parameter type keeps the public props alias in emitted
// declarations; inferred types expand strict RN types into private paths.
export function ScrollView(
  props: TabsScrollViewProps & { ref?: React.Ref<NativeScrollViewRef> }
): React.ReactElement {
  const { ref: forwardedRef, ...consumerProps } = props;
  const scrollProps = omitTabListProps(consumerProps);
  // ScrollView takes an explicit refreshControl only; there is no shorthand.
  const page = useTabList(props);
  const ref = page.listRef as React.Ref<NativeScrollViewRef>;

  useImperativeHandle(
    forwardedRef,
    () =>
      (ref as unknown as React.MutableRefObject<NativeScrollViewRef>).current!,
    [ref]
  );

  const scrollView = (
    <Animated.ScrollView
      {...scrollProps}
      ref={page.trackedRef}
      refreshControl={page.refreshControl}
      {...page.scrollProps}
      stickyHeaderIndices={props.stickyHeaderIndices?.map(
        (childIndex) => childIndex + 1
      )}
    >
      <Animated.View style={page.headerSpacerStyle} />
      {props.children}
      <View style={{ height: page.footerSpacerHeight }} />
    </Animated.ScrollView>
  );

  if (USE_DIRECT_WEB_SCROLL) return scrollView;

  return (
    <SingleHeaderPage>
      <ListDetector gesture={page.nativeGesture}>{scrollView}</ListDetector>
    </SingleHeaderPage>
  );
}
