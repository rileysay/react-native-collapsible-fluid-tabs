/** @jest-environment jsdom */
/// <reference lib="dom" />

import type { ReactElement, ReactNode, Ref } from 'react';

import type { InternalTabsContextValue } from '../../types';

// Contract tests for the FlashList adapter. Each test loads a fresh module
// registry, because the adapter captures the platform at module evaluation.
let mockPlatformOS = 'android';
let mockFlashProps: Record<string, any>;
let mockDetectors: { gesture: unknown; child: unknown }[];
let mockRefreshArgs: unknown[][];
let mockMetricsCallbacks: Record<string, unknown>[];
let mockInnerScrollProps: Record<string, any>;
const mockFlashInstance = { scrollToIndex: () => {} };
const mockScrollNode = { node: 'flash-scroller' };
const mockRefreshElement = { sentinel: 'refresh-control' };
const mockMetricsOnLayout = () => {};
const mockMetricsOnSize = () => {};
const mockInnerOnScroll = () => {};
const mockInnerRefresh = { sentinel: 'flash-refresh-control' };

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
    ScrollView: function MockScrollView(
      props: Record<string, any> & { ref?: Ref<unknown>; children?: ReactNode }
    ) {
      mockInnerScrollProps = props;
      React.useImperativeHandle(props.ref, () => mockScrollNode, []);
      return React.createElement(
        'div',
        { 'data-scroller': '' },
        props.children
      );
    },
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
    },
    useAnimatedStyle: (updater: () => object) => updater(),
    useAnimatedProps: (updater: () => object) => updater(),
  };
});
jest.mock('@shopify/flash-list', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    FlashList: function MockFlashList(props: Record<string, any>) {
      mockFlashProps = props;
      React.useImperativeHandle(props.ref, () => mockFlashInstance, []);
      const Scroll = props.renderScrollComponent;
      return React.createElement(
        React.Fragment,
        null,
        props.ListHeaderComponent,
        Scroll
          ? // FlashList hands its scroller the ref, events, refresh control and cells.
            React.createElement(Scroll, {
              ref: mockFlashScrollRef,
              onScroll: mockInnerOnScroll,
              refreshControl: mockInnerRefresh,
              children: 'cells',
            })
          : null,
        props.ListFooterComponent
      );
    },
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

const mockFlashScrollRef = jest.fn();

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Loaded = {
  React: typeof import('react');
  root: import('react-dom/client').Root;
  context: typeof import('../../context');
  singleHeader: typeof import('../SingleHeader');
  FlashList: typeof import('../FlashList').FlashList;
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
    FlashList: require('../FlashList').FlashList,
  };
}

function render(
  props: Record<string, unknown> = {},
  ref?: Ref<unknown>,
  tabIndex = 0
) {
  const { React, root, context, singleHeader, FlashList } = loaded;
  const h = React.createElement;
  const tree = h(
    context.TabsContext.Provider,
    { value: tabsContext },
    h(
      context.TabIndexContext.Provider,
      { value: tabIndex },
      h(FlashList as any, {
        data: [{ id: 'post' }],
        renderItem: () => null,
        ref,
        ...props,
      })
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
  mockFlashScrollRef.mockClear();
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
    drawDistance: 250,
    // Reserved by the props type; forced values must still win at runtime.
    ...({ onScroll: consumerOnScroll, scrollEventThrottle: 16 } as object),
  });

  expect(mockFlashProps.drawDistance).toBe(250);
  expect(mockFlashProps.onScroll).toBe(pagerScrollHandler);
  expect(mockFlashProps.scrollEventThrottle).toBe(1);
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
    expect(Object.prototype.hasOwnProperty.call(mockFlashProps, key)).toBe(
      false
    );
  }

  const callbacks = {
    onScrollBeginDrag: jest.fn(),
    onMomentumScrollBegin: jest.fn(),
    onMomentumScrollEnd: jest.fn(),
  };
  render(callbacks);
  const keys = Object.keys(mockFlashProps);
  for (const [key, callback] of Object.entries(callbacks)) {
    expect(mockFlashProps[key]).toBe(callback);
    expect(keys.indexOf(key)).toBeGreaterThan(keys.indexOf('onScroll'));
  }
});

it('keeps adapter-owned props off the list', () => {
  render({
    minContentHeight: 120,
    onRefresh: jest.fn(),
    refreshing: false,
    progressViewOffset: 8,
  });

  for (const key of [
    'minContentHeight',
    'onRefresh',
    'refreshing',
    'progressViewOffset',
  ]) {
    expect(Object.prototype.hasOwnProperty.call(mockFlashProps, key)).toBe(
      false
    );
  }
});

it('routes consumer layout callbacks through the scroll metrics wrapper', () => {
  const onLayout = jest.fn();
  const onContentSizeChange = jest.fn();
  render({ onLayout, onContentSizeChange });

  expect(mockMetricsCallbacks.at(-1)).toMatchObject({
    onLayout,
    onContentSizeChange,
  });
  expect(mockFlashProps.onLayout).toBe(mockMetricsOnLayout);
  expect(mockFlashProps.onContentSizeChange).toBe(mockMetricsOnSize);
});

