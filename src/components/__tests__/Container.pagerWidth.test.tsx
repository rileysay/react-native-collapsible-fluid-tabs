/** @jest-environment jsdom */
/// <reference lib="dom" />

import { act, createRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { LayoutChangeEvent } from 'react-native';
import Animated, { withTiming } from 'react-native-reanimated';

import type { TabsRef } from '../../types';
import { Container } from '../Container';
import { Tab } from '../Tab';

type ViewProps = {
  style?: unknown;
  onLayout?: (event: LayoutChangeEvent) => void;
  children?: ReactNode;
};

const mockViews: ViewProps[] = [];

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  View: (props: ViewProps) => {
    mockViews.push(props);
    return props.children;
  },
  ActivityIndicator: () => null,
  StyleSheet: { create: (styles: unknown) => styles },
  useWindowDimensions: () => ({ width: 300, height: 800 }),
}));
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
  scheduleOnRN: (callback: (...args: unknown[]) => void, ...args: unknown[]) =>
    callback(...args),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../DefaultTabBar', () => ({ DefaultTabBar: () => null }));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let pagerRef: ReturnType<typeof createRef<TabsRef>>;

const styleEntries = (style: unknown): Record<string, unknown>[] =>
  (Array.isArray(style) ? style : [style]).filter(
    (entry): entry is Record<string, unknown> =>
      !!entry && typeof entry === 'object'
  );

function latestView(match: (styles: Record<string, unknown>[]) => boolean) {
  const props = mockViews.findLast((view) => match(styleEntries(view.style)));
  if (!props) throw new Error('Expected the view to render');
  return props;
}

// The styled root, the clipping pager viewport, and the pages inside it.
const rootView = () =>
  latestView((s) => s[0]?.flex === 1 && s[0]?.overflow === undefined);
const pagerViewport = () =>
  latestView((s) => s[0]?.flex === 1 && s[0]?.overflow === 'hidden');

function pageWidths() {
  const pages = mockViews
    .map((view) => styleEntries(view.style))
    .filter((s) => s[0]?.height === '100%');
  return pages.slice(-4).map((s) => s[1]?.width);
}

function rowWidth() {
  const row = jest
    .mocked(Animated.View)
    .mock.calls.map(([props]) => styleEntries(props.style))
    .findLast((s) => s[0]?.flexDirection === 'row');
  return row?.[1]?.width;
}

function layout(view: ViewProps, width: number, height: number) {
  act(() =>
    view.onLayout!({
      nativeEvent: { layout: { x: 0, y: 0, width, height } },
    } as LayoutChangeEvent)
  );
}

function navigationTargets(indices: number[]) {
  return indices.map((index) => {
    jest.mocked(withTiming).mockClear();
    act(() => pagerRef.current!.setIndex(index));
    return jest.mocked(withTiming).mock.calls.at(-1)?.[0];
  });
}

beforeEach(() => {
  mockViews.length = 0;
  jest.mocked(Animated.View).mockClear();
  pagerRef = createRef<TabsRef>();
  root = createRoot(document.createElement('div'));
  act(() =>
    root.render(
      <Container ref={pagerRef}>
        {['feed', 'grid', 'about', 'flash'].map((name) => (
          <Tab key={name} name={name}>
            <span />
          </Tab>
        ))}
      </Container>
    )
  );
});

afterEach(() => {
  act(() => root.unmount());
});

// Jest runs no Yoga layout: each case feeds the pager viewport width that the
// named container geometry produces inside a 300-point container.
it.each([
  ['symmetric padding of 20', 260],
  ['asymmetric padding of 10 and 30', 260],
  ['a border of 2', 296],
])(
  'sizes pages and navigation from the pager viewport with %s',
  (_geometry, viewport) => {
    layout(rootView(), 300, 800);
    layout(pagerViewport(), viewport, 700);

    expect(pageWidths()).toEqual([viewport, viewport, viewport, viewport]);
    expect(rowWidth()).toBe(viewport * 4);
    // First, middle and last pages settle a whole viewport apart.
    expect(navigationTargets([3, 1, 0])).toEqual([
      -3 * viewport,
      -viewport,
      -0,
    ]);
  }
);

it('keeps the last visible viewport when a hidden container reports zero', () => {
  layout(rootView(), 300, 800);
  layout(pagerViewport(), 260, 700);
  layout(pagerViewport(), 0, 0);
  layout(rootView(), 0, 0);

  expect(pageWidths()).toEqual([260, 260, 260, 260]);
  expect(navigationTargets([2])).toEqual([-520]);
});

it('follows a resized viewport', () => {
  layout(rootView(), 300, 800);
  layout(pagerViewport(), 260, 700);
  layout(rootView(), 400, 700);
  layout(pagerViewport(), 360, 600);

  expect(pageWidths()).toEqual([360, 360, 360, 360]);
  expect(navigationTargets([2])).toEqual([-720]);
});

it('uses the window, then the container, until the viewport is measured', () => {
  expect(pageWidths()).toEqual([300, 300, 300, 300]);

  layout(rootView(), 280, 800);
  expect(pageWidths()).toEqual([280, 280, 280, 280]);

  layout(pagerViewport(), 240, 700);
  expect(pageWidths()).toEqual([240, 240, 240, 240]);
});
