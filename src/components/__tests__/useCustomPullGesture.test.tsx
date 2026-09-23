/** @jest-environment jsdom */
/// <reference lib="dom" />

import { act, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { usePanGesture } from 'react-native-gesture-handler';
import {
  scrollTo,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';

import { PULL_HOLD_OFFSET, type RefreshTabState } from '../../utils/refresh';
import { useCustomPullGesture } from '../useCustomPullGesture';
import { useHeaderScroll, type HeaderScroll } from '../useHeaderScroll';
import type { ListScrollMetrics } from '../../utils/scrollMetrics';

type Reaction = {
  prepare: () => unknown;
  react: (current: unknown, previous: unknown) => void;
  previous: unknown;
  initialized: boolean;
};

const mockReactions: Reaction[] = [];
const mockRNQueue: (() => void)[] = [];

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('react-native-gesture-handler', () => ({
  usePanGesture: jest.fn((callbacks: unknown) => callbacks),
  GestureStateManager: { fail: jest.fn(), activate: jest.fn() },
}));
jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    cancelAnimation: jest.fn(),
    scrollTo: jest.fn(),
    withTiming: jest.fn((value: number) => value),
    useSharedValue(initial: unknown) {
      return React.useRef({ value: initial }).current;
    },
    useAnimatedReaction(
      prepare: Reaction['prepare'],
      react: Reaction['react']
    ) {
      const ref = React.useRef<Reaction | null>(null);
      if (!ref.current) {
        ref.current = { prepare, react, previous: null, initialized: false };
        mockReactions.push(ref.current);
      } else {
        ref.current.prepare = prepare;
        ref.current.react = react;
      }
    },
  };
});
jest.mock('react-native-worklets', () => ({
  scheduleOnRN: jest.fn((callback: (...args: unknown[]) => void, ...args) => {
    mockRNQueue.push(() => callback(...args));
  }),
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Options = Parameters<typeof useCustomPullGesture>[0];
type PanConfig = NonNullable<Parameters<typeof usePanGesture>[0]>;
type ActivateEvent = Parameters<NonNullable<PanConfig['onActivate']>>[0];
type UpdateCallback = Extract<
  PanConfig['onUpdate'],
  (...args: never[]) => unknown
>;
type UpdateEvent = Parameters<UpdateCallback>[0];
type FinalizeEvent = Parameters<NonNullable<PanConfig['onFinalize']>>[0];

let root: Root;
let container: HTMLDivElement;
let options: Options;
let gesture: PanConfig;
let withHeader: boolean;
let headerDriver: HeaderScroll;
let metrics: SharedValue<ListScrollMetrics>[];
let reduceMotion: SharedValue<boolean>;
const listRefs = [() => 17, () => 18] as unknown as AnimatedRef<any>[];

function shared<T>(value: T): SharedValue<T> {
  return { value } as SharedValue<T>;
}

function idle(): RefreshTabState {
  return { canRefresh: true, refreshing: false, pending: false };
}

function Probe({ value }: { value: Options }) {
  const driver = useHeaderScroll({
    ...value,
    listRefs,
    listMounted: [shared(true), shared(true)],
    listScrollMetrics: metrics,
    reduceMotionSV: reduceMotion,
  });
  const result = useCustomPullGesture({
    ...value,
    ...(withHeader
      ? {
          headerScroll: driver,
          headerScrollEnabled: true,
          containsHeaderTouch: (y: number) => y >= 80 && y < 200,
        }
      : {}),
  });
  useLayoutEffect(() => {
    // The mocked gesture hook returns its actual callback configuration.
    gesture = result as unknown as PanConfig;
    headerDriver = driver;
  });
  return null;
}

function renderProbe() {
  act(() => root.render(<Probe value={options} />));
  flushReactions();
}

// Reactions are explicitly flushed so tests can deliver a gesture event before
// a changed shared value reaches a reaction. Timing resolves immediately: this
// harness checks state ownership and scheduling, not animation or native RNGH
// arbitration. Each prepare result here contains only primitive values.
function flushReactions() {
  act(() => {
    for (let pass = 0; pass < 10; pass++) {
      let changed = false;
      for (const reaction of mockReactions) {
        const current = reaction.prepare();
        if (
          !reaction.initialized ||
          JSON.stringify(current) !== JSON.stringify(reaction.previous)
        ) {
          const previous = reaction.previous;
          reaction.previous = current;
          reaction.initialized = true;
          reaction.react(current, previous);
          changed = true;
        }
      }
      if (!changed) return;
    }
    throw new Error('Custom pull reactions did not settle');
  });
}

function flushRNQueue() {
  act(() => {
    while (mockRNQueue.length) mockRNQueue.shift()!();
  });
}

function activate(translationY = 6) {
  act(() => gesture.onActivate!({ translationY } as ActivateEvent));
}

function update(translationY: number) {
  const onUpdate = gesture.onUpdate;
  if (typeof onUpdate !== 'function') {
    throw new Error('Expected a worklet update callback');
  }
  act(() => onUpdate({ translationY } as UpdateEvent));
}

function finalize(canceled = false) {
  act(() => gesture.onFinalize!({ canceled } as FinalizeEvent));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReactions.length = 0;
  mockRNQueue.length = 0;
  withHeader = false;
  reduceMotion = shared(false);
  metrics = [0, 1].map(() =>
    shared<ListScrollMetrics>({
      contentHeight: 1000,
      viewportHeight: 500,
      enabled: true,
      deceleration: 0.985,
    })
  );
  options = {
    directionConfig: {
      horizontalDistance: 15,
      verticalDistance: 10,
      ratio: 1.4,
    },
    usesCustomPullSV: shared(true),
    activeIndex: shared(0),
    tabCount: 2,
    perPageScrollY: [shared(0), shared(0)],
    scrollY: shared(0),
    isPanning: shared(false),
    isPulling: shared(false),
    refreshingHold: shared(false),
    refreshStates: shared([idle(), idle()]),
    pinnedTotal: 80,
    nativeListGestures: [],
    cancelScrollToTop: jest.fn(),
    triggerActiveRefresh: jest.fn(),
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('vertical drags starting on the header or tab bar', () => {
  function startHeader(
    y: number,
    customPull = false,
    activationTranslation = 0,
    recognitionTranslation = activationTranslation
  ) {
    withHeader = true;
    options.usesCustomPullSV.value = customPull;
    options.perPageScrollY[0]!.value = y;
    options.scrollY.value = y;
    renderProbe();
    act(() =>
      gesture.onTouchesDown!({
        handlerTag: 2,
        allTouches: [{ id: 0, x: 100, y: 100, absoluteX: 100, absoluteY: 100 }],
      } as Parameters<NonNullable<PanConfig['onTouchesDown']>>[0])
    );
    if (recognitionTranslation !== 0) {
      act(() =>
        gesture.onTouchesMove!({
          handlerTag: 2,
          allTouches: [
            {
              id: 0,
              x: 100,
              y: 100 + recognitionTranslation,
              absoluteX: 100,
              absoluteY: 100 + recognitionTranslation,
            },
          ],
        } as Parameters<NonNullable<PanConfig['onTouchesMove']>>[0])
      );
    }
    activate(activationTranslation);
  }

  it.each([0, -12])(
    'starts without a position jump at activation translation %s',
    (activationTranslation) => {
      // Android/web reset the pan translation at activation; either event
      // convention should keep the original activation threshold behavior.
      startHeader(120, false, activationTranslation, -12);
      expect(options.scrollY.value).toBe(120);
      update(activationTranslation);
      expect(options.scrollY.value).toBe(120);
      update(activationTranslation - 6);
      expect(options.scrollY.value).toBe(126);
      update(activationTranslation - 4);
      expect(options.scrollY.value).toBe(124);
      expect(scrollTo).toHaveBeenLastCalledWith(listRefs[0], 0, 124, false);
    }
  );

  it('scrolls the real list up and down through repeated finger reversals', () => {
    startHeader(200);
    update(-40);
    expect(options.perPageScrollY[0]!.value).toBe(240);
    update(20);
    expect(options.perPageScrollY[0]!.value).toBe(180);
    update(-10);
    expect(options.scrollY.value).toBe(210);
    expect(scrollTo).toHaveBeenLastCalledWith(listRefs[0], 0, 210, false);
    finalize();
    expect(headerDriver.index.value).toBe(-1);
    expect(mockRNQueue).toHaveLength(0);
  });

  it('responds immediately on reversal after reaching the bottom', () => {
    startHeader(480);
    update(-80);
    expect(options.scrollY.value).toBe(500);
    update(-70);
    expect(options.scrollY.value).toBe(490);
  });

  it('clamps at the top in native refresh mode and allows reversing upward', () => {
    startHeader(20);
    update(100);
    expect(options.scrollY.value).toBe(0);
    update(80);
    expect(options.scrollY.value).toBe(20);
    expect(options.isPulling.value).toBe(false);
  });

  it('crosses from scrolling to an Android stretch pull and back in one touch', () => {
    startHeader(20, true);
    update(40);
    expect(options.scrollY.value).toBe(-10);
    expect(options.perPageScrollY[0]!.value).toBe(0);
    expect(options.isPulling.value).toBe(true);
    update(10);
    expect(options.scrollY.value).toBe(10);
    expect(options.perPageScrollY[0]!.value).toBe(10);
    expect(options.isPulling.value).toBe(false);
    finalize();
    expect(mockRNQueue).toHaveLength(0);
  });

  it('can refresh from a long Android pull that starts on the tab bar', () => {
    startHeader(0, true);
    update(160);
    finalize();
    flushRNQueue();
    expect(options.triggerActiveRefresh).toHaveBeenCalledWith(0);
    expect(options.scrollY.value).toBe(-PULL_HOLD_OFFSET);
  });

  it('does not refresh from a canceled header pull', () => {
    startHeader(0, true);
    update(160);
    finalize(true);
    expect(mockRNQueue).toHaveLength(0);
    expect(options.scrollY.value).toBe(0);
    expect(withTiming).toHaveBeenCalledTimes(1);
    expect(withTiming).toHaveBeenCalledWith(0, { duration: 220 });
  });

  it('keeps a fling inside the measured range and cancels stale completion', () => {
    startHeader(200);
    update(-40);
    act(() =>
      gesture.onDeactivate!({ velocityY: -800, canceled: false } as Parameters<
        NonNullable<PanConfig['onDeactivate']>
      >[0])
    );
    finalize();
    expect(withTiming).toHaveBeenCalledWith(
      expect.closeTo(371.899, 2),
      { duration: expect.closeTo(471.068, 2), easing: expect.any(Function) },
      expect.any(Function)
    );
    const completion = jest.mocked(withTiming).mock.calls[0]![2]!;
    headerDriver.offset.value = 280;
    flushReactions();
    expect(options.scrollY.value).toBe(280);
    act(() => headerDriver.cancel());
    options.scrollY.value = 90;
    jest.mocked(scrollTo).mockClear();
    act(() => completion(true));
    expect(options.scrollY.value).toBe(90);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('stops a running fling when its content shrinks', () => {
    startHeader(400);
    act(() => headerDriver.finish(800));
    headerDriver.offset.value = 450;
    metrics[0]!.value = { ...metrics[0]!.value, contentHeight: 700 };
    flushReactions();
    expect(options.scrollY.value).toBe(200);
    expect(headerDriver.index.value).toBe(-1);
  });

  it('stays at the release position when reduced motion is enabled', () => {
    reduceMotion.value = true;
    startHeader(200);
    update(-24);
    act(() => headerDriver.finish(800));
    flushReactions();
    expect(options.scrollY.value).toBe(224);
    expect(headerDriver.index.value).toBe(-1);
    expect(withTiming).not.toHaveBeenCalled();
  });

  it('does not move the newly selected tab from an old drag or release', () => {
    startHeader(200);
    update(-40);
    options.activeIndex.value = 1;
    options.scrollY.value = 90;
    options.perPageScrollY[1]!.value = 90;
    jest.mocked(scrollTo).mockClear();
    update(-80);
    finalize();
    flushReactions();
    expect(options.scrollY.value).toBe(90);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(withTiming).not.toHaveBeenCalled();
  });

  it('respects a list that has scrolling disabled', () => {
    metrics[0]!.value = { ...metrics[0]!.value, enabled: false };
    startHeader(200);
    update(-60);
    expect(headerDriver.index.value).toBe(-1);
    expect(options.scrollY.value).toBe(200);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('releases a header pull if scrolling becomes disabled during the gesture', () => {
    startHeader(0, true);
    update(160);
    metrics[0]!.value = { ...metrics[0]!.value, enabled: false };
    flushReactions();
    update(200);
    finalize();
    expect(options.isPulling.value).toBe(false);
    expect(options.scrollY.value).toBe(0);
    expect(headerDriver.index.value).toBe(-1);
    expect(mockRNQueue).toHaveLength(0);
  });

  it('preserves the list position if a drag update beats the disable reaction', () => {
    startHeader(120);
    update(-24);
    expect(options.scrollY.value).toBe(144);
    metrics[0]!.value = { ...metrics[0]!.value, enabled: false };
    jest.mocked(scrollTo).mockClear();

    update(-60);
    finalize();

    expect(options.scrollY.value).toBe(144);
    expect(options.perPageScrollY[0]!.value).toBe(144);
    expect(headerDriver.index.value).toBe(-1);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(withTiming).not.toHaveBeenCalled();
  });

  it('does not start a header fling after the list disables scrolling', () => {
    startHeader(120);
    update(-24);
    metrics[0]!.value = { ...metrics[0]!.value, enabled: false };
    jest.mocked(scrollTo).mockClear();

    act(() => headerDriver.finish(800));

    expect(headerDriver.index.value).toBe(-1);
    expect(options.scrollY.value).toBe(144);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(withTiming).not.toHaveBeenCalled();
  });

  it.each(['update', 'release'] as const)(
    'cancels a disabled header pull before a queued %s can refresh it',
    (nextEvent) => {
      startHeader(0, true);
      update(160);
      expect(options.scrollY.value).toBe(-80);
      metrics[0]!.value = { ...metrics[0]!.value, enabled: false };
      jest.mocked(scrollTo).mockClear();

      if (nextEvent === 'update') update(200);
      finalize();

      expect(options.scrollY.value).toBe(0);
      expect(options.perPageScrollY[0]!.value).toBe(0);
      expect(options.isPulling.value).toBe(false);
      expect(options.refreshingHold.value).toBe(false);
      expect(headerDriver.index.value).toBe(-1);
      expect(scrollTo).not.toHaveBeenCalled();
      expect(withTiming).not.toHaveBeenCalled();
      expect(mockRNQueue).toHaveLength(0);
    }
  );
});

describe('custom pull ownership', () => {
  it.each(['page', 'mode'] as const)(
    'ignores updates and release after %s changes before reactions run',
    (change) => {
      renderProbe();
      activate();
      update(206);
      expect(options.scrollY.value).toBe(-100);

      if (change === 'page') {
        options.activeIndex.value = 1;
        options.refreshingHold.value = true;
      } else options.usesCustomPullSV.value = false;
      options.scrollY.value = 230;
      jest.mocked(withTiming).mockClear();

      update(306);
      finalize();

      expect(options.scrollY.value).toBe(230);
      expect(options.isPulling.value).toBe(false);
      expect(options.refreshingHold.value).toBe(change === 'page');
      expect(withTiming).not.toHaveBeenCalled();
      expect(mockRNQueue).toHaveLength(0);
      expect(options.refreshStates.value[0]?.pending).toBe(false);
    }
  );

  it('clears a negative custom pull when stretch mode is disabled', () => {
    renderProbe();
    activate();
    update(206);
    options.refreshingHold.value = true;
    options.usesCustomPullSV.value = false;

    flushReactions();
    finalize();

    expect(options.scrollY.value).toBe(0);
    expect(options.isPulling.value).toBe(false);
    expect(options.refreshingHold.value).toBe(false);
    expect(mockRNQueue).toHaveLength(0);
  });

  it('replaces an old negative pull with the newly active page offset', () => {
    options.perPageScrollY[1]!.value = 180;
    renderProbe();
    activate();
    update(206);
    options.activeIndex.value = 1;

    flushReactions();
    finalize();

    expect(options.scrollY.value).toBe(180);
    expect(options.isPulling.value).toBe(false);
    expect(mockRNQueue).toHaveLength(0);
  });

  it.each(['mode', 'offset'] as const)(
    'rejects activation when %s changed before the enabled reaction runs',
    (change) => {
      renderProbe();
      if (change === 'mode') options.usesCustomPullSV.value = false;
      else options.perPageScrollY[0]!.value = 120;
      options.scrollY.value = 120;

      activate();
      update(206);
      finalize();

      expect(options.isPulling.value).toBe(false);
      expect(options.scrollY.value).toBe(120);
      expect(options.cancelScrollToTop).not.toHaveBeenCalled();
      expect(mockRNQueue).toHaveLength(0);
    }
  );

  it.each(['update', 'finalize'] as const)(
    'restores native scrolling from a stale pull %s before reactions run',
    (event) => {
      renderProbe();
      activate();
      update(206);
      options.refreshingHold.value = true;
      options.perPageScrollY[0]!.value = 160;
      jest.mocked(withTiming).mockClear();

      if (event === 'update') update(306);
      finalize();

      expect(options.scrollY.value).toBe(160);
      expect(options.isPulling.value).toBe(false);
      expect(options.refreshingHold.value).toBe(false);
      expect(withTiming).not.toHaveBeenCalled();
      expect(mockRNQueue).toHaveLength(0);
    }
  );
});

describe('pull distance and refresh requests', () => {
  it('excludes activation travel and preserves the baseline across React renders', () => {
    renderProbe();
    options.scrollY.value = -23;
    activate(8);
    update(8);
    expect(options.scrollY.value).toBe(-23);

    options = { ...options, pinnedTotal: 100 };
    renderProbe();
    update(18);
    expect(options.scrollY.value).toBe(-28);
    expect(gesture.hitSlop).toEqual({ top: -100 });

    finalize();
    expect(options.scrollY.value).toBe(0);
    expect(mockRNQueue).toHaveLength(0);
  });

  it.each(['canceled', 'disabled', 'unregistered'] as const)(
    'releases a long %s pull without requesting refresh',
    (reason) => {
      renderProbe();
      activate();
      update(206);
      if (reason === 'disabled') {
        options.refreshStates.value = [{ ...idle(), canRefresh: false }];
      } else if (reason === 'unregistered') {
        options.refreshStates.value = [];
      }

      finalize(reason === 'canceled');

      expect(options.scrollY.value).toBe(0);
      expect(options.refreshingHold.value).toBe(false);
      expect(mockRNQueue).toHaveLength(0);
    }
  );

  it('marks a request pending before scheduling JS and prevents duplicate pulls', () => {
    renderProbe();
    activate();
    update(150);
    finalize();

    expect(options.refreshStates.value[0]?.pending).toBe(true);
    expect(options.refreshStates.value[1]).toEqual(idle());
    expect(options.refreshingHold.value).toBe(true);
    expect(options.scrollY.value).toBe(-PULL_HOLD_OFFSET);
    expect(options.triggerActiveRefresh).not.toHaveBeenCalled();
    expect(mockRNQueue).toHaveLength(1);

    finalize();
    activate();
    update(206);
    finalize();
    expect(mockRNQueue).toHaveLength(1);
    expect(options.scrollY.value).toBe(-PULL_HOLD_OFFSET);

    flushRNQueue();
    expect(options.triggerActiveRefresh).toHaveBeenCalledTimes(1);
    expect(options.triggerActiveRefresh).toHaveBeenCalledWith(0);
  });

  it('releases the hold when a no-op callback is acknowledged as still idle', () => {
    options.triggerActiveRefresh = jest.fn(() => {
      // Container acknowledges the controlled value after the RN callback.
      options.refreshStates.value = [idle(), idle()];
      options.refreshingHold.value = false;
    });
    renderProbe();
    activate();
    update(206);
    finalize();
    flushReactions();
    expect(options.scrollY.value).toBe(-PULL_HOLD_OFFSET);

    flushRNQueue();
    flushReactions();

    expect(options.triggerActiveRefresh).toHaveBeenCalledTimes(1);
    expect(options.refreshStates.value[0]?.pending).toBe(false);
    expect(options.refreshingHold.value).toBe(false);
    expect(options.scrollY.value).toBe(0);
  });

  it('keeps an existing refresh held when its gesture is canceled', () => {
    options.refreshStates.value = [{ ...idle(), refreshing: true }, idle()];
    options.refreshingHold.value = true;
    renderProbe();
    activate();
    update(26);
    finalize(true);

    expect(options.refreshingHold.value).toBe(true);
    expect(options.scrollY.value).toBe(-PULL_HOLD_OFFSET);
    expect(mockRNQueue).toHaveLength(0);
  });
});

describe('controlled refresh visibility', () => {
  it.each([0, 180])(
    'reveals a programmatic refresh only at the top (offset %i)',
    (offset) => {
      options.perPageScrollY[0]!.value = offset;
      options.scrollY.value = offset;
      renderProbe();
      options.refreshStates.value = [{ ...idle(), refreshing: true }, idle()];
      options.refreshingHold.value = true;

      flushReactions();

      expect(options.scrollY.value).toBe(
        offset === 0 ? -PULL_HOLD_OFFSET : offset
      );
      expect(mockRNQueue).toHaveLength(0);
      expect(options.triggerActiveRefresh).not.toHaveBeenCalled();
    }
  );

  it('defers a programmatic hold until a horizontal pan settles on the same tab', () => {
    renderProbe();
    options.isPanning.value = true;
    options.refreshingHold.value = true;

    flushReactions();

    expect(options.scrollY.value).toBe(0);
    expect(withTiming).not.toHaveBeenCalled();

    options.isPanning.value = false;
    flushReactions();

    expect(options.scrollY.value).toBe(-PULL_HOLD_OFFSET);
    expect(options.refreshingHold.value).toBe(true);
    expect(mockRNQueue).toHaveLength(0);
  });

  it('does not restart a refresh that completes while its finger is down', () => {
    options.refreshStates.value = [{ ...idle(), refreshing: true }, idle()];
    options.refreshingHold.value = true;
    renderProbe();
    activate();
    update(106);
    const heldByFinger = options.scrollY.value;
    options.refreshStates.value = [idle(), idle()];
    options.refreshingHold.value = false;

    flushReactions();
    expect(options.scrollY.value).toBe(heldByFinger);
    finalize();

    expect(options.scrollY.value).toBe(0);
    expect(options.refreshingHold.value).toBe(false);
    expect(mockRNQueue).toHaveLength(0);
  });

  it('holds a programmatic refresh started during an initially idle pull', () => {
    renderProbe();
    activate();
    update(26);
    options.refreshStates.value = [{ ...idle(), refreshing: true }, idle()];
    options.refreshingHold.value = true;

    flushReactions();
    expect(options.scrollY.value).toBe(-10);
    finalize();

    expect(options.scrollY.value).toBe(-PULL_HOLD_OFFSET);
    expect(options.refreshingHold.value).toBe(true);
    expect(mockRNQueue).toHaveLength(0);
  });
});