it('puts the injected minHeight before consumer content style', () => {
  const consumerStyle = { paddingTop: 4 };
  render({ contentContainerStyle: consumerStyle });
  expect(mockFlashProps.contentContainerStyle).toEqual([
    { minHeight: 900 },
    consumerStyle,
  ]);

  render({ minContentHeight: 0 });
  expect(mockFlashProps.contentContainerStyle[0]).toEqual({ minHeight: 0 });
});

it('defaults platform scroll props and honors consumer overrides', () => {
  render();
  expect(mockFlashProps).toMatchObject({
    overScrollMode: 'never',
    directionalLockEnabled: true,
    nestedScrollEnabled: true,
    showsVerticalScrollIndicator: false,
  });

  render({ overScrollMode: 'always', showsVerticalScrollIndicator: true });
  expect(mockFlashProps.overScrollMode).toBe('always');
  expect(mockFlashProps.showsVerticalScrollIndicator).toBe(true);
});

it('passes refresh shorthand and the list gesture to the refresh hook', () => {
  const onRefresh = jest.fn();
  render({ onRefresh, refreshing: true, progressViewOffset: 12 });

  expect(mockRefreshArgs.at(-1)).toEqual([
    undefined,
    nativeGesture,
    { onRefresh, refreshing: true, progressViewOffset: 12 },
  ]);
  expect(mockFlashProps.refreshControl).toBe(mockRefreshElement);
  expect(mockFlashProps).not.toHaveProperty('onRefresh');
  expect(mockFlashProps).not.toHaveProperty('refreshing');
});

it('wraps consumer header and footer with the chrome and safe-area spacers', () => {
  const { React } = loaded;
  render({
    ListHeaderComponent: React.createElement('span', null, 'header'),
    ListFooterComponent: () => React.createElement('span', null, 'footer'),
  });

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
  ).toEqual([
    // headerHeight + pinned + topInset + tabBar
    '300',
    'header',
    'footer',
    // bottomInset + FOOTER_GAP
    '26',
  ]);
});

it('keeps the public ref on the FlashList instance and fans the scroll node out', () => {
  const publicRef = loaded.React.createRef<unknown>();
  render({}, publicRef);

  expect(publicRef.current).toBe(mockFlashInstance);
  // FlashList's own scroll ref and the Container's animated ref both get the node.
  expect(mockFlashScrollRef).toHaveBeenLastCalledWith(mockScrollNode);
  expect(listRef.current).toBe(mockScrollNode);
  expect(tabsContext.listMounted[0]!.value).toBe(true);
});

it('hosts the Native gesture directly around the inner scroll view', () => {
  const { ScrollView } = require('react-native');
  render();

  expect(mockDetectors).toHaveLength(1);
  expect(mockDetectors[0]).toEqual({
    gesture: nativeGesture,
    child: ScrollView,
  });
});

it('renders a bare scroller on web, without a gesture detector', () => {
  load('web');
  render();

  expect(mockDetectors).toHaveLength(0);
  expect(host.querySelector('[data-scroller]')).not.toBeNull();
  expect(listRef.current).toBe(mockScrollNode);
});

it('forwards FlashList scroller props, refresh control and cells to the scroll view', () => {
  render();

  expect(mockInnerScrollProps.onScroll).toBe(mockInnerOnScroll);
  expect(mockInnerScrollProps.refreshControl).toBe(mockInnerRefresh);
  expect(host.querySelector('[data-scroller]')?.textContent).toBe('cells');
});

it('registers the inner scroller as its page when native header scroll is enabled', () => {
  load('ios');
  const { React, singleHeader } = loaded;
  const h = React.createElement;
  singleHeader.registerNativeHeaderScroll({
    Host: ({ children }) => h('div', { 'data-host': '' }, children),
    Page: ({ pageIndex, children }) =>
      h('section', { 'data-page': pageIndex }, children),
  });
  placeAtTab(1);
  render({}, undefined, 1);

  const { ScrollView } = require('react-native');
  expect(
    host.querySelector('[data-host] section[data-page="1"] [data-scroller]')
  ).not.toBeNull();
  expect(mockDetectors).toEqual([
    { gesture: nativeGesture, child: ScrollView },
  ]);
  expect(listRef.current).toBe(mockScrollNode);
});

it('keeps refs attached across updates and detaches them on unmount', () => {
  render();
  render({ drawDistance: 300 });
  expect(listRefCalls).not.toContain(null);
  expect(mockFlashScrollRef).not.toHaveBeenCalledWith(null);

  loaded.React.act(() => loaded.root.render(null));
  expect(listRefCalls.at(-1)).toBeNull();
  expect(mockFlashScrollRef).toHaveBeenLastCalledWith(null);
  expect(tabsContext.listMounted[0]!.value).toBe(false);
});
