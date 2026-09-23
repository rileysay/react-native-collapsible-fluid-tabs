/** @jest-environment jsdom */
/// <reference lib="dom" />

import {
  act,
  createRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { FlatList as RNFlatList, RefreshControlProps } from 'react-native';
import { RefreshControl } from 'react-native-gesture-handler';
import type { AnimatedRef, SharedValue } from 'react-native-reanimated';

import { TabIndexContext, TabsContext } from '../../context';
import type { InternalTabsContextValue } from '../../types';
import { collapseTranslateY, getHeaderScrollOffset } from '../../utils/paging';
import { FlatList } from '../FlatList';

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  View: ({ children }: { children?: ReactNode }) => children ?? null,
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children?: ReactNode }) => children ?? null,
  RefreshControl: () => null,
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: {
    FlatList: MockNativeFlatList,
    View: ({ children }: { children?: ReactNode }) => children ?? null,
  },
  useAnimatedStyle: (updater: () => object) => updater(),
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type EventName = 'onScroll' | 'onMomentumScrollBegin' | 'onMomentumScrollEnd';
type ScrollEvent = {
  eventName: EventName;
  contentOffset: { x: number; y: number };
};
type ScrollHandler = (event: ScrollEvent) => void;
type NativeHost = {
  tag: number;
  offset: number;
  listeners: Map<EventName, ScrollHandler>;
};
type NativeListInstance = {
  getNativeScrollRef: () => NativeHost;
  getScrollableNode: () => number;
};
type NativeListProps = {
  ref?: Ref<NativeListInstance>;
  refreshControl?: ReactElement<RefreshControlProps>;
  onScroll?: ScrollHandler;
  onMomentumScrollBegin?: ScrollHandler;
  onMomentumScrollEnd?: ScrollHandler;
};
type NativeListModel = {
  host: NativeHost;
  outer: NativeListInstance;
  hasRefreshControl: boolean;
  props: NativeListProps;
};
type CommandRef = ((
  instance?: NativeListInstance | null
) => NativeHost | null) & {
  current: NativeListInstance | null;
};

let nextTag: number;
let outerMountCount: number;
let nativeList: NativeListModel;
let commandRef: CommandRef;
let context: InternalTabsContextValue;
let root: Root;
let container: HTMLDivElement;
let forwardedRef: ReturnType<typeof createRef<RNFlatList<{ id: string }>>>;
let onRefresh: jest.Mock;
let onMomentumScrollBegin: jest.Mock;
let onMomentumScrollEnd: jest.Mock;

function createHost(): NativeHost {
  return { tag: nextTag++, offset: 0, listeners: new Map() };
}

// Models the native behavior unavailable in jsdom: Android changes its native
// ScrollView host when the RefreshControl wrapper is added/removed, keeping
// the public FlatList instance. Animated onScroll registrations follow that
// host on commits; an outer-ref-only observer cannot see the replacement.
function MockNativeFlatList(props: NativeListProps) {
  const modelRef = useRef<NativeListModel | null>(null);
  if (!modelRef.current) {
    const model: NativeListModel = {
      host: createHost(),
      outer: {
        getNativeScrollRef: () => model.host,
        getScrollableNode: () => model.host.tag,
      },
      hasRefreshControl: !!props.refreshControl,
      props,
    };
    modelRef.current = model;
  }
  const model = modelRef.current;

  useLayoutEffect(() => {
    outerMountCount++;
  }, []);
  useLayoutEffect(() => {
    if (model.hasRefreshControl !== !!props.refreshControl) {
      model.host = createHost();
      model.hasRefreshControl = !!props.refreshControl;
    }
    model.props = props;
    nativeList = model;
    const host = model.host;
    const events: EventName[] = [
      'onScroll',
      'onMomentumScrollBegin',
      'onMomentumScrollEnd',
    ];
    for (const eventName of events) {
      host.listeners.set(eventName, (event) => {
        props.onScroll?.(event);
        if (eventName === 'onMomentumScrollBegin') {
          props.onMomentumScrollBegin?.(event);
        } else if (eventName === 'onMomentumScrollEnd') {
          props.onMomentumScrollEnd?.(event);
        }
      });
    }
    return () => host.listeners.clear();
  });
  useImperativeHandle(props.ref, () => model.outer, [model]);
  return null;
}

function shared<T>(value: T): SharedValue<T> {
  const result = {
    value,
    modify(fn: (current: T) => T) {
      result.value = fn(result.value);
    },
  };
  return result as SharedValue<T>;
}

function createCommandRef(): CommandRef {
  let cachedHost: NativeHost | null = null;
  const ref: CommandRef = Object.assign(
    (instance?: NativeListInstance | null) => {
      if (instance) {
        ref.current = instance;
        // Reanimated scrollTo caches the shadow wrapper when its ref is set.
        cachedHost = instance.getNativeScrollRef();
      }
      return cachedHost;
    },
    { current: null as NativeListInstance | null }
  );
  return ref;
}

function renderList(usesCustomPull = false) {
  context = {
    ...context,
    usesCustomPull,
    pullDownBehavior: usesCustomPull ? 'stretch' : 'static',
  };
  context.usesCustomPullSV.value = usesCustomPull;
  act(() => {
    root.render(
      <TabsContext.Provider value={context}>
        <TabIndexContext.Provider value={0}>
          <FlatList
            ref={forwardedRef}
            data={[{ id: 'feed-item' }]}
            renderItem={() => null}
            refreshControl={
              <RefreshControl refreshing={false} onRefresh={onRefresh} />
            }
            onMomentumScrollBegin={onMomentumScrollBegin}
            onMomentumScrollEnd={onMomentumScrollEnd}
          />
        </TabIndexContext.Provider>
      </TabsContext.Provider>
    );
  });
}

