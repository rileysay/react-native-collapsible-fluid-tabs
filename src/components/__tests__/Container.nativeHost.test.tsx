/** @jest-environment jsdom */
/// <reference lib="dom" />

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { LayoutChangeEvent } from 'react-native';

import type {
  NativeHeaderScrollHostProps,
  NativeHeaderScrollPageProps,
} from '../SingleHeader';
import { registerNativeHeaderScroll } from '../SingleHeader';
import type { ContainerProps } from '../../types';
import { Container } from '../Container';
import { Tab } from '../Tab';

jest.mock('react-native', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const flatten = (style: unknown): Record<string, unknown> =>
    Array.isArray(style)
      ? Object.assign({}, ...style.map(flatten))
      : style && typeof style === 'object'
        ? { ...style }
        : {};
  return {
    Platform: { OS: 'ios' },
    View: ({
      children,
      style,
      pointerEvents,
      accessibilityElementsHidden,
      importantForAccessibility,
      onLayout,
    }: {
      children?: ReactNode;
      style?: unknown;
      pointerEvents?: string;
      accessibilityElementsHidden?: boolean;
      importantForAccessibility?: string;
      onLayout?: unknown;
    }) =>
      React.createElement(
        'div',
        {
          'data-style': JSON.stringify(flatten(style)),
          'data-pointer-events': pointerEvents,
          'data-a11y-hidden': accessibilityElementsHidden,
          'data-a11y': importantForAccessibility,
          // Lets a test deliver this view's layout event.
          'ref': (element: (HTMLElement & { onLayout?: unknown }) | null) => {
            if (element) element.onLayout = onLayout;
          },
        },
        children
      ),
    ActivityIndicator: () => null,
    StyleSheet: { create: (styles: unknown) => styles, flatten },
    useWindowDimensions: () => ({ width: 300, height: 800 }),
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
      View: ({ children }: { children?: ReactNode }) =>
        React.createElement('div', null, children),
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
  scheduleOnRN: () => {},
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../DefaultTabBar', () => ({ DefaultTabBar: () => null }));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
const hostProps: NativeHeaderScrollHostProps[] = [];

function Host(props: NativeHeaderScrollHostProps) {
  hostProps.push(props);
  return <section data-host="">{props.children}</section>;
}

function Page(props: NativeHeaderScrollPageProps) {
  return <>{props.children}</>;
}

function render(
  headerScrollEnabled?: boolean,
  props: Partial<ContainerProps> = {}
) {
  act(() =>
    root.render(
      <Container
        renderPinnedHeader={() => <span id="pinned">pinned</span>}
        renderHeader={() => <span id="header">header</span>}
        headerScrollEnabled={headerScrollEnabled}
        {...props}
      >
        <Tab name="feed">
          <span id="page">page</span>
        </Tab>
      </Container>
    )
  );
}

const styleOf = (element: Element | null | undefined) =>
  JSON.parse(element?.getAttribute('data-style') ?? 'null');
/** Views outside the host that take touches on their own blank area. */
const touchRegions = () =>
  Array.from(host.querySelectorAll('div[data-pointer-events="auto"]')).filter(
    (element) => !element.closest('[data-host]')
  );

type LayoutHandler = (event: LayoutChangeEvent) => void;
type Frame = [x: number, y: number, width: number, height: number];

/** The empty view the root lays out where the pager used to be. */
function probe() {
  const found = Array.from(host.querySelectorAll('div')).find(
    (element) =>
      !element.closest('[data-host]') && styleOf(element)?.width === '100%'
  );
  if (!found) throw new Error('Expected the content probe');
  return found as HTMLElement & { onLayout?: LayoutHandler };
}

/** The frame inside the host that places the pager. */
function pagerFrame() {
  const found = Array.from(host.querySelectorAll('[data-host] div')).find(
    (element) => styleOf(element)?.direction === 'ltr'
  );
  if (!found) throw new Error('Expected the pager frame');
  return found;
}

/** The pager's clipping viewport, whose width the pages take. */
function pagerViewport() {
  const found = Array.from(pagerFrame().querySelectorAll('div')).find(
    (element) => styleOf(element)?.overflow === 'hidden'
  );
  if (!found) throw new Error('Expected the pager viewport');
  return found as HTMLElement & { onLayout?: LayoutHandler };
}

function layOut(
  target: 'root' | 'probe' | 'host' | 'pager',
  ...[x, y, width, height]: Frame
) {
  const view = {
    root: () =>
      host.firstElementChild as HTMLElement & {
        onLayout?: LayoutHandler;
      },
    probe,
    pager: pagerViewport,
  };
  const onLayout =
    target === 'host'
      ? (hostProps.at(-1)?.onLayout as LayoutHandler)
      : view[target]().onLayout!;
  act(() =>
    onLayout({
      nativeEvent: { layout: { x, y, width, height } },
    } as LayoutChangeEvent)
  );
}

/** Whether the pager frame can be seen, touched and read, all together. */
function frameShown() {
  const frame = pagerFrame();
  const shown = styleOf(frame).opacity !== 0;
  expect(frame.getAttribute('data-pointer-events')).toBe(
    shown ? 'box-none' : 'none'
  );
  expect(frame.getAttribute('data-a11y-hidden')).toBe(String(!shown));
  expect(frame.getAttribute('data-a11y')).toBe(
    shown ? 'auto' : 'no-hide-descendants'
  );
  return shown;
}

function placement() {
  const { top, height, bottom, paddingLeft, paddingRight } =
    styleOf(pagerFrame());
  return { top, height, bottom, paddingLeft, paddingRight };
}

const pageWidth = () =>
  styleOf(host.querySelector('#page')?.parentElement).width;

beforeEach(() => {
  registerNativeHeaderScroll({ Host, Page });
  hostProps.length = 0;
  host = document.createElement('div');
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  registerNativeHeaderScroll(null);
});

it('keeps the pinned header outside the native scroll host', () => {
  render();

  expect(host.querySelector('#pinned')).not.toBeNull();
  expect(host.querySelector('[data-host] #pinned')).toBeNull();
  expect(host.querySelector('[data-host] #header')).not.toBeNull();
  expect(host.querySelector('[data-host] #page')).not.toBeNull();
  // Reading order: the pinned header still comes before the host.
  const order = Array.from(host.querySelectorAll('#pinned, [data-host]'));
  expect(order.map((node) => node.id || 'host')).toEqual(['pinned', 'host']);
});

it('passes headerScrollEnabled to the native host', () => {
  render();
  expect(hostProps.at(-1)?.headerScrollEnabled).toBe(true);

  render(false);
  expect(hostProps.at(-1)?.headerScrollEnabled).toBe(false);
});

it('takes touches on the whole pinned region, outside the host', () => {
  // Blank parts of the pinned header, and the safe-area inset above it,
  // must not start a native list drag: the JS header drag excludes them too.
  render(undefined, { pinnedHeaderHeight: 50 });
  let regions = touchRegions();
  expect(regions).toHaveLength(1);
  expect(styleOf(regions[0])).toMatchObject({ top: 0, height: 74 });
  expect(styleOf(host.querySelector('#pinned')?.parentElement)).toMatchObject({
    height: 74,
  });

  // Without a pinned header, the container still reserves the inset.
  render(undefined, { renderPinnedHeader: undefined });
  regions = touchRegions();
  expect(regions).toHaveLength(1);
  expect(styleOf(regions[0])).toMatchObject({ top: 0, height: 24 });

  render(undefined, { renderPinnedHeader: undefined, topInset: 0 });
  expect(touchRegions()).toHaveLength(0);
});

it('lays the host over the root, leaving its padding to the root', () => {
  render(undefined, {
    containerStyle: [{ backgroundColor: 'white' }, { padding: '10%' }],
  });

  const rootStyle = styleOf(host.firstElementChild);
  expect(rootStyle).toMatchObject({ backgroundColor: 'white', padding: '10%' });
  // The chrome inside is absolute, so it keeps the root's padding box.
  expect(hostProps.at(-1)?.style).toEqual({
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  });
});

it('keeps the probe out of touch and accessibility, sized to the content box', () => {
  render();
  const element = probe();

  // An explicit cross size: an empty flex child would fit its content, which
  // is nothing, under a non-stretching alignItems.
  expect(styleOf(element)).toEqual({ flex: 1, width: '100%', height: '100%' });
  expect(element.getAttribute('data-pointer-events')).toBe('none');
  expect(element.getAttribute('data-a11y-hidden')).toBe('true');
  expect(element.getAttribute('data-a11y')).toBe('no-hide-descendants');
});

it('first shows the pager placed and with pages of its measured width', () => {
  // 10% of a 300-point parent: the root resolves it once, to 30 on each side.
  render(undefined, { containerStyle: { padding: '10%' } });
  const page = host.querySelector('#page');
  expect(frameShown()).toBe(false);

  // The unplaced frame fills the host, so its viewport first reports 300.
  layOut('pager', 0, 0, 300, 800);
  layOut('host', 0, 0, 300, 800);
  expect(frameShown()).toBe(false);

  layOut('probe', 30, 30, 240, 740);
  expect(placement()).toEqual({
    top: 30,
    height: 740,
    bottom: undefined,
    paddingLeft: 30,
    paddingRight: 30,
  });
  // Placed, but the pages still have the unplaced width: stay hidden.
  expect(pageWidth()).toBe(300);
  expect(frameShown()).toBe(false);

  layOut('pager', 0, 0, 240, 740);
  expect(pageWidth()).toBe(240);
  expect(frameShown()).toBe(true);
  expect(host.querySelector('#page')).toBe(page);
});

it('waits for both frames and the pages in any order', () => {
  render(undefined, { containerStyle: { padding: '10%' } });
  layOut('probe', 30, 30, 240, 740);
  expect(frameShown()).toBe(false);
  layOut('host', 0, 0, 300, 800);
  expect(frameShown()).toBe(false);

  // A late report from the unplaced frame doesn't reveal it either.
  layOut('pager', 0, 0, 300, 800);
  expect(frameShown()).toBe(false);

  layOut('pager', 0, 0, 240, 740);
  expect(frameShown()).toBe(true);
  expect(placement()).toMatchObject({ top: 30, height: 740, paddingLeft: 30 });
});

it('allows pixel rounding between the probe and page widths', () => {
  render(undefined, { containerStyle: { padding: '10%' } });
  layOut('host', 0, 0, 300, 800);
  layOut('probe', 30, 30, 240, 740);
  layOut('pager', 0, 0, 240.33, 740);
  expect(frameShown()).toBe(true);
});

it.each<[string, ContainerProps['containerStyle'], Frame, Frame, object]>([
  [
    'vertical percentage padding in a container narrower than its parent',
    { paddingTop: '10%', width: 200 },
    [0, 0, 200, 800],
    [0, 30, 200, 770],
    { top: 30, height: 770, paddingLeft: 0, paddingRight: 0 },
  ],
  [
    'asymmetric padding inside a 2-point border',
    { borderWidth: 2, paddingLeft: 10, paddingRight: 30, paddingVertical: 10 },
    [2, 2, 296, 796],
    [12, 12, 256, 776],
    { top: 10, height: 776, paddingLeft: 10, paddingRight: 30 },
  ],
])(
  'removes the host origin once for %s',
  (_case, containerStyle, hostFrame, probeFrame, expected) => {
    render(undefined, { containerStyle });
    layOut('host', ...hostFrame);
    layOut('probe', ...probeFrame);
    layOut('pager', 0, 0, probeFrame[2], probeFrame[3]);

    expect(frameShown()).toBe(true);
    expect(placement()).toMatchObject(expected);
  }
);

it('shows a padding-free column container at once, filling the host', () => {
  render();
  expect(frameShown()).toBe(true);
  expect(placement()).toEqual({
    top: 0,
    height: undefined,
    bottom: 0,
    paddingLeft: undefined,
    paddingRight: undefined,
  });

  layOut('host', 0, 0, 300, 800);
  layOut('probe', 0, 0, 300, 800);
  expect(placement()).toMatchObject({ top: 0, height: 800, paddingLeft: 0 });
});

it('measures other layouts before showing the pager', () => {
  render(undefined, { containerStyle: { flexDirection: 'row' } });
  expect(frameShown()).toBe(false);

  layOut('host', 0, 0, 300, 800);
  layOut('probe', 0, 0, 300, 800);
  expect(frameShown()).toBe(true);
});

it('follows resizes one event at a time without hiding again', () => {
  render(undefined, { containerStyle: { padding: '10%' } });
  layOut('host', 0, 0, 300, 800);
  layOut('probe', 30, 30, 240, 740);
  layOut('pager', 0, 0, 240, 740);

  // Layout events arrive per view; the pager follows each one, and the pages'
  // width lagging behind the probe doesn't hide it again.
  layOut('host', 0, 0, 400, 700);
  expect(frameShown()).toBe(true);
  expect(placement()).toMatchObject({ paddingLeft: 30, paddingRight: 130 });

  layOut('probe', 40, 40, 320, 620);
  expect(frameShown()).toBe(true);
  expect(placement()).toMatchObject({
    top: 40,
    height: 620,
    paddingLeft: 40,
    paddingRight: 40,
  });

  // A shrink the host reports first pairs its new width with the old probe;
  // the side that would be negative stays at zero until the probe reports.
  layOut('host', 0, 0, 200, 700);
  expect(frameShown()).toBe(true);
  expect(placement()).toMatchObject({ paddingLeft: 40, paddingRight: 0 });
  layOut('probe', 20, 20, 160, 660);
  expect(placement()).toMatchObject({ paddingLeft: 20, paddingRight: 20 });

  // A re-render with a new but equal style object keeps the placement.
  render(undefined, { containerStyle: { padding: '10%' } });
  expect(frameShown()).toBe(true);
  expect(placement()).toMatchObject({ top: 20, paddingLeft: 20 });
});

it('ignores unusable layouts and accepts signed origins', () => {
  render(undefined, { containerStyle: { padding: 8 } });
  layOut('host', Number.NaN, 0, 300, 800);
  layOut('probe', 8, 8, 284, 784);
  layOut('pager', 0, 0, 284, 784);
  expect(frameShown()).toBe(false);

  layOut('host', 0, -4, 300, 800);
  expect(frameShown()).toBe(true);
  expect(placement()).toMatchObject({ top: 12, paddingLeft: 8 });
});

it('never waits on a zero-width target', () => {
  // The pages keep their last positive width, so they can never match zero.
  render(undefined, { containerStyle: { padding: 9 } });
  layOut('host', 0, 0, 300, 800);
  layOut('probe', 9, 9, 0, 0);
  expect(frameShown()).toBe(true);
  expect(placement()).toMatchObject({ height: 0 });
});

it('still checks the page width when a zero-width start grows', () => {
  render(undefined, { containerStyle: { padding: '10%' } });
  layOut('root', 0, 0, 0, 0);
  layOut('host', 0, 0, 0, 0);
  layOut('probe', 0, 0, 0, 0);
  layOut('pager', 0, 0, 0, 0);
  expect(frameShown()).toBe(true);

  // The pages still have the fallback width, 300, when the frame is placed.
  layOut('root', 0, 0, 300, 800);
  layOut('host', 0, 0, 300, 800);
  layOut('probe', 30, 30, 240, 740);
  expect(pageWidth()).toBe(300);
  expect(frameShown()).toBe(false);

  layOut('pager', 0, 0, 240, 740);
  expect(pageWidth()).toBe(240);
  expect(frameShown()).toBe(true);
});

it('stays shown through a zero layout after its first reveal', () => {
  render(undefined, { containerStyle: { padding: '10%' } });
  layOut('host', 0, 0, 300, 800);
  layOut('probe', 30, 30, 240, 740);
  layOut('pager', 0, 0, 240, 740);
  expect(frameShown()).toBe(true);

  layOut('host', 0, 0, 0, 0);
  layOut('probe', 0, 0, 0, 0);
  expect(frameShown()).toBe(true);

  // Back at a new size, before the pages have caught up.
  layOut('host', 0, 0, 400, 800);
  layOut('probe', 40, 40, 320, 720);
  expect(pageWidth()).toBe(240);
  expect(frameShown()).toBe(true);
});

it('keeps the host, frame and pages across padding and toggles', () => {
  render(undefined, { containerStyle: { padding: 8 } });
  layOut('host', 0, 0, 300, 800);
  layOut('probe', 8, 8, 284, 784);
  layOut('pager', 0, 0, 284, 784);
  const hostElement = host.querySelector('[data-host]');
  const frame = pagerFrame();
  const page = host.querySelector('#page');

  render(undefined, {});
  render(false, { containerStyle: { padding: '5%' } });

  expect(host.querySelector('[data-host]')).toBe(hostElement);
  expect(pagerFrame()).toBe(frame);
  expect(host.querySelector('#page')).toBe(page);
});
