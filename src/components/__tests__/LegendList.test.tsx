/** @jest-environment jsdom */
/// <reference lib="dom" />

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Platform, type ScrollViewProps } from 'react-native';
import Animated from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import type { AnimatedLegendListSharedValues } from '@legendapp/list/reanimated';

import { TabIndexContext, TabsContext } from '../../context';
import type { InternalTabsContextValue } from '../../types';
import { getHeaderScrollOffset } from '../../utils/paging';
import { LegendList } from '../LegendList';

type ListProps = {
  sharedValues?: AnimatedLegendListSharedValues;
  onScroll: (event: { contentOffset: { y: number } }) => void;
  style?: unknown;
  renderScrollComponent?: (
    props: ScrollViewProps
  ) => React.ReactElement<ScrollViewProps>;
};
let mockListProps: ListProps;
let mockNativeOffset: number;

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  View: ({ children }: { children?: ReactNode }) => children ?? null,
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children?: ReactNode }) => children ?? null,
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: {
    View: ({ children }: { children?: ReactNode }) => children ?? null,
    ScrollView: ({ children }: { children?: ReactNode }) => children ?? null,
  },
  useAnimatedStyle: (updater: () => object) => updater(),
}));
jest.mock('../useAutoRefreshControl', () => ({
  useAutoRefreshControl: () => undefined,
}));
jest.mock('@legendapp/list/reanimated', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    AnimatedLegendList: (props: ListProps) => {
      mockListProps = props;
      // LegendList 3.3 seeds a supplied scrollOffset from its JS state on
      // sharedValues changes, and independently tracks native scroll events.
      React.useEffect(() => {
        if (props.sharedValues?.scrollOffset)
          props.sharedValues.scrollOffset.value = mockNativeOffset;
      }, [props.sharedValues]);
      return null;
    },
  };
});

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function shared<T>(value: T): SharedValue<T> {
  const result = {
    value,
    modify(fn: (current: T) => T) {
      result.value = fn(result.value);
    },
  };
  return result as SharedValue<T>;
}

let root: Root;
let host: HTMLDivElement;
let context: InternalTabsContextValue;
let headerOwnsScroll: boolean;

function renderList(
  sharedValues?: Omit<AnimatedLegendListSharedValues, 'scrollOffset'>,
  renderScrollComponent?: ListProps['renderScrollComponent']
) {
  act(() =>
    root.render(
      <TabsContext.Provider value={context}>
        <TabIndexContext.Provider value={0}>
          <LegendList
            data={[{ id: 'post' }]}
            renderItem={() => null}
            sharedValues={sharedValues}
            renderScrollComponent={renderScrollComponent}
          />
        </TabIndexContext.Provider>
      </TabsContext.Provider>
    )
  );
}

function emitNativeScroll(y: number) {
  mockNativeOffset = y;
  // Model useScrollViewOffset: this listener bypasses the pager's onScroll
  // ownership guard when the adapter supplies the same shared value twice.
  if (mockListProps.sharedValues?.scrollOffset)
    mockListProps.sharedValues.scrollOffset.value = y;
  mockListProps.onScroll({ contentOffset: { y } });
}

function headerOffset() {
  return getHeaderScrollOffset(
    0,
    1,
    context.perPageScrollY,
    context.scrollY,
    -1,
    0
  );
}

beforeEach(() => {
  Platform.OS = 'android';
  mockNativeOffset = 0;
  headerOwnsScroll = false;
  const pageY = shared(0);
  const scrollY = shared(0);
  context = {
    listRefs: [],
    listMounted: [],
    listNativeGestures: [],
    listScrollMetrics: [
      shared({
        contentHeight: 1000,
        viewportHeight: 600,
        enabled: true,
        deceleration: 0.985,
      }),
    ],
    perPageScrollY: [pageY],
    scrollY,
    scrollHandlers: [
      (event: { contentOffset: { y: number } }) => {
        if (headerOwnsScroll) return;
        pageY.value = event.contentOffset.y;
        scrollY.value = event.contentOffset.y;
      },
    ],
    headerHeight: shared(250),
    pinnedHeaderHeight: 0,
    topInset: 24,
    tabBarHeight: 56,
    bottomInset: 0,
    minPageContentHeight: 850,
  } as unknown as InternalTabsContextValue;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it('gives the web scroller a bounded height so the mouse wheel can scroll', () => {
  renderList();
  const style = mockListProps.style as object[];
  expect(style[0]).toEqual({ flex: 1, minHeight: 0, height: '100%' });
});

it('keeps web virtualization receiving scroll events between the start and end', () => {
  Platform.OS = 'web';
  renderList();
  const onScroll = jest.fn();
  const ref = jest.fn();
  const children = <span>Recycled row</span>;
  // This is the internal scroller contract in LegendList 3.3. Its zero
  // throttle means RN Web emits only the start and the delayed end event.
  const props = { scrollEventThrottle: 0, onScroll, ref, children };
  const scrollView = mockListProps.renderScrollComponent!(props);
  expect(scrollView.type).toBe(Animated.ScrollView);
  expect(scrollView.props.scrollEventThrottle).toBe(1);
  expect(scrollView.props.onScroll).toBe(onScroll);
  expect(scrollView.props.children).toBe(children);
  expect((scrollView.props as typeof props).ref).toBe(ref);
});

it('leaves the native scroller and consumer custom scroll components unchanged', () => {
  renderList();
  expect(mockListProps.renderScrollComponent).toBeUndefined();
  const custom = jest.fn(() => <Animated.ScrollView />);
  for (const platform of ['android', 'ios', 'web'] as const) {
    Platform.OS = platform;
    renderList(undefined, custom);
    expect(mockListProps.renderScrollComponent).toBe(custom);
  }
});

it('does not let a delayed native echo pull the header behind a chrome drag', () => {
  renderList();
  headerOwnsScroll = true;
  context.perPageScrollY[0]!.value = 120;
  context.scrollY.value = 120;
  emitNativeScroll(80);
  expect(headerOffset()).toBe(120);

  headerOwnsScroll = false;
  emitNativeScroll(130);
  expect(headerOffset()).toBe(130);
  expect(context.scrollY.value).toBe(130);
});

it('does not reset a dragged header when consumer sharedValues changes', () => {
  renderList();
  headerOwnsScroll = true;
  context.perPageScrollY[0]!.value = 120;
  context.scrollY.value = 120;
  const isAtEnd = shared(false);
  renderList({ isAtEnd });
  expect(headerOffset()).toBe(120);
  expect(mockListProps.sharedValues?.isAtEnd).toBe(isAtEnd);
});