function emit(host: NativeHost, eventName: EventName, offset: number) {
  host.offset = offset;
  host.listeners.get(eventName)?.({
    eventName,
    contentOffset: { x: 0, y: offset },
  });
}

function headerTranslation() {
  const offset = getHeaderScrollOffset(
    0,
    1,
    context.perPageScrollY,
    context.scrollY.value,
    context.scrollToTopIndex.value,
    context.scrollToTopOffset.value
  );
  return collapseTranslateY(offset, context.headerHeight.value, false);
}

beforeEach(() => {
  nextTag = 1;
  outerMountCount = 0;
  commandRef = createCommandRef();
  forwardedRef = createRef<RNFlatList<{ id: string }>>();
  onRefresh = jest.fn();
  onMomentumScrollBegin = jest.fn();
  onMomentumScrollEnd = jest.fn();
  const pageOffset = shared(0);
  const scrollY = shared(0);
  const momentumActive = shared(false);
  // A supplied pager handler is the integration boundary under test. Its
  // observable outputs let the real header selector catch missing delivery.
  const pagerScrollHandler: ScrollHandler = (event) => {
    if (event.eventName === 'onScroll') {
      pageOffset.value = event.contentOffset.y;
      scrollY.value = event.contentOffset.y;
    } else {
      momentumActive.value = event.eventName === 'onMomentumScrollBegin';
    }
  };
  context = {
    listRefs: [commandRef as unknown as AnimatedRef<RNFlatList>],
    listMounted: [shared(false)],
    listScrollMetrics: [
      shared({
        contentHeight: 900,
        viewportHeight: 650,
        enabled: true,
        deceleration: 0.985,
      }),
    ],
    listNativeGestures: [{ handlerTag: 1 }],
    scrollHandlers: [pagerScrollHandler],
    perPageScrollY: [pageOffset],
    scrollY,
    scrollToTopIndex: shared(-1),
    scrollToTopOffset: shared(0),
    activeIndex: shared(0),
    momentumActive,
    usesCustomPullSV: shared(false),
    headerHeight: shared(250),
    headerHeightValue: 250,
    pinnedHeaderHeight: 32,
    topInset: 24,
    tabBarHeight: 56,
    bottomInset: 0,
    minPageContentHeight: 900,
    usesCustomPull: false,
    pullDownBehavior: 'static',
    reportRefreshConfig: jest.fn(),
  } as unknown as InternalTabsContextValue;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it('collapses the initially open Feed header from native scroll events', () => {
  renderList();
  expect(headerTranslation()).toBeCloseTo(0);

  emit(nativeList.host, 'onScroll', 120);
  expect(context.perPageScrollY[0]?.value).toBe(120);
  expect(context.scrollY.value).toBe(120);
  expect(headerTranslation()).toBe(-120);
});

it('restores the header when Feed scrolls to top after arriving collapsed', () => {
  renderList();
  context.perPageScrollY[0]!.value = 250;
  context.scrollY.value = 250;
  expect(headerTranslation()).toBe(-250);

  emit(nativeList.host, 'onScroll', 0);
  expect(headerTranslation()).toBeCloseTo(0);
  expect(context.perPageScrollY[0]?.value).toBe(0);
});

it('keeps scroll events and command refs on the new host across both mode switches', () => {
  renderList();
  const outer = nativeList.outer;
  const firstHost = nativeList.host;
  expect(forwardedRef.current).toBe(outer);

  for (const stretch of [true, false]) {
    const previousHost = nativeList.host;
    renderList(stretch);
    expect(nativeList.outer).toBe(outer);
    expect(forwardedRef.current).toBe(outer);
    expect(outerMountCount).toBe(1);
    expect(nativeList.host).not.toBe(previousHost);
    expect(!!nativeList.props.refreshControl).toBe(!stretch);

    emit(nativeList.host, 'onScroll', 175);
    expect(headerTranslation()).toBe(-175);
    emit(previousHost, 'onScroll', 0);
    expect(headerTranslation()).toBe(-175);

    const commandHost = commandRef();
    expect(commandHost).toBe(nativeList.host);
    // Model a UI scrollTo command, which uses the cached native wrapper.
    emit(commandHost!, 'onScroll', 0);
    expect(headerTranslation()).toBeCloseTo(0);
  }
  expect(nativeList.host).not.toBe(firstHost);
});

it('preserves consumer momentum and refresh callbacks alongside pager events', () => {
  renderList();
  emit(nativeList.host, 'onMomentumScrollBegin', 40);
  expect(context.momentumActive.value).toBe(true);
  expect(onMomentumScrollBegin).toHaveBeenCalledTimes(1);
  emit(nativeList.host, 'onMomentumScrollEnd', 80);
  expect(context.momentumActive.value).toBe(false);
  expect(onMomentumScrollEnd).toHaveBeenCalledTimes(1);
  expect(nativeList.props.refreshControl?.props.onRefresh).toBe(onRefresh);

  renderList(true);
  const report = jest.mocked(context.reportRefreshConfig);
  const config = report.mock.calls.at(-1)?.[1];
  expect(config?.onRefresh).toBeDefined();
  act(() => config?.onRefresh?.());
  expect(onRefresh).toHaveBeenCalledTimes(1);
  expect(report.mock.calls.at(-1)?.[1]?.refreshing).toBe(false);
  expect(outerMountCount).toBe(1);
});
