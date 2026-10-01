/** @jest-environment jsdom */
/// <reference lib="dom" />
import {
  act,
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Container } from '../Container';
import { Tab } from '../Tab';
import { registerNativeHeaderScroll } from '../SingleHeader';
import { useTabsContext } from '../../context';
import type {
  ContainerProps,
  HeaderRenderProps,
  TabBarRenderProps,
} from '../../types';

let mockWidth = 300;

jest.mock('react-native', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const flatten = (style: unknown): Record<string, unknown> =>
    Array.isArray(style)
      ? Object.assign({}, ...style.map(flatten))
      : style && typeof style === 'object'
        ? { ...style }
        : {};
  return {
    Platform: { OS: process.env.FLUID_TEST_PLATFORM ?? 'ios' },
    View: ({
      children,
      style,
      onLayout,
      pointerEvents,
    }: {
      children?: ReactNode;
      style?: unknown;
      onLayout?: unknown;
      pointerEvents?: string;
    }) =>
      React.createElement(
        'div',
        {
          'data-style': JSON.stringify(flatten(style)),
          'data-pointer-events': pointerEvents,
          'ref': (element: (HTMLElement & { onLayout?: unknown }) | null) => {
            if (element) element.onLayout = onLayout;
          },
        },
        children
      ),
    ActivityIndicator: () => null,
    StyleSheet: { create: (styles: unknown) => styles, flatten },
    useWindowDimensions: () => ({ width: mockWidth, height: 800 }),
  };
});
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children?: ReactNode }) => children,
  InterceptingGestureDetector: ({ children }: { children?: ReactNode }) =>
    children,
  usePanGesture: (config: object) => ({ ...config, handlerTag: 1 }),
  GestureStateManager: { fail: jest.fn(), activate: jest.fn() },
  useNativeGesture: () => ({ handlerTag: 2 }),
  useCompetingGestures: (pager: object) => pager,
}));
jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: {
      View: jest.requireMock('react-native').View,
      createAnimatedComponent: <T,>(component: T) => component,
    },
    Easing: { out: (easing: unknown) => easing, quad: jest.fn() },
    cancelAnimation: jest.fn(),
    scrollTo: jest.fn(),
    withSpring: (target: number) => target,
    withTiming: (target: number) => target,
    useSharedValue: (initial: unknown) =>
      React.useRef({ value: initial }).current,
    useAnimatedRef: () => React.useRef(() => 1).current,
    useAnimatedScrollHandler: (handlers: unknown) => handlers,
    useAnimatedStyle: () => ({}),
    useAnimatedProps: (updater: () => object) => updater(),
    useAnimatedReaction: jest.fn(),
    useReducedMotion: () => false,
  };
});
jest.mock('react-native-worklets', () => ({
  runOnUISync: (worklet: () => unknown) => worklet(),
  scheduleOnRN: (
    callback: (...args: unknown[]) => unknown,
    ...args: unknown[]
  ) => callback(...args),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../DefaultTabBar', () => ({ DefaultTabBar: () => null }));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const ThemeContext = createContext('light');
const tabs = ['legend', 'flat', 'flash', 'scroll'].map((name) => (
  <Tab key={name} name={name}>
    <span id={`page-${name}`}>{name}</span>
  </Tab>
));
let root: Root;
let host: HTMLDivElement;
let tabBar: TabBarRenderProps;
let props: Omit<ContainerProps, 'children'>;
let theme: string;

function render(updates: Partial<typeof props> = {}) {
  props = { ...props, ...updates };
  act(() =>
    root.render(
      <ThemeContext.Provider value={theme}>
        <Container {...props}>{tabs}</Container>
      </ThemeContext.Provider>
    )
  );
}

function nativeHost({ children }: { children?: ReactNode }) {
  return <section data-native-host="">{children}</section>;
}

function measure(element: Element | null, height: number, width = 300) {
  const target = element as HTMLElement & {
    onLayout?: (event: unknown) => void;
  };
  if (!target?.onLayout) throw new Error('Missing preserved layout callback');
  act(() =>
    target.onLayout!({ nativeEvent: { layout: { x: 0, y: 0, width, height } } })
  );
}

const publicPropKeys = [
  'headerHeight',
  'pinnedHeaderHeight',
  'scrollY',
  'topInset',
];

beforeEach(() => {
  mockWidth = 300;
  theme = 'light';
  registerNativeHeaderScroll(null);
  host = document.createElement('div');
  root = createRoot(host);
  props = {
    renderTabBar: (value) => {
      tabBar = value;
      return null;
    },
  };
});
afterEach(() => {
  act(() => root.unmount());
  registerNativeHeaderScroll(null);
});

it.each([false, true])(
  'avoids renderer and subtree churn on tab changes, native host=%s',
  (native) => {
    if (native)
      registerNativeHeaderScroll({ Host: nativeHost, Page: nativeHost });
    const headerMounts = jest.fn();
    function Header() {
      headerMounts();
      return <span id="header">header</span>;
    }
    const header = jest.fn(() => <Header />);
    const pinned = jest.fn(() => <span id="pinned">pinned</span>);
    render({ renderHeader: header, renderPinnedHeader: pinned });
    const headerElement = host.querySelector('#header');
    const pinnedElement = host.querySelector('#pinned');
    const headerWrapper = headerElement?.parentElement;
    const baselineHeader = header.mock.calls.length;
    const baselinePinned = pinned.mock.calls.length;
    const baselineChild = headerMounts.mock.calls.length;
    for (const index of [1, 2, 3, 0]) act(() => tabBar.onTabPress(index));
    expect(tabBar.selectedIndex).toBe(0);
    expect(header.mock.calls.length).toBe(baselineHeader);
    expect(pinned.mock.calls.length).toBe(baselinePinned);
    expect(headerMounts.mock.calls.length).toBe(baselineChild);
    expect(host.querySelector('#header')).toBe(headerElement);
    expect(host.querySelector('#pinned')).toBe(pinnedElement);
    expect(headerElement?.parentElement).toBe(headerWrapper);
    expect(headerWrapper?.getAttribute('data-pointer-events')).toBe('box-none');
  }
);

it('passes fresh top inset and explicit pinned height without widening the public render props', () => {
  const header = jest.fn((value: HeaderRenderProps) => (
    <span id="header">{value.topInset}</span>
  ));
  const pinned = jest.fn((value: HeaderRenderProps) => (
    <span id="pinned">{value.pinnedHeaderHeight}</span>
  ));
  render({
    renderHeader: header,
    renderPinnedHeader: pinned,
    pinnedHeaderHeight: 40,
  });
  render({ topInset: 30, pinnedHeaderHeight: 60 });
  const lastHeader = header.mock.calls.at(-1)![0];
  const lastPinned = pinned.mock.calls.at(-1)![0];
  expect(lastHeader).toMatchObject({ topInset: 30, pinnedHeaderHeight: 60 });
  expect(lastPinned).toMatchObject({ topInset: 30, pinnedHeaderHeight: 60 });
  expect(Object.keys(lastHeader).sort()).toEqual(publicPropKeys);
  expect(Object.keys(lastPinned).sort()).toEqual(publicPropKeys);
  expect(host.querySelector('#header')?.textContent).toBe('30');
  expect(host.querySelector('#pinned')?.textContent).toBe('60');
});

it('invalidates both renderer outputs on fallback window width changes', () => {
  const header = jest.fn(() => <span id="header">{mockWidth}</span>);
  const pinned = jest.fn(() => <span id="pinned">{mockWidth}</span>);
  render({ renderHeader: header, renderPinnedHeader: pinned });
  const headerCalls = header.mock.calls.length;
  const pinnedCalls = pinned.mock.calls.length;
  mockWidth = 400;
  render();
  expect(header.mock.calls.length).toBeGreaterThan(headerCalls);
  expect(pinned.mock.calls.length).toBeGreaterThan(pinnedCalls);
  expect(host.querySelector('#header')?.textContent).toBe('400');
  expect(host.querySelector('#pinned')?.textContent).toBe('400');
});

it('invalidates both renderer outputs when the measured pager width changes', () => {
  const header = jest.fn(() => <span id="header">header</span>);
  const pinned = jest.fn(() => <span id="pinned">pinned</span>);
  render({ renderHeader: header, renderPinnedHeader: pinned });
  const pager = [...host.querySelectorAll('div')].find(
    (node) =>
      JSON.parse(node.getAttribute('data-style') ?? '{}').overflow === 'hidden'
  );
  const headerCalls = header.mock.calls.length;
  const pinnedCalls = pinned.mock.calls.length;
  measure(pager ?? null, 800, 250);
  expect(header.mock.calls.length).toBeGreaterThan(headerCalls);
  expect(pinned.mock.calls.length).toBeGreaterThan(pinnedCalls);
});

it('updates on renderer identity changes while keeping child local state and DOM identity', () => {
  let setCount!: (value: number) => void;
  function Header({ label }: { label: string }) {
    const [count, update] = useState(0);
    setCount = update;
    return (
      <span id="header">
        {label}:{count}
      </span>
    );
  }
  render({ renderHeader: () => <Header label="first" /> });
  const element = host.querySelector('#header');
  act(() => setCount(3));
  render({ renderHeader: () => <Header label="next" /> });
  expect(host.querySelector('#header')).toBe(element);
  expect(element?.textContent).toBe('next:3');
});

it('propagates descendant external context without re-invoking the unchanged renderer', () => {
  const renders = jest.fn();
  function Header() {
    renders();
    return <span id="header">{useContext(ThemeContext)}</span>;
  }
  const renderer = jest.fn(() => <Header />);
  render({ renderHeader: renderer });
  const calls = renderer.mock.calls.length;
  const childRenders = renders.mock.calls.length;
  theme = 'dark';
  render();
  expect(host.querySelector('#header')?.textContent).toBe('dark');
  expect(renders.mock.calls.length).toBeGreaterThan(childRenders);
  expect(renderer.mock.calls.length).toBe(calls);
});

it('preserves context subscriptions read directly by an existing renderer', () => {
  const renderWithContext = jest.fn(() => {
    const currentTheme = useContext(ThemeContext);
    return <span id="header">{currentTheme}</span>;
  });
  render({ renderHeader: renderWithContext });
  const calls = renderWithContext.mock.calls.length;
  theme = 'dark';
  render();
  expect(renderWithContext.mock.calls.length).toBeGreaterThan(calls);
  expect(host.querySelector('#header')?.textContent).toBe('dark');
});

it('lets header child state updates render without recreating renderer output', () => {
  let setLabel!: (value: string) => void;
  function Header() {
    const [label, update] = useState('initial');
    setLabel = update;
    return <span id="header">{label}</span>;
  }
  const renderer = jest.fn(() => <Header />);
  render({ renderHeader: renderer });
  const calls = renderer.mock.calls.length;
  const element = host.querySelector('#header');
  act(() => setLabel('updated'));
  expect(element?.textContent).toBe('updated');
  expect(renderer.mock.calls.length).toBe(calls);
  expect(host.querySelector('#header')).toBe(element);
});

it('propagates tabs context and keeps measured header-height callbacks functional after tab changes', () => {
  let context!: ReturnType<typeof useTabsContext>;
  function Header() {
    context = useTabsContext();
    return (
      <span id="header">
        {context.headerHeightValue}:{context.tabBarHeight}
      </span>
    );
  }
  const renderer = jest.fn(() => <Header />);
  render({ renderHeader: renderer, estimatedHeaderHeight: 120 });
  const element = host.querySelector('#header');
  const wrapper = element?.parentElement ?? null;
  act(() => tabBar.onTabPress(1));
  const calls = renderer.mock.calls.length;
  measure(wrapper, 180);
  expect(context.headerHeight.value).toBe(180);
  expect(context.headerHeightValue).toBe(180);
  expect(element?.textContent).toBe('180:56');
  render({ tabBarHeight: 64 });
  expect(element?.textContent).toBe('180:64');
  expect(renderer.mock.calls.length).toBe(calls);
  expect(host.querySelector('#header')).toBe(element);
  expect(element?.parentElement).toBe(wrapper);
});

it('preserves automatic pinned measurement and explicit-height onLayout semantics', () => {
  let latest!: HeaderRenderProps;
  const header = (value: HeaderRenderProps) => {
    latest = value;
    return <span id="header">header</span>;
  };
  const pinned = jest.fn(() => <span id="pinned">pinned</span>);
  render({ renderHeader: header, renderPinnedHeader: pinned });
  const wrapper = host.querySelector('#pinned')?.parentElement ?? null;
  measure(wrapper, 84);
  expect(latest.pinnedHeaderHeight).toBe(60);
  act(() => tabBar.onTabPress(2));
  measure(wrapper, 100);
  expect(latest.pinnedHeaderHeight).toBe(76);
  render({ pinnedHeaderHeight: 50 });
  expect(
    (wrapper as HTMLElement & { onLayout?: unknown }).onLayout
  ).toBeUndefined();
  expect(latest.pinnedHeaderHeight).toBe(50);
  expect(JSON.parse(wrapper!.getAttribute('data-style')!)).toMatchObject({
    height: 74,
  });
});

it('still removes and re-adds optional headers without changing page identity', () => {
  let context!: ReturnType<typeof useTabsContext>;
  const renderer = () => {
    function Header() {
      context = useTabsContext();
      return <span id="header">header</span>;
    }
    return <Header />;
  };
  render({
    renderHeader: renderer,
    renderPinnedHeader: () => <span id="pinned">pinned</span>,
  });
  const page = host.querySelector('#page-legend');
  measure(host.querySelector('#header')?.parentElement ?? null, 180);
  render({ renderHeader: undefined, renderPinnedHeader: undefined });
  expect(host.querySelector('#header')).toBeNull();
  expect(host.querySelector('#pinned')).toBeNull();
  render({ renderHeader: renderer });
  expect(host.querySelector('#header')).not.toBeNull();
  expect(host.querySelector('#page-legend')).toBe(page);
  expect(context.headerHeightValue).toBe(180);
});
