import React, {
  useCallback,
  useInsertionEffect,
  useLayoutEffect,
  useRef,
} from 'react';
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

/** Points a consumer ref at a node; returns how to release it again. */
function attachRef<T>(ref: React.Ref<T> | undefined, node: T) {
  if (typeof ref === 'function') {
    const cleanup = ref(node);
    return typeof cleanup === 'function' ? cleanup : () => ref(null);
  }
  if (!ref) return undefined;
  ref.current = node;
  return () => {
    ref.current = null;
  };
}

/**
 * The scroll view's ref: the Container's tracked ref plus the consumer's.
 * Both follow the actual native host, which Android replaces when its refresh
 * wrapper changes. The callback stays stable, so replacing the consumer's ref
 * moves only that ref and never detaches the Container's.
 */
function useScrollViewRef(
  trackedRef: (instance: NativeScrollViewRef | null) => void,
  forwardedRef: React.Ref<NativeScrollViewRef> | undefined
) {
  const node = useRef<NativeScrollViewRef | null>(null);
  // The consumer's ref as of the current commit. Insertion effects run before
  // refs attach, so a host replaced in the same commit goes to the new ref.
  const latestRef = useRef(forwardedRef);
  // The ref that points at the host now, and how to release it.
  const attached = useRef<{
    ref: React.Ref<NativeScrollViewRef> | undefined;
    release: (() => void) | undefined;
  } | null>(null);

  useInsertionEffect(() => {
    latestRef.current = forwardedRef;
  }, [forwardedRef]);

  const scrollRef = useCallback(
    (instance: NativeScrollViewRef | null) => {
      node.current = instance;
      trackedRef(instance);
      if (instance) {
        const ref = latestRef.current;
        attached.current = { ref, release: attachRef(ref, instance) };
      }
      return () => {
        attached.current?.release?.();
        attached.current = null;
        node.current = null;
        trackedRef(null);
      };
    },
    [trackedRef]
  );

  // A consumer ref replaced while the host stays: move only that ref.
  useLayoutEffect(() => {
    if (!node.current || attached.current?.ref === forwardedRef) return;
    attached.current?.release?.();
    attached.current = {
      ref: forwardedRef,
      release: attachRef(forwardedRef, node.current),
    };
  }, [forwardedRef]);

  return scrollRef;
}

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
  const scrollRef = useScrollViewRef(page.trackedRef, forwardedRef);

  const scrollView = (
    <Animated.ScrollView
      {...scrollProps}
      ref={scrollRef}
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
