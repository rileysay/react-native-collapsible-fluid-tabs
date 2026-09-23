/** @jest-environment jsdom */
/// <reference lib="dom" />

import { act, createRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  GestureStateManager,
  usePanGesture,
} from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  scrollTo,
  useAnimatedReaction,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { LayoutChangeEvent } from 'react-native';

import type { ContainerProps, TabBarRenderProps, TabsRef } from '../../types';
import { Container } from '../Container';
import { Tab } from '../Tab';
import { useTabsContext } from '../../context';

const mockRNQueue: (() => void)[] = [];

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  View: ({ children }: { children?: ReactNode }) => children,
  ActivityIndicator: () => null,
  StyleSheet: { create: (styles: unknown) => styles },
  useWindowDimensions: () => ({ width: 300, height: 800 }),
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children?: ReactNode }) => children,
  InterceptingGestureDetector: ({ children }: { children?: ReactNode }) =>
    children,
  usePanGesture: jest.fn((config: object) => ({ ...config, handlerTag: 1 })),
  GestureStateManager: { fail: jest.fn(), activate: jest.fn() },
  useNativeGesture: () => ({ handlerTag: 2 }),
  useCompetingGestures: (pager: object) => pager,
}));
jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: {
      View: jest.fn(({ children }: { children?: ReactNode }) => children),
    },
    Easing: { out: (easing: unknown) => easing, quad: jest.fn() },
    cancelAnimation: jest.fn(),
    scrollTo: jest.fn(),
    withSpring: jest.fn((target: number) => target),
    withTiming: jest.fn((target: number) => target),
    useSharedValue: (initial: unknown) =>
      React.useRef({ value: initial }).current,
    useAnimatedRef: () => React.useRef(() => 1).current,
    useAnimatedScrollHandler: (handlers: unknown) => handlers,
    useAnimatedStyle: () => ({}),
    useAnimatedReaction: jest.fn(),
    useReducedMotion: () => false,
  };
});
jest.mock('react-native-worklets', () => ({
  runOnUISync: (worklet: () => unknown) => worklet(),
  scheduleOnRN: (
    callback: (...args: unknown[]) => void,
    ...args: unknown[]
  ) => {
    mockRNQueue.push(() => callback(...args));
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../DefaultTabBar', () => ({ DefaultTabBar: () => null }));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type PanConfig = NonNullable<Parameters<typeof usePanGesture>[0]>;
type ActivateEvent = Parameters<NonNullable<PanConfig['onActivate']>>[0];
type ReleaseEvent = Parameters<NonNullable<PanConfig['onDeactivate']>>[0];
type FinalizeEvent = Parameters<NonNullable<PanConfig['onFinalize']>>[0];
type TouchEvent = Parameters<NonNullable<PanConfig['onTouchesDown']>>[0];

let root: Root;
let host: HTMLDivElement;
let tabBar: TabBarRenderProps;
let props: Omit<ContainerProps, 'children'>;
let pagerRef: ReturnType<typeof createRef<TabsRef>>;
let onIndexChange: jest.Mock;
let context: ReturnType<typeof useTabsContext>;

function ContextProbe() {
  context = useTabsContext();
  return null;
}

const tabs = ['feed', 'grid', 'about', 'flash'].map((name) => (
  <Tab key={name} name={name}>
    <ContextProbe />
  </Tab>
));

function renderPager(updates: Partial<typeof props> = {}) {
  props = { ...props, ...updates };
  act(() => {
    root.render(
      <Container {...props} ref={pagerRef}>
        {tabs}
      </Container>
    );
  });
}

function currentGesture(): PanConfig {
  const config = jest
    .mocked(usePanGesture)
    .mock.calls.map(([value]) => value)
    .findLast((value) => value?.testID === 'fluid-tabs-pager');
  if (!config) throw new Error('Expected the horizontal pager gesture');
  return config;
}

function swipe(direction: 'next' | 'previous' = 'next') {
  const gesture = currentGesture();
  const sign = direction === 'next' ? -1 : 1;
  act(() => {
    gesture.onActivate!({ translationX: 15 * sign } as ActivateEvent);
    gesture.onDeactivate!({
      translationX: 80 * sign,
      velocityX: 1500 * sign,
      canceled: false,
    } as ReleaseEvent);
    gesture.onFinalize!({ canceled: false } as FinalizeEvent);
  });
}

function deliverNextIndexChange() {
  const notify = mockRNQueue.shift();
  if (!notify) throw new Error('Expected a queued index notification');
  act(notify);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRNQueue.length = 0;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  pagerRef = createRef<TabsRef>();
  onIndexChange = jest.fn();
  props = {
    index: 1,
    onIndexChange,
    renderTabBar: (value) => {
      tabBar = value;
      return null;
    },
  };
  renderPager();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

// Animation mocks record targets, not rendered frames. The RN notification
// queue and parent prop commits are separate so UI gestures can get ahead of
// React, as they do during repeated swipes on a busy device.
it('keeps heading to tab 4 when React acknowledges the earlier tab-3 swipe', () => {
  swipe();
  deliverNextIndexChange();
  expect(onIndexChange).toHaveBeenLastCalledWith(2);
  swipe();
  expect(pagerRef.current!.getIndex()).toBe(3);
  expect(jest.mocked(withSpring).mock.calls.map(([target]) => target)).toEqual([
    -600, -900,
  ]);

  renderPager({ index: 2 });
  expect(pagerRef.current!.getIndex()).toBe(3);
  expect(withTiming).not.toHaveBeenCalled();

  deliverNextIndexChange();
  renderPager({ index: 3 });
  expect(pagerRef.current!.getIndex()).toBe(3);
  expect(withTiming).not.toHaveBeenCalled();
});

it('does not publish a queued tab-3 notification after the next swipe reaches tab 4', () => {
  swipe();
  swipe();
  deliverNextIndexChange();
  expect(onIndexChange).not.toHaveBeenCalled();
  deliverNextIndexChange();
  expect(onIndexChange).toHaveBeenCalledTimes(1);
  expect(onIndexChange).toHaveBeenLastCalledWith(3);
  renderPager({ index: 3 });
  expect(pagerRef.current!.getIndex()).toBe(3);
  expect(withTiming).not.toHaveBeenCalled();
});

it('does not undo a swipe when only the parent callback identity changes', () => {
  swipe();
  renderPager({ onIndexChange: jest.fn() });
  expect(pagerRef.current!.getIndex()).toBe(2);
  expect(withTiming).not.toHaveBeenCalled();
});

it('preserves external controlled navigation after a swipe is acknowledged', () => {
  swipe();
  deliverNextIndexChange();
  renderPager({ index: 2 });
  renderPager({ index: 0 });
  expect(pagerRef.current!.getIndex()).toBe(0);
  expect(withTiming).toHaveBeenLastCalledWith(
    -0,
    expect.any(Object),
    expect.any(Function)
  );
  expect(onIndexChange).toHaveBeenCalledTimes(1);
});

it('does not restart a tab-tap animation when the parent acknowledges it', () => {
  act(() => tabBar.onTabPress(3));
  expect(pagerRef.current!.getIndex()).toBe(3);
  expect(withTiming).toHaveBeenCalledTimes(1);
  renderPager({ index: 3, onIndexChange: jest.fn() });
  expect(withTiming).toHaveBeenCalledTimes(1);
});

it.each([false, true])(
  'does not let an old swipe release replace tab-tap navigation (canceled: %s)',
  (canceled) => {
    const gesture = currentGesture();
    act(() => gesture.onActivate!({ translationX: -15 } as ActivateEvent));
    act(() => tabBar.onTabPress(3));
    act(() => {
      gesture.onDeactivate!({
        translationX: 80,
        velocityX: 1500,
        canceled,
      } as ReleaseEvent);
      gesture.onFinalize!({ canceled } as FinalizeEvent);
    });
    expect(pagerRef.current!.getIndex()).toBe(3);
    expect(withTiming).toHaveBeenCalledTimes(1);
    expect(withSpring).not.toHaveBeenCalled();
  }
);

it('hands scroll-to-top back to a vertical drag at the actual native offset', () => {
  context.listMounted[1]!.value = true;
  context.perPageScrollY[1]!.value = 200;
  act(() => tabBar.onTabPress(1));
  expect(context.scrollToTopIndex.value).toBe(1);
  context.scrollToTopOffset.value = 120;
  const completion = jest
    .mocked(withTiming)
    .mock.calls.find((call) => call[2])![2]!;
  jest.mocked(scrollTo).mockClear();
  jest.mocked(cancelAnimation).mockClear();

  act(() =>
    context.scrollHandlers[1].onBeginDrag({ contentOffset: { y: 115 } })
  );
  expect(context.scrollToTopIndex.value).toBe(-1);
  expect(cancelAnimation).toHaveBeenCalledWith(context.scrollToTopOffset);
  expect(cancelAnimation).toHaveBeenCalledWith(context.scrollY);
  expect(context.scrollY.value).toBe(115);
  expect(context.perPageScrollY[1]!.value).toBe(115);
  expect(scrollTo).not.toHaveBeenCalled();

  act(() => completion(true));
  expect(context.scrollY.value).toBe(115);
  act(() => context.scrollHandlers[1].onScroll({ contentOffset: { y: 130 } }));
  expect(context.scrollY.value).toBe(130);
});

it('ignores an unrelated list drag while another list is scrolling to top', () => {
  context.scrollToTopIndex.value = 1;
  context.scrollY.value = 150;
  jest.mocked(cancelAnimation).mockClear();
  act(() =>
    context.scrollHandlers[0].onBeginDrag({ contentOffset: { y: 40 } })
  );
  expect(context.scrollToTopIndex.value).toBe(1);
  expect(context.scrollY.value).toBe(150);
  expect(cancelAnimation).not.toHaveBeenCalled();
});

it('does not reserve an estimated height for an absent header', () => {
  act(() => root.unmount());
  root = createRoot(host);
  renderPager({ estimatedHeaderHeight: 200 });
  expect(context.headerHeight.value).toBe(0);
  expect(context.headerHeightValue).toBe(0);
  expect(context.minPageContentHeight).toBe(800);
});

it('reserves the device safe area by default and updates all chrome for an inset override', () => {
  expect(context.topInset).toBe(24);
  expect(tabBar.topInset).toBe(24);
  renderPager({ topInset: 0 });
  expect(context.topInset).toBe(0);
  expect(context.pinnedHeaderHeight).toBe(0);
  expect(tabBar.topInset).toBe(0);
  expect(currentGesture().hitSlop).toMatchObject({ top: -56 });

  renderPager({ topInset: 12, pinnedHeaderHeight: 48 });
  expect(context.topInset).toBe(12);
  expect(context.pinnedHeaderHeight).toBe(48);
  expect(tabBar.topInset).toBe(12);
  expect(currentGesture().hitSlop).toMatchObject({ top: -116 });

  renderPager({ topInset: undefined, pinnedHeaderHeight: undefined });
  expect(context.topInset).toBe(24);
  expect(currentGesture().hitSlop).toMatchObject({ top: -80 });
});

it.each([
  [-10, 0],
  [NaN, 24],
  [Infinity, 24],
])('keeps inset geometry finite for %s', (topInset, expected) => {
  renderPager({ topInset });
  expect(context.topInset).toBe(expected);
  expect(tabBar.topInset).toBe(expected);
});

it('removes measured header spacing when its renderer is removed', () => {
  renderPager({ renderHeader: () => null });
  const headerProps = jest
    .mocked(Animated.View)
    .mock.calls.findLast(([value]) => value.onLayout)![0];
  const onLayout = headerProps.onLayout;
  if (typeof onLayout !== 'function')
    throw new Error('Expected a header layout callback');
  act(() =>
    onLayout({ nativeEvent: { layout: { height: 200 } } } as LayoutChangeEvent)
  );
  expect(context.headerHeightValue).toBe(200);
  expect(context.minPageContentHeight).toBe(1000);
  renderPager({ renderHeader: undefined });
  expect(context.headerHeight.value).toBe(0);
  expect(context.headerHeightValue).toBe(0);
});

function touchAt(y: number) {
  currentGesture().onTouchesDown!({
    handlerTag: 1,
    allTouches: [{ id: 0, x: 100, y, absoluteX: 100, absoluteY: y }],
  } as TouchEvent);
}

it('allows paging over newly exposed content once the header has collapsed', () => {
  renderPager({ renderHeader: () => null });
  context.headerHeight.value = 200;
  act(() => touchAt(120));
  expect(GestureStateManager.fail).toHaveBeenCalledWith(1);

  jest.mocked(GestureStateManager.fail).mockClear();
  context.perPageScrollY[1]!.value = 200;
  context.scrollY.value = 200;
  act(() => touchAt(120));
  expect(GestureStateManager.fail).not.toHaveBeenCalled();
});

it('accounts for the current scroll-to-top position in the swipe exclusion', () => {
  renderPager({ renderHeader: () => null });
  context.headerHeight.value = 200;
  context.perPageScrollY[1]!.value = 200;
  context.scrollToTopIndex.value = 1;
  context.scrollToTopOffset.value = 0;
  act(() => touchAt(120));
  expect(GestureStateManager.fail).toHaveBeenCalledWith(1);
});

it('keeps stretched chrome out of the swipe region and honors an explicit zero', () => {
  renderPager({ renderHeader: () => null, pullDownBehavior: 'stretch' });
  context.headerHeight.value = 200;
  context.scrollY.value = -56;
  act(() => touchAt(310));
  expect(GestureStateManager.fail).toHaveBeenCalledWith(1);
  jest.mocked(GestureStateManager.fail).mockClear();
  renderPager({ swipeGestureTopInset: 0 });
  act(() => touchAt(310));
  expect(GestureStateManager.fail).not.toHaveBeenCalled();
});

it('reuses the pager config across an unrelated render', () => {
  const previous = currentGesture();
  renderPager();
  expect(currentGesture()).toBe(previous);
});

it.each([
  { sourceOffset: 80, contentHeight: 1000, appliedOffset: 80 },
  { sourceOffset: 300, contentHeight: 1000, appliedOffset: 200 },
  { sourceOffset: 300, contentHeight: 900, appliedOffset: 100 },
])(
  'aligns a lazy page from offset $sourceOffset once its content height is $contentHeight',
  ({ sourceOffset, contentHeight, appliedOffset }) => {
    act(() => root.unmount());
    root = createRoot(host);
    renderPager({
      index: undefined,
      initialIndex: 0,
      lazy: true,
      lazyPreloadDistance: 0,
      renderHeader: () => null,
      estimatedHeaderHeight: 200,
    });
    context.listMounted[0]!.value = true;
    context.perPageScrollY[0]!.value = sourceOffset;
    context.scrollY.value = sourceOffset;

    act(() => pagerRef.current!.setIndex(3, false));
    const expectedOffset = Math.min(sourceOffset, 200);
    expect(context.activeIndex.value).toBe(3);
    expect(context.scrollY.value).toBe(expectedOffset);
    expect(context.perPageScrollY[3]!.value).toBe(expectedOffset);

    // A newly attached list can emit its initial offset before its content
    // is measured. That event must not expand the header during navigation.
    act(() => context.scrollHandlers[3].onScroll({ contentOffset: { y: 0 } }));
    expect(context.scrollY.value).toBe(expectedOffset);

    const flushPendingOffsets = () => {
      for (const [prepare, react] of jest.mocked(useAnimatedReaction).mock
        .calls) {
        const next = prepare() as { pendingOffset?: number | null } | null;
        if (next && typeof next === 'object' && 'pendingOffset' in next) {
          react(next, null);
        }
      }
    };
    context.listMounted[3]!.value = true;
    jest.mocked(scrollTo).mockClear();
    act(flushPendingOffsets);
    expect(scrollTo).not.toHaveBeenCalled();

    context.listScrollMetrics[3]!.value = {
      ...context.listScrollMetrics[3]!.value,
      viewportHeight: 800,
      contentHeight,
    };
    act(flushPendingOffsets);
    expect(scrollTo).toHaveBeenCalledWith(
      context.listRefs[3],
      0,
      appliedOffset,
      false
    );
    expect(context.scrollY.value).toBe(appliedOffset);
    expect(context.perPageScrollY[3]!.value).toBe(appliedOffset);

    act(() =>
      context.scrollHandlers[3].onScroll({ contentOffset: { y: 120 } })
    );
    expect(context.scrollY.value).toBe(120);
  }
);

it.each([
  ['grid', 'feed', 'about', 'flash'],
  ['feed', 'grid'],
  ['feed', 'grid', 'about', 'new-page'],
])('remounts per-page hook state when identities change to %j', (...names) => {
  const previousOffsets = context.perPageScrollY;
  previousOffsets[1]!.value = 120;
  act(() => {
    root.render(
      <Container {...props} ref={pagerRef}>
        {names.map((name) => (
          <Tab key={name} name={name}>
            <ContextProbe />
          </Tab>
        ))}
      </Container>
    );
  });
  expect(context.perPageScrollY).toHaveLength(names.length);
  expect(context.perPageScrollY[1]).not.toBe(previousOffsets[1]);
  expect(context.perPageScrollY[1]!.value).toBe(0);
  expect(pagerRef.current!.getIndex()).toBe(1);
});
