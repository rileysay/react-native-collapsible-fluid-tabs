import React, {
  createContext,
  forwardRef,
  useContext,
  useMemo,
  type ComponentType,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import {
  Platform,
  ScrollView,
  View,
  type ScrollViewProps,
  type ViewProps,
} from 'react-native';
import {
  GestureDetector,
  type NativeGesture,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedProps,
  type SharedValue,
} from 'react-native-reanimated';

import { useTabIndex } from '../context';

export type NativeHeaderScrollHostProps = ViewProps & {
  activePageIndex: number;
  paging: boolean;
};
export type NativeHeaderScrollPageProps = ViewProps & { pageIndex: number };

/**
 * Native views that let header and tab bar drags drive the active list's own
 * UIKit scrolling. The host is the common ancestor of the header and pager;
 * each page wraps exactly one list's native scroll view.
 */
export type NativeHeaderScrollViews = {
  Host: ComponentType<NativeHeaderScrollHostProps>;
  Page: ComponentType<NativeHeaderScrollPageProps>;
};

let nativeViews: {
  Host: ComponentType<any>;
  Page: ComponentType<NativeHeaderScrollPageProps>;
} | null = null;

/**
 * Experimental, iOS only. Opts every `Tabs.Container` into native header
 * scrolling: momentum, overscroll, bounce and pull-to-refresh behave the same
 * whether a drag starts on the list, header or tab bar.
 *
 * Call once at startup, before any container renders. The views must come
 * from a native host that relocates the active list's pan recognizer, and
 * react-native-gesture-handler must support externally hosted scroll pans.
 * Without registration, containers keep their existing JavaScript header drag.
 * Other platforms ignore this call.
 */
export function registerNativeHeaderScroll(
  views: NativeHeaderScrollViews | null
) {
  if (Platform.OS !== 'ios') return;
  nativeViews = views
    ? {
        Host: Animated.createAnimatedComponent(
          views.Host as ComponentType<any>
        ),
        Page: views.Page,
      }
    : null;
}

export function isNativeHeaderScrollEnabled() {
  return nativeViews !== null;
}

const SingleHeaderContext = createContext(false);
const pageStyle = { flex: 1 } as const;

type SingleHeaderHostProps = ViewProps & {
  activeIndex: SharedValue<number>;
  paging: SharedValue<boolean>;
};
type HostRef = React.ComponentRef<typeof View>;

function NativeHost({ activeIndex, paging, ...props }: SingleHeaderHostProps) {
  // Committed together on the UI thread, so the host never pairs a new page
  // index with a stale paging flag.
  const animatedProps = useAnimatedProps(() => ({
    activePageIndex: Math.round(activeIndex.value),
    paging: paging.value,
  }));
  const Host = nativeViews?.Host;
  if (!Host) return null;
  return (
    <SingleHeaderContext.Provider value>
      <Host {...props} animatedProps={animatedProps} collapsable={false} />
    </SingleHeaderContext.Provider>
  );
}

/** The container root: a plain View unless native header scroll is registered. */
export const SingleHeaderHost = forwardRef<HostRef, SingleHeaderHostProps>(
  function SingleHeaderHost({ activeIndex, paging, ...props }, ref) {
    if (!isNativeHeaderScrollEnabled()) return <View {...props} ref={ref} />;
    // The container's root ref is only read by its web scroll listener.
    return <NativeHost {...props} activeIndex={activeIndex} paging={paging} />;
  }
);

/** Registers one list's native scroll view with the host. */
export function SingleHeaderPage({ children }: { children: ReactNode }) {
  const enabled = useContext(SingleHeaderContext);
  const pageIndex = useTabIndex();
  const Page = nativeViews?.Page;
  if (!enabled || !Page) return <>{children}</>;
  return (
    <Page pageIndex={pageIndex} style={pageStyle} collapsable={false}>
      {children}
    </Page>
  );
}

type RenderScrollComponent<P> = ((props: P) => ReactElement | null) | undefined;

/**
 * Wraps a virtualized list's scroll renderer in its page registration and
 * Native gesture detector. The list's ref stays on the actual ScrollView.
 */
export function useSingleHeaderScrollComponent<P extends object>(
  render: RenderScrollComponent<P>,
  nativeGesture: NativeGesture
): RenderScrollComponent<P> {
  const enabled = isNativeHeaderScrollEnabled();
  return useMemo(() => {
    if (!enabled) return render;
    type ScrollRef = React.ComponentRef<typeof ScrollView>;
    const renderScroll =
      render ?? ((props: P) => <ScrollView {...(props as ScrollViewProps)} />);
    // VirtualizedList clones the returned element with its ref and item cells.
    // Keep that replaceable boundary outside the registration and detector so
    // the clone cannot replace the actual scroll view with bare list children.
    const ScrollComponent = forwardRef<ScrollRef, P>(
      function SingleHeaderScroll(props, ref) {
        const element = renderScroll({ ...props, ref } as P);
        if (!element) return null;
        const scrollView = ref
          ? React.cloneElement(
              element as ReactElement<{ ref?: Ref<ScrollRef> }>,
              { ref }
            )
          : element;
        return (
          <SingleHeaderPage>
            <GestureDetector gesture={nativeGesture}>
              {scrollView}
            </GestureDetector>
          </SingleHeaderPage>
        );
      }
    );
    return (props: P) => (
      <ScrollComponent
        {...(props as React.PropsWithoutRef<P> &
          React.RefAttributes<ScrollRef> &
          React.Attributes)}
      />
    );
  }, [enabled, render, nativeGesture]);
}
