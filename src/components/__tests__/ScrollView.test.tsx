/** @jest-environment jsdom */
/// <reference lib="dom" />

import type { ReactElement, ReactNode, Ref } from 'react';

import type { InternalTabsContextValue } from '../../types';

// Contract tests for the ScrollView adapter. Each test loads a fresh module
// registry, because the adapter captures the platform at module evaluation.
let mockPlatformOS = 'android';
let mockScrollProps: Record<string, any>;
let mockDetectors: { gesture: unknown; child: unknown }[];
let mockRefreshArgs: unknown[][];
let mockMetricsCallbacks: Record<string, unknown>[];
const mockScrollNode = { node: 'scroll-view' };
const mockRefreshElement = { sentinel: 'refresh-control' };
const mockMetricsOnLayout = () => {};
const mockMetricsOnSize = () => {};

jest.mock('react-native', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    Platform: { OS: mockPlatformOS },
    View: ({
      style,
      children,
    }: {
      style?: { height?: number };
      children?: ReactNode;
    }) =>
      React.createElement('div', { 'data-height': style?.height }, children),
  };
});
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({
    gesture,
    children,
  }: {
    gesture?: unknown;
    children?: ReactElement;
  }) => {
    mockDetectors.push({ gesture, child: children?.type });
    return children ?? null;
  },
}));
jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: {
      createAnimatedComponent: <T,>(component: T) => component,
      View: ({ style }: { style?: { height?: number } }) =>
        React.createElement('div', { 'data-spacer': style?.height }),
      ScrollView: function MockAnimatedScrollView(
        props: Record<string, any> & { ref?: Ref<unknown> }
      ) {
        mockScrollProps = props;
        React.useImperativeHandle(props.ref, () => mockScrollNode, []);
        return React.createElement(
          'div',
          { 'data-scroller': '' },
          props.children
        );
      },
    },
    useAnimatedStyle: (updater: () => object) => updater(),
    useAnimatedProps: (updater: () => object) => updater(),
  };
});
jest.mock('../useAutoRefreshControl', () => ({
  useAutoRefreshControl: (...args: unknown[]) => {
    mockRefreshArgs.push(args);
    return mockRefreshElement;
  },
}));
jest.mock('../useListScrollMetrics', () => ({
  useListScrollMetrics: (
    _metrics: unknown,
    callbacks: Record<string, unknown>
  ) => {
    mockMetricsCallbacks.push(callbacks);
    return {
      onLayout: mockMetricsOnLayout,
      onContentSizeChange: mockMetricsOnSize,
    };
  },
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Loaded = {
  React: typeof import('react');
  root: import('react-dom/client').Root;
  context: typeof import('../../context');
  singleHeader: typeof import('../SingleHeader');
  ScrollView: typeof import('../ScrollView').ScrollView;
};

const nativeGesture = { handlerTag: 7 };
const pagerScrollHandler = { sentinel: 'pager-scroll-handler' };
let loaded: Loaded;
let host: HTMLDivElement;
let listRef: ((instance: unknown) => void) & { current: unknown };
let listRefCalls: unknown[];
let tabsContext: InternalTabsContextValue;

function load(os: 'android' | 'ios' | 'web') {
  if (loaded) loaded.React.act(() => loaded.root.unmount());
  jest.resetModules();
  mockPlatformOS = os;
  const React = require('react') as typeof import('react');
  const { createRoot } =
    require('react-dom/client') as typeof import('react-dom/client');
  loaded = {
    React,
    root: createRoot(host),
    context: require('../../context'),
    singleHeader: require('../SingleHeader'),
    ScrollView: require('../ScrollView').ScrollView,
  };
}

function render(
  props: Record<string, unknown> = {},
  children: ReactNode = null,
  ref?: Ref<unknown>,
  tabIndex = 0
) {
  const { React, root, context, singleHeader, ScrollView } = loaded;
  const h = React.createElement;
  const tree = h(
    context.TabsContext.Provider,
    { value: tabsContext },
    h(
      context.TabIndexContext.Provider,
      { value: tabIndex },
      h(ScrollView as any, { ref, ...props }, children)
    )
  );
  // The Container's root: a plain View unless native header scroll is registered.
  React.act(() =>
    root.render(
      h(
        singleHeader.SingleHeaderHost,
        { activeIndex: { value: tabIndex }, paging: { value: false } } as any,
        tree
      )
    )
  );
}

/** Moves the page's Container state to another tab index. */
function placeAtTab(index: number) {
  const at = <V,>(value: V) => {
    const values: V[] = [];
    values[index] = value;
    return values;
  };
  tabsContext = {
    ...tabsContext,
    listRefs: at(tabsContext.listRefs[0]!),
    listMounted: at(tabsContext.listMounted[0]!),
    listScrollMetrics: at(tabsContext.listScrollMetrics[0]!),
    listNativeGestures: at(tabsContext.listNativeGestures[0]!),
    scrollHandlers: at(tabsContext.scrollHandlers[0]!),
  };
}

beforeEach(() => {
  mockDetectors = [];
  mockRefreshArgs = [];
  mockMetricsCallbacks = [];
  listRefCalls = [];
  listRef = Object.assign(
    (instance: unknown) => {
      listRef.current = instance;
      listRefCalls.push(instance);
    },
    { current: null as unknown }
  );
  tabsContext = {
    listRefs: [listRef],
    listMounted: [{ value: false }],
    listScrollMetrics: [{ value: {} }],
    listNativeGestures: [nativeGesture],
    scrollHandlers: [pagerScrollHandler],
    headerHeight: { value: 200 },
    pinnedHeaderHeight: 30,
    topInset: 20,
    tabBarHeight: 50,
    bottomInset: 10,
    minPageContentHeight: 900,
  } as unknown as InternalTabsContextValue;
  host = document.createElement('div');
  document.body.appendChild(host);
  load('android');
});

afterEach(() => {
  loaded.React.act(() => loaded.root.unmount());
  host.remove();
});

it('forwards consumer props and keeps its own scroll handler and throttle', () => {
  const consumerOnScroll = jest.fn();
  render({
    keyboardDismissMode: 'on-drag',
    // Reserved by the props type; forced values must still win at runtime.
    ...({ onScroll: consumerOnScroll, scrollEventThrottle: 16 } as object),
  });

  expect(mockScrollProps.keyboardDismissMode).toBe('on-drag');
  expect(mockScrollProps.onScroll).toBe(pagerScrollHandler);
  expect(mockScrollProps.scrollEventThrottle).toBe(1);
});

it('omits absent drag and momentum callbacks and appends supplied ones after onScroll', () => {
  // Explicitly undefined callbacks must be omitted as well as missing ones.
  render({
    onScrollBeginDrag: undefined,
    onMomentumScrollBegin: undefined,
    onMomentumScrollEnd: undefined,
  });
  for (const key of [
    'onScrollBeginDrag',
    'onMomentumScrollBegin',
    'onMomentumScrollEnd',
  ]) {
    expect(Object.prototype.hasOwnProperty.call(mockScrollProps, key)).toBe(
      false
    );
  }

  const callbacks = {
    onScrollBeginDrag: jest.fn(),
    onMomentumScrollBegin: jest.fn(),
    onMomentumScrollEnd: jest.fn(),
  };
  render(callbacks);
  const keys = Object.keys(mockScrollProps);
  for (const [key, callback] of Object.entries(callbacks)) {
    expect(mockScrollProps[key]).toBe(callback);
    expect(keys.indexOf(key)).toBeGreaterThan(keys.indexOf('onScroll'));
  }
});

it('keeps adapter-owned props off the scroll view', () => {
  render({ minContentHeight: 120 });

  expect(
    Object.prototype.hasOwnProperty.call(mockScrollProps, 'minContentHeight')
  ).toBe(false);
});

it('routes consumer layout callbacks through the scroll metrics wrapper', () => {
  const onLayout = jest.fn();
  const onContentSizeChange = jest.fn();
  render({ onLayout, onContentSizeChange });

  expect(mockMetricsCallbacks.at(-1)).toMatchObject({
    onLayout,
    onContentSizeChange,
  });
  expect(mockScrollProps.onLayout).toBe(mockMetricsOnLayout);
  expect(mockScrollProps.onContentSizeChange).toBe(mockMetricsOnSize);
});

it('puts the injected minHeight before consumer content style', () => {
  const consumerStyle = { paddingTop: 4 };
  render({ contentContainerStyle: consumerStyle });
  expect(mockScrollProps.contentContainerStyle).toEqual([
    { minHeight: 900 },
    consumerStyle,
  ]);

  render({ minContentHeight: 0 });
  expect(mockScrollProps.contentContainerStyle[0]).toEqual({ minHeight: 0 });
});

it('defaults platform scroll props and honors consumer overrides', () => {
  render();
  expect(mockScrollProps).toMatchObject({
    overScrollMode: 'never',
    directionalLockEnabled: true,
    nestedScrollEnabled: true,
    showsVerticalScrollIndicator: false,
  });

  render({ overScrollMode: 'always', showsVerticalScrollIndicator: true });
  expect(mockScrollProps.overScrollMode).toBe('always');
  expect(mockScrollProps.showsVerticalScrollIndicator).toBe(true);
});

it('passes only an explicit refresh control to the refresh hook', () => {
  const control = { sentinel: 'consumer-control' };
  render({ refreshControl: control });

  const args = mockRefreshArgs.at(-1)!;
  expect(args[0]).toBe(control);
  expect(args[1]).toBe(nativeGesture);
  expect(args[2]).toBeUndefined();
  expect(mockScrollProps.refreshControl).toBe(mockRefreshElement);
});

it('places the spacers around its children and shifts sticky indices past the top spacer', () => {
  const { React } = loaded;
  render({ stickyHeaderIndices: [0, 2] }, [
    React.createElement('span', { key: 'a' }, 'first'),
    React.createElement('span', { key: 'b' }, 'second'),
  ]);

  const nodes = Array.from(
    host.querySelectorAll('[data-spacer], span, [data-height]')
  );
  expect(
    nodes.map(
      (node) =>
        node.getAttribute('data-spacer') ??
        node.getAttribute('data-height') ??
        node.textContent
    )
  ).toEqual(['300', 'first', 'second', '26']);
  expect(mockScrollProps.stickyHeaderIndices).toEqual([1, 3]);

  render();
  expect(mockScrollProps.stickyHeaderIndices).toBeUndefined();
});

it('exposes the native scroll view through the public ref and the Container ref', () => {
  const publicRef = loaded.React.createRef<unknown>();
  render({}, null, publicRef);

  expect(listRef.current).toBe(mockScrollNode);
  expect(publicRef.current).toBe(mockScrollNode);
  expect(tabsContext.listMounted[0]!.value).toBe(true);
});

it('hosts the Native gesture directly around the scroll view', () => {
  const Animated = require('react-native-reanimated').default;
  render();

  expect(mockDetectors).toHaveLength(1);
  expect(mockDetectors[0]).toEqual({
    gesture: nativeGesture,
    child: Animated.ScrollView,
  });
});

it('renders a bare scroll view on web, without a gesture detector', () => {
  load('web');
  render();

  expect(mockDetectors).toHaveLength(0);
  expect(host.querySelector('[data-scroller]')).not.toBeNull();
  expect(listRef.current).toBe(mockScrollNode);
});

it('registers the scroll view as its page when native header scroll is enabled', () => {
  load('ios');
  const { React, singleHeader } = loaded;
  const h = React.createElement;
  singleHeader.registerNativeHeaderScroll({
    Host: ({ children }) => h('div', { 'data-host': '' }, children),
    Page: ({ pageIndex, children }) =>
      h('section', { 'data-page': pageIndex }, children),
  });
  placeAtTab(1);
  render({}, null, undefined, 1);

  const Animated = require('react-native-reanimated').default;
  expect(
    host.querySelector('[data-host] section[data-page="1"] [data-scroller]')
  ).not.toBeNull();
  expect(mockDetectors).toEqual([
    { gesture: nativeGesture, child: Animated.ScrollView },
  ]);
  expect(listRef.current).toBe(mockScrollNode);
});

it('keeps refs attached across updates and detaches them on unmount', () => {
  const calls: unknown[] = [];
  const publicRef = (instance: unknown) => {
    calls.push(instance);
  };
  render({}, null, publicRef);
  render({ keyboardDismissMode: 'on-drag' }, null, publicRef);
  // Every delivery, so a transient detach and reattach would show up too.
  expect(calls).toEqual([mockScrollNode]);
  expect(listRefCalls).toEqual([mockScrollNode]);

  loaded.React.act(() => loaded.root.render(null));
  expect(calls.at(-1)).toBeNull();
  expect(listRefCalls).toEqual([mockScrollNode, null]);
  expect(tabsContext.listMounted[0]!.value).toBe(false);
});
