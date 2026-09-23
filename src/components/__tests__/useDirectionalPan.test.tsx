/** @jest-environment jsdom */
/// <reference lib="dom" />

import { act, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GestureStateManager } from 'react-native-gesture-handler';

import { useDirectionalPan } from '../useDirectionalPan';
import type { DirectionConfig } from '../../utils/gestureDirection';

jest.mock('react-native-gesture-handler', () => ({
  GestureStateManager: { activate: jest.fn(), fail: jest.fn() },
}));
jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useSharedValue: (initial: unknown) =>
      React.useRef({ value: initial }).current,
  };
});

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Callbacks = ReturnType<typeof useDirectionalPan>;
type TouchEvent = Parameters<Callbacks['onTouchesDown']>[0];
type Point = TouchEvent['allTouches'][number];

const PAGER = 1;
const PULL = 2;
const defaults: DirectionConfig = {
  horizontalDistance: 15,
  verticalDistance: 10,
  ratio: 1.4,
};
const canPull = jest.fn(() => true);
let pager: Callbacks;
let pull: Callbacks;
let root: Root;
let host: HTMLDivElement;

function Probe({ config }: { config: DirectionConfig }) {
  const horizontal = useDirectionalPan('horizontal', config);
  const downward = useDirectionalPan('down', config, canPull);
  useLayoutEffect(() => {
    pager = horizontal;
    pull = downward;
  });
  return null;
}

function point(dx: number, dy: number, id = 0): Point {
  return {
    id,
    x: 100 + dx,
    y: 300 + dy,
    absoluteX: 100 + dx,
    absoluteY: 300 + dy,
  };
}

function dispatch(name: keyof Callbacks, points: Point[], reverse = false) {
  const gestures = reverse
    ? ([
        [pull, PULL],
        [pager, PAGER],
      ] as const)
    : ([
        [pager, PAGER],
        [pull, PULL],
      ] as const);
  act(() => {
    for (const [callbacks, tag] of gestures) {
      callbacks[name]({
        handlerTag: tag,
        allTouches: points,
        changedTouches: points,
        numberOfTouches: points.length,
      } as TouchEvent);
    }
  });
}

function down(reverse = false) {
  dispatch('onTouchesDown', [point(0, 0)], reverse);
}

function move(dx: number, dy: number, reverse = false) {
  dispatch('onTouchesMove', [point(dx, dy)], reverse);
}

function expectWinner(tag: number | null) {
  expect(jest.mocked(GestureStateManager.activate).mock.calls).toEqual(
    tag === null ? [] : [[tag]]
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  canPull.mockReturnValue(true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<Probe config={defaults} />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

// These invoke real classifier callbacks in both delivery orders. They verify
// the direction/ownership policy, not native dispatch timing or rendered FPS.
it.each([false, true])(
  'keeps a sideways 12/7 start out of refresh (pull delivered first: %s)',
  (reverse) => {
    down(reverse);
    move(12, 7, reverse);
    expectWinner(null);
    expect(GestureStateManager.fail).not.toHaveBeenCalled();
    move(18, 9, reverse);
    expectWinner(PAGER);
    expect(GestureStateManager.fail).toHaveBeenCalledWith(PULL);
  }
);

it.each([false, true])(
  'gives a downward drag to pull and releases the list wait (pull first: %s)',
  (reverse) => {
    down(reverse);
    move(3, 11, reverse);
    expectWinner(PULL);
    expect(GestureStateManager.fail).toHaveBeenCalledWith(PAGER);
  }
);

it('yields an upward drag to native scrolling without activating either pan', () => {
  down();
  move(4, -12);
  expectWinner(null);
  expect(GestureStateManager.fail).toHaveBeenCalledWith(PAGER);
  expect(GestureStateManager.fail).toHaveBeenCalledWith(PULL);
  move(50, -12);
  expectWinner(null);
});

it('keeps horizontal ownership when a thumb curves vertically after activation', () => {
  down();
  move(-16, 4);
  move(-20, 100);
  move(10, 150);
  expectWinner(PAGER);
  expect(GestureStateManager.fail).toHaveBeenCalledTimes(1);
});

it('keeps vertical ownership when a drag later turns sideways or upward', () => {
  down();
  move(2, 12);
  move(100, 13);
  move(110, -80);
  expectWinner(PULL);
  expect(GestureStateManager.fail).toHaveBeenCalledTimes(1);
});

it('allows a short ambiguous diagonal to clarify into horizontal paging', () => {
  down();
  move(12, 12);
  move(17, 14);
  expectWinner(null);
  move(22, 14);
  expectWinner(PAGER);
});

it('bounds an exactly diagonal drag and consistently favors scrolling', () => {
  down();
  move(20, 20);
  move(29, 29);
  expectWinner(null);
  move(30, 30);
  expectWinner(PULL);
  expect(GestureStateManager.fail).toHaveBeenCalledWith(PAGER);
});

it.each([-1, 1])(
  'recognizes a fast horizontal first move in direction %s',
  (sign) => {
    down();
    move(150 * sign, 45);
    expectWinner(PAGER);
  }
);

it('rejects paging on the old momentum-tolerance counterexample', () => {
  down();
  move(16, 30);
  expectWinner(PULL);
  expect(GestureStateManager.fail).toHaveBeenCalledWith(PAGER);
});

it('leaves a tap available to its button and resets for the next touch', () => {
  down();
  move(3, 4);
  dispatch('onTouchesUp', [point(3, 4)]);
  expectWinner(null);
  expect(GestureStateManager.fail).toHaveBeenCalledTimes(2);
  down();
  move(18, 3);
  expectWinner(PAGER);
});

it('does not turn an undecided canceled touch into a page or a refresh', () => {
  down();
  move(9, 9);
  dispatch('onTouchesCancel', [point(9, 9)]);
  move(30, 1);
  expectWinner(null);
  down();
  move(2, 12);
  expectWinner(PULL);
});

it('measures window coordinates when the view moves underneath the finger', () => {
  down();
  dispatch('onTouchesMove', [{ ...point(4, 6), x: 180, y: 90 }]);
  expectWinner(null);
  dispatch('onTouchesMove', [{ ...point(16, 6), x: 200, y: 50 }]);
  expectWinner(PAGER);
});

it('rejects an extra finger before direction selection without a centroid jump', () => {
  down();
  move(2, 3);
  dispatch('onTouchesDown', [point(2, 3), point(200, 200, 1)]);
  move(80, 0);
  expectWinner(null);
  expect(GestureStateManager.fail).toHaveBeenCalledTimes(2);
});

it('does not cancel an already selected axis when another finger joins', () => {
  down();
  move(20, 2);
  dispatch('onTouchesDown', [point(20, 2), point(200, 200, 1)]);
  expectWinner(PAGER);
  expect(GestureStateManager.fail).toHaveBeenCalledTimes(1);
});

it('rechecks pull eligibility before allowing downward activation', () => {
  down();
  canPull.mockReturnValue(false);
  move(3, 12);
  expectWinner(null);
  expect(GestureStateManager.fail).toHaveBeenCalledTimes(2);
});

it('honors a configured ratio and keeps the decision across a React render', () => {
  act(() => root.render(<Probe config={{ ...defaults, ratio: 2 }} />));
  down();
  move(18, 10);
  expectWinner(null);
  move(22, 10);
  expectWinner(PAGER);
  act(() => root.render(<Probe config={{ ...defaults, ratio: 3 }} />));
  move(24, 20);
  expectWinner(PAGER);
});
